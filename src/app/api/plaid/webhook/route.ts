import { NextResponse, after } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { syncItem, verifyWebhook } from '@/lib/money/plaid'

// Plaid → us. Public URL, so every call is verified (signed ES256 JWT in the
// Plaid-Verification header + body hash) before anything happens. Transaction
// updates run /transactions/sync to the end (after the 200, so Plaid isn't kept
// waiting on a 2-year history); an item that needs the user to log in again is
// flagged so the admin UI can say so.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNC_CODES = ['SYNC_UPDATES_AVAILABLE', 'HISTORICAL_UPDATE', 'INITIAL_UPDATE', 'DEFAULT_UPDATE']

export async function POST(req: Request) {
  const raw = await req.text()
  if (!(await verifyWebhook(raw, req.headers.get('plaid-verification')))) {
    console.error('[plaid] webhook rejected: bad or missing Plaid-Verification JWT')
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })

  const ev = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } | null }
  console.log(`[plaid] webhook ${ev.webhook_type}/${ev.webhook_code} item=${ev.item_id ?? '-'}`)
  if (!ev.item_id) return NextResponse.json({ ok: true })
  const itemId = ev.item_id
  const id = encodeURIComponent(itemId)

  if (ev.webhook_type === 'TRANSACTIONS' && SYNC_CODES.includes(ev.webhook_code ?? '')) {
    after(async () => {
      const r = await syncItem(db, itemId)
      console.log(`[plaid] webhook sync ${itemId}: ${r.error ? `error ${r.error}` : `+${r.added} ~${r.modified} -${r.removed}${r.more ? ' (more)' : ''}${r.pending ? ' (pending)' : ''}`}`)
    })
    return NextResponse.json({ ok: true })
  }
  if (ev.webhook_type === 'ITEM' && ['ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED'].includes(ev.webhook_code ?? '')) {
    const r = await db.patch('plaid_items', `id=eq.${id}`, {
      status: 'needs_reauth', updated_at: new Date().toISOString(),
      last_error: `Plaid ${ev.webhook_code}${ev.error?.error_code ? `: ${ev.error.error_code}` : ''}`,
    })
    if (!r.ok) await db.patch('plaid_items', `id=eq.${id}`, { status: 'needs_reauth', updated_at: new Date().toISOString() })
  }
  return NextResponse.json({ ok: true })
}
