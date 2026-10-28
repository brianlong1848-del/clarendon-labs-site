import { NextResponse, after } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { claimStaleItems, itemStatuses, syncItem } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET: sync status for the Money tab (web and Studio): per bank, last clean
// sync, item status, last error, Plaid transactions imported. Sync-on-open:
// a bank with no clean sync in 12 h gets one in the background after this
// responds (at most one attempt per 15 min); `syncing` lists those items so
// the screen can quietly re-read the status in a little while.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    const items = await itemStatuses(db)
    const syncing = await claimStaleItems(db, items)
    if (syncing.length) {
      after(async () => {
        for (const itemId of syncing) {
          const r = await syncItem(db, itemId)
          console.log(`[plaid] sync-on-open ${itemId}: ${r.error ? `error ${r.error}` : `+${r.added ?? 0} ~${r.modified ?? 0} -${r.removed ?? 0}${r.more ? ' (more)' : ''}${r.pending ? ' (pending)' : ''}`}`)
        }
      })
    }
    return NextResponse.json({ items, syncing })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// POST: manual "Sync now" for every connected item (the webhook and the daily
// cron do this on their own). Each result carries its own error/pending flag; the status comes back too.
export async function POST() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const items = await db.select<{ id: string }[]>('plaid_items', 'select=id')
  if (!items.ok) return NextResponse.json({ error: items.error }, { status: 500 })
  const results = await Promise.all(items.data.map((i) => syncItem(db, i.id)))
  return NextResponse.json({ results, items: await itemStatuses(db).catch(() => []) })
}
