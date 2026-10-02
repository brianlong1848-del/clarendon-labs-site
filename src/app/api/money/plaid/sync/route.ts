import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { syncItem } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Manual "sync now" for every connected item (the webhook does this on its own).
export async function POST() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const items = await db.select<{ id: string }[]>('plaid_items', 'select=id')
  if (!items.ok) return NextResponse.json({ error: items.error }, { status: 500 })
  return NextResponse.json({ results: await Promise.all(items.data.map((i) => syncItem(db, i.id))) })
}
