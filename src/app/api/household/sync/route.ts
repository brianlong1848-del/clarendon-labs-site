import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { itemStatuses } from '@/lib/money/plaid'
import { syncHousehold } from '@/lib/money/plaidInvestments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET: household items' sync status (per institution: products, last clean
// sync, status, last error, accounts with balances). POST: "Sync now" for every
// household item — banks via /transactions/sync, brokerages via holdings +
// investment transactions. Studio items are never touched from here.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    return NextResponse.json({ items: await itemStatuses(db, 'household') })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function POST() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    const results = await syncHousehold(db)
    return NextResponse.json({ results, items: await itemStatuses(db, 'household').catch(() => []) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
