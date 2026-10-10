import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { itemStatuses, syncItem } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET: sync status for the Money tab (web and Studio): per bank, last clean
// sync, item status, last error, Plaid transactions imported.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    return NextResponse.json({ items: await itemStatuses(db) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// POST: manual "Sync now" for every connected item (the webhook does this on
// its own). Each result carries its own error/pending flag; the status comes back too.
export async function POST() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const items = await db.select<{ id: string }[]>('plaid_items', 'select=id')
  if (!items.ok) return NextResponse.json({ error: items.error }, { status: 500 })
  const results = await Promise.all(items.data.map((i) => syncItem(db, i.id)))
  return NextResponse.json({ results, items: await itemStatuses(db).catch(() => []) })
}
