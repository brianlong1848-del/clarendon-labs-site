import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { syncHousehold } from '@/lib/money/plaidInvestments'

// Vercel Cron, daily after the US market close (vercel.json: 03:00 UTC =
// 21:00 CST / 22:00 CDT): every household Plaid item — banks and cards run
// /transactions/sync, brokerages re-pull holdings and investment transactions.
// The business plaid-sync cron keeps running on its own schedule for the
// studio items; this one only looks at scope = 'household'.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    const results = await syncHousehold(db)
    for (const r of results) console.log(`[household] cron ${r.institution ?? r.itemId}: tx ${r.transactions?.error ?? `+${r.transactions?.added ?? 0}`} · inv ${r.investments?.error ?? `${r.investments?.holdings ?? 0} holdings`}`)
    const failed = results.filter((r) => r.transactions?.error || (r.investments?.error && r.investments.error !== 'pending')).length
    return NextResponse.json({ items: results.length, failed, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
