import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { ensureWebhook, syncItem } from '@/lib/money/plaid'

// Vercel Cron, daily (vercel.json, before money-recurring): runs
// /transactions/sync for every connected bank so the ledger stays current
// even when Plaid's webhook doesn't fire. syncItem stamps last_synced_at on
// every clean run (0 new transactions included) and last_error when it fails;
// an item that needs a re-login is flagged needs_reauth for the Today banner.
// While it has the token out, it also checks the item's webhook URL and
// points it at PLAID_WEBHOOK_URL when it differs.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const items = await db.select<{ id: string; institution: string | null }[]>('plaid_items', 'select=id,institution&order=institution')
  if (!items.ok) return NextResponse.json({ error: items.error }, { status: 500 })

  const results = await Promise.all(items.data.map(async (i) => {
    const sync = await syncItem(db, i.id)
    const webhook = await ensureWebhook(db, i.id, i.institution)
    console.log(`[plaid] cron ${i.institution ?? i.id}: ${sync.error ? `error ${sync.error}` : `+${sync.added ?? 0} ~${sync.modified ?? 0} -${sync.removed ?? 0}${sync.more ? ' (more)' : ''}${sync.pending ? ' (pending)' : ''}`} · webhook ${webhook.webhook}`)
    return { institution: i.institution, sync, webhook: webhook.webhook, webhookError: webhook.error }
  }))
  const failed = results.filter((r) => r.sync.error).length
  return NextResponse.json({ items: results.length, failed, results })
}
