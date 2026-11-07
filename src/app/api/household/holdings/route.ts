import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { buildPicture } from '@/lib/household/portfolio'
import { tickerContext } from '@/lib/household/marketData'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET            every holding, priced (live or close, labelled), with weight, gain and bucket
// GET ?ticker=X  the detail drawer: FMP profile / range / dividends / news (24 h cache; may spend
//                a few FMP calls the first time), every lot and transaction behind the position
export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const ticker = new URL(req.url).searchParams.get('ticker')?.toUpperCase().trim() || null
  try {
    if (!ticker) {
      const p = await buildPicture(db, { refreshQuotes: true })
      return NextResponse.json({ asOf: p.asOf, holdings: p.holdings, investments_cents: p.netWorth.investments_cents, fmp: p.fmp, concentration: p.concentration })
    }
    if (!/^[A-Z.\-]{1,10}$/.test(ticker)) return NextResponse.json({ error: 'bad ticker' }, { status: 400 })
    const secs = await db.select<{ id: string }[]>('securities', `select=id&ticker=eq.${encodeURIComponent(ticker)}`)
    const ids = secs.ok ? secs.data.map((s) => s.id) : []
    const [context, lots, picture] = await Promise.all([
      tickerContext(db, ticker),
      ids.length ? db.select<unknown[]>('investment_transactions', `select=id,account_id,posted_on,type,subtype,quantity,price,amount_cents,fees_cents,name&security_id=in.(${ids.map(encodeURIComponent).join(',')})&order=posted_on.desc&limit=200`) : Promise.resolve({ ok: true as const, data: [] as unknown[] }),
      buildPicture(db),
    ])
    const positions = picture.holdings.filter((h) => h.ticker === ticker)
    const quote = positions[0] ? { price: positions[0].price, source: positions[0].price_source, as_of: positions[0].price_as_of, change_pct: positions[0].change_pct } : null
    const q = await db.select<Record<string, unknown>[]>('quotes', `select=*&ticker=eq.${encodeURIComponent(ticker)}`)
    return NextResponse.json({ ticker, quote, range: q.ok ? q.data[0] ?? null : null, context, positions, lots: lots.ok ? lots.data : [], accounts: picture.accounts.map((a) => ({ id: a.id, name: a.name, mask: a.mask, institution: a.institution })) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
