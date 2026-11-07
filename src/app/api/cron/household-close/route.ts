import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { fillTickersByCusip, heldTickers, refreshQuotes } from '@/lib/household/marketData'

// Vercel Cron (vercel.json: 21:15 UTC = 15:15 CST / 16:15 CDT, after the US
// close either way): snapshot the closing price of every held ticker into
// `quotes`, and give fund tickers Plaid left blank another try via CUSIP.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const filled = await fillTickersByCusip(db).catch(() => 0)
  const tickers = await heldTickers(db)
  const r = await refreshQuotes(db, tickers, { force: true })
  console.log(`[household] close snapshot: ${r.refreshed.length} refreshed, ${r.skipped.length} skipped, ${r.errors.length} errors, ${filled} tickers filled`)
  return NextResponse.json({ tickers: tickers.length, filled, ...r })
}
