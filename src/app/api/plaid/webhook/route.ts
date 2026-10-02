import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { syncItem, verifyWebhook } from '@/lib/money/plaid'

// Plaid → us. Public URL, so every call is verified (signed JWT + body hash)
// before anything happens. Transaction updates trigger a sync; an item that
// needs the user to log in again is flagged so the admin UI can say so.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const raw = await req.text()
  if (!(await verifyWebhook(raw, req.headers.get('plaid-verification')))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })

  const ev = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string }
  if (!ev.item_id) return NextResponse.json({ ok: true })
  const id = encodeURIComponent(ev.item_id)

  if (ev.webhook_type === 'TRANSACTIONS' &&
      ['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE'].includes(ev.webhook_code ?? '')) {
    return NextResponse.json({ ok: true, ...(await syncItem(db, ev.item_id)) })
  }
  if (ev.webhook_type === 'ITEM' && ['ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED'].includes(ev.webhook_code ?? '')) {
    await db.patch('plaid_items', `id=eq.${id}`, { status: 'needs_reauth', updated_at: new Date().toISOString() })
  }
  return NextResponse.json({ ok: true })
}
