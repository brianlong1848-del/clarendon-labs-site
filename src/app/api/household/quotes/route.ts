import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { fmpStatus, heldTickers, quotesFor, refreshQuotes } from '@/lib/household/marketData'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Prices for every held ticker (+ watchlist). Serves the cache; refreshes what
// is stale under the 15-min / 12-h rule first (POST with { force: true } or
// ?force=1 ignores the rule — the Settings "Refresh prices" button). Each quote
// says whether it is FMP's live price or Plaid's last close.
async function respond(force: boolean) {
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const tickers = await heldTickers(db)
  const refresh = await refreshQuotes(db, tickers, { force })
  const quotes = await quotesFor(db, tickers)
  return NextResponse.json({ tickers, quotes, refresh, fmp: await fmpStatus(db) })
}
export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  return respond(new URL(req.url).searchParams.get('force') === '1')
}
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  return respond(!!b.force)
}
