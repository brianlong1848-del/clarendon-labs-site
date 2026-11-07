// ─── Market data: Financial Modeling Prep (Household) ────────────────────────
//
// SERVER ONLY. Env FMP_API_KEY (Vercel + ~/code/clarendon-labs/secrets/fmp.env).
// Never called from the browser; every read goes through the `quotes` and
// `fmp_cache` tables so the free tier's 250 calls/day go a long way.
//
// What the free tier gives us (checked 2026-11-07 against /stable):
//   /quote?symbol=X        one US stock at a time (ETFs, mutual funds and the
//                          comma list are "premium"; batch-quote is restricted)
//   /profile, /ratios-ttm, /grades-consensus, /price-target-consensus,
//   /analyst-estimates, /dividends, /search-symbol   fine
//   /news/stock, /search-cusip, /search-isin           restricted (402)
// Anything FMP refuses with 402 is remembered in fmp_cache for a week so the
// same ticker isn't retried every refresh; the UI then shows Plaid's close
// (securities.close_price) and says so. Upgrading to Starter lifts all of this
// without a code change — the 402 markers simply expire.
//
// Cache rules (spec D): a quote is fresh for 15 min on weekdays 8:30–15:00 CT,
// 12 h otherwise. Slow endpoints cache 24 h. One cron at 15:15 CT snapshots
// the close. The daily call count lives in household_settings.fmp_calls_today.

import type { StudioDb } from '@/lib/money/studioDb'

const BASE = 'https://financialmodelingprep.com/stable'
export const FMP_DAILY_CAP = 250
export const fmpConfigured = () => !!process.env.FMP_API_KEY

export type Quote = {
  ticker: string; price: number; change_pct: number | null; day_low: number | null; day_high: number | null
  year_low: number | null; year_high: number | null; market_cap: number | null; pe: number | null
  as_of: string; source: 'fmp' | 'plaid'
}

// ── Chicago clock ────────────────────────────────────────────────────────────
function chicago(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { weekday: get('weekday'), hour: Number(get('hour')) % 24, minute: Number(get('minute')), day: `${get('year')}-${get('month')}-${get('day')}` }
}
/** Weekdays 8:30–15:00 Central. (Market holidays count as open; it only costs a few extra calls.) */
export function marketOpenNow(now = new Date()) {
  const c = chicago(now)
  if (c.weekday === 'Sat' || c.weekday === 'Sun') return false
  const m = c.hour * 60 + c.minute
  return m >= 8 * 60 + 30 && m < 15 * 60
}
export const quoteTtlMs = (now = new Date()) => (marketOpenNow(now) ? 15 * 60_000 : 12 * 3600_000)
export const chicagoDay = (now = new Date()) => chicago(now).day

// ── Settings helpers (household_settings is a key → jsonb table) ────────────
export async function getSetting<T = unknown>(db: StudioDb, key: string): Promise<T | null> {
  const r = await db.select<{ value: T }[]>('household_settings', `select=value&key=eq.${encodeURIComponent(key)}`)
  return r.ok && r.data[0] ? r.data[0].value : null
}
export async function setSetting(db: StudioDb, key: string, value: unknown, updatedBy: string | null = null) {
  const r = await db.upsert('household_settings', [{ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }], 'key')
  if (!r.ok) console.error(`[fmp] setting ${key}: ${r.error}`)
}

// ── Call counter ─────────────────────────────────────────────────────────────
type CallsToday = { day: string; count: number; last_error?: string | null; last_call_at?: string }
export async function fmpCallsToday(db: StudioDb): Promise<CallsToday> {
  const v = await getSetting<CallsToday>(db, 'fmp_calls_today')
  const day = chicagoDay()
  return v && v.day === day ? v : { day, count: 0 }
}

type FmpResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; quota?: boolean; premium?: boolean }

/** One FMP call, counted. 402 = not on this plan; 429 = out of calls. */
export async function fmp<T = unknown>(db: StudioDb, path: string, params: Record<string, string> = {}): Promise<FmpResult<T>> {
  const key = process.env.FMP_API_KEY
  if (!key) return { ok: false, status: 0, error: 'FMP_API_KEY is not set' }
  const calls = await fmpCallsToday(db)
  if (calls.count >= FMP_DAILY_CAP) return { ok: false, status: 429, error: `FMP daily cap reached (${FMP_DAILY_CAP})`, quota: true }
  const qs = new URLSearchParams({ ...params, apikey: key }).toString()
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  } catch (e) {
    const error = `FMP ${path}: ${e instanceof Error ? e.message : 'network error'}`
    await setSetting(db, 'fmp_calls_today', { ...calls, count: calls.count + 1, last_error: error, last_call_at: new Date().toISOString() })
    return { ok: false, status: 0, error }
  }
  const text = await res.text()
  const next: CallsToday = { ...calls, count: calls.count + 1, last_call_at: new Date().toISOString(), last_error: res.ok ? null : `HTTP ${res.status} on ${path}` }
  await setSetting(db, 'fmp_calls_today', next)
  if (!res.ok) {
    const msg = text.replace(/apikey=[^&"\s]+/g, 'apikey=…').slice(0, 200)
    return { ok: false, status: res.status, error: `FMP ${path}: HTTP ${res.status} ${msg}`.trim(), quota: res.status === 429, premium: res.status === 402 || res.status === 403 }
  }
  try { return { ok: true, data: JSON.parse(text) as T } } catch { return { ok: false, status: res.status, error: `FMP ${path}: not JSON` } }
}

// ── Slow endpoints, cached 24 h in fmp_cache ────────────────────────────────
const UNSUPPORTED_TTL_MS = 7 * 86400_000
async function cacheGet(db: StudioDb, key: string, ttlMs: number): Promise<{ hit: true; value: unknown } | { hit: false }> {
  const r = await db.select<{ value: unknown; fetched_at: string }[]>('fmp_cache', `select=value,fetched_at&key=eq.${encodeURIComponent(key)}`)
  const row = r.ok ? r.data[0] : undefined
  if (row && Date.now() - Date.parse(row.fetched_at) < ttlMs) return { hit: true, value: row.value }
  return { hit: false }
}
async function cachePut(db: StudioDb, key: string, value: unknown) {
  await db.upsert('fmp_cache', [{ key, value, fetched_at: new Date().toISOString() }], 'key')
}

/** `endpoint` is the path after /stable, e.g. 'profile', 'ratios-ttm', 'grades-consensus'.
 *  Returns null when FMP has nothing (or the plan doesn't include it) — the caller labels it. */
export async function fmpCached<T = unknown>(db: StudioDb, endpoint: string, params: Record<string, string>, ttlHours = 24): Promise<T | null> {
  const id = Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&')
  const key = `${endpoint}:${id}`
  const c = await cacheGet(db, key, ttlHours * 3600_000)
  if (c.hit) return (c.value as { unsupported?: boolean; data?: T })?.unsupported ? null : ((c.value as { data: T }).data ?? null)
  const r = await fmp<T>(db, endpoint, params)
  if (r.ok) { await cachePut(db, key, { data: r.data }); return r.data }
  if (r.premium) { await cachePut(db, key, { unsupported: true, status: r.status }); return null }
  if (r.quota) return null
  console.error(`[fmp] ${r.error}`)
  return null
}

// ── Quotes ───────────────────────────────────────────────────────────────────
type FmpQuote = { symbol: string; price: number; changePercentage?: number; dayLow?: number; dayHigh?: number; yearLow?: number; yearHigh?: number; marketCap?: number; pe?: number; timestamp?: number }

const quoteRow = (q: FmpQuote): Omit<Quote, 'source'> & { source: 'fmp' } => ({
  ticker: q.symbol, price: q.price, change_pct: q.changePercentage ?? null, day_low: q.dayLow ?? null, day_high: q.dayHigh ?? null,
  year_low: q.yearLow ?? null, year_high: q.yearHigh ?? null,
  market_cap: typeof q.marketCap === 'number' ? Math.round(q.marketCap) : null, pe: q.pe ?? null,
  as_of: new Date().toISOString(), source: 'fmp',
})

/** Tickers worth quoting: every held security with a ticker, plus the watchlist setting. */
export async function heldTickers(db: StudioDb): Promise<string[]> {
  const [h, watch] = await Promise.all([
    db.select<{ security_id: string }[]>('holdings', 'select=security_id'),
    getSetting<string[]>(db, 'watchlist'),
  ])
  const ids = h.ok ? Array.from(new Set(h.data.map((x) => x.security_id))) : []
  const secs = ids.length ? await db.select<{ ticker: string | null; is_cash_equivalent: boolean | null; type: string | null }[]>('securities', `select=ticker,is_cash_equivalent,type&id=in.(${ids.map(encodeURIComponent).join(',')})`) : { ok: true as const, data: [] }
  const out = new Set<string>()
  for (const s of secs.ok ? secs.data : []) if (s.ticker && !s.is_cash_equivalent && s.type !== 'cash' && /^[A-Z.\-]{1,10}$/.test(s.ticker)) out.add(s.ticker)
  for (const t of watch ?? []) if (typeof t === 'string' && /^[A-Z.\-]{1,10}$/.test(t)) out.add(t)
  return Array.from(out).sort()
}

/**
 * Bring the `quotes` table up to date for these tickers: skip anything fresh
 * (unless `force`), skip anything FMP said is premium (for a week), and stop at
 * the daily cap. Returns how many calls were spent.
 */
export async function refreshQuotes(db: StudioDb, tickers: string[], opts: { force?: boolean } = {}): Promise<{ refreshed: string[]; skipped: string[]; errors: string[] }> {
  const out = { refreshed: [] as string[], skipped: [] as string[], errors: [] as string[] }
  if (!tickers.length || !fmpConfigured()) return out
  const ttl = quoteTtlMs()
  const have = await db.select<{ ticker: string; as_of: string }[]>('quotes', `select=ticker,as_of&ticker=in.(${tickers.map(encodeURIComponent).join(',')})`)
  const fresh = new Map((have.ok ? have.data : []).map((q) => [q.ticker, Date.parse(q.as_of)]))
  for (const t of tickers) {
    if (!opts.force && fresh.has(t) && Date.now() - fresh.get(t)! < ttl) { out.skipped.push(t); continue }
    const unsupported = await cacheGet(db, `unsupported:quote:${t}`, UNSUPPORTED_TTL_MS)
    if (unsupported.hit) { out.skipped.push(t); continue }
    const r = await fmp<FmpQuote[]>(db, 'quote', { symbol: t })
    if (!r.ok) {
      if (r.quota) { out.errors.push(r.error); break }
      if (r.premium) { await cachePut(db, `unsupported:quote:${t}`, { status: r.status }); out.skipped.push(t); continue }
      out.errors.push(r.error); continue
    }
    const q = Array.isArray(r.data) ? r.data[0] : undefined
    if (!q || typeof q.price !== 'number') { await cachePut(db, `unsupported:quote:${t}`, { status: 204 }); out.skipped.push(t); continue }
    const up = await db.upsert('quotes', [quoteRow(q)], 'ticker')
    if (!up.ok) out.errors.push(up.error); else out.refreshed.push(t)
  }
  return out
}

/**
 * The price to show for every ticker: FMP's quote when we have one, else
 * Plaid's last close (labelled `source: 'plaid'`). Call refreshQuotes first
 * when freshness matters; this never calls FMP.
 */
export async function quotesFor(db: StudioDb, tickers: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {}
  if (!tickers.length) return out
  const list = tickers.map(encodeURIComponent).join(',')
  const [q, s] = await Promise.all([
    db.select<Quote[]>('quotes', `select=ticker,price,change_pct,day_low,day_high,year_low,year_high,market_cap,pe,as_of&ticker=in.(${list})`),
    db.select<{ ticker: string; close_price: number | null; close_price_as_of: string | null }[]>('securities', `select=ticker,close_price,close_price_as_of&ticker=in.(${list})`),
  ])
  for (const r of q.ok ? q.data : []) out[r.ticker] = { ...r, source: 'fmp' }
  for (const r of s.ok ? s.data : []) {
    if (out[r.ticker] || r.close_price == null) continue
    out[r.ticker] = { ticker: r.ticker, price: r.close_price, change_pct: null, day_low: null, day_high: null, year_low: null, year_high: null, market_cap: null, pe: null, as_of: r.close_price_as_of ? `${r.close_price_as_of}T21:00:00Z` : new Date(0).toISOString(), source: 'plaid' }
  }
  return out
}

/** Plaid sometimes returns funds without a ticker; try FMP's CUSIP lookup (premium on the free tier — cached as unsupported if so). */
export async function fillTickersByCusip(db: StudioDb): Promise<number> {
  const r = await db.select<{ id: string; cusip: string }[]>('securities', 'select=id,cusip&ticker=is.null&cusip=not.is.null&is_cash_equivalent=is.false')
  if (!r.ok || !r.data.length) return 0
  let n = 0
  for (const s of r.data.slice(0, 20)) {
    const hit = await fmpCached<{ symbol?: string }[]>(db, 'search-cusip', { cusip: s.cusip }, 24 * 7)
    const sym = hit?.[0]?.symbol
    if (sym) { await db.patch('securities', `id=eq.${encodeURIComponent(s.id)}`, { ticker: sym }); n++ }
  }
  return n
}

/** What the Settings page shows: configured, calls today vs cap, last error. */
export async function fmpStatus(db: StudioDb) {
  const calls = await fmpCallsToday(db)
  return { configured: fmpConfigured(), callsToday: calls.count, cap: FMP_DAILY_CAP, lastError: calls.last_error ?? null, lastCallAt: calls.last_call_at ?? null, marketOpen: marketOpenNow() }
}

// ── Advisor inputs (on demand, cached 24 h) ──────────────────────────────────
export type TickerContext = {
  ticker: string
  profile: { sector?: string; industry?: string; companyName?: string; isEtf?: boolean; isFund?: boolean; beta?: number; description?: string } | null
  ratios: Record<string, number> | null
  grades: { consensus?: string; strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number } | null
  target: { targetConsensus?: number; targetHigh?: number; targetLow?: number; targetMedian?: number } | null
  dividends: { date?: string; dividend?: number; yield?: number; frequency?: string }[] | null
  news: { title?: string; publishedDate?: string; site?: string; url?: string; text?: string }[] | null
}
export async function tickerContext(db: StudioDb, ticker: string): Promise<TickerContext> {
  const [profile, ratios, grades, target, dividends, news] = await Promise.all([
    fmpCached<TickerContext['profile'][]>(db, 'profile', { symbol: ticker }),
    fmpCached<Record<string, number>[]>(db, 'ratios-ttm', { symbol: ticker }),
    fmpCached<TickerContext['grades'][]>(db, 'grades-consensus', { symbol: ticker }),
    fmpCached<TickerContext['target'][]>(db, 'price-target-consensus', { symbol: ticker }),
    fmpCached<NonNullable<TickerContext['dividends']>>(db, 'dividends', { symbol: ticker, limit: '4' }),
    fmpCached<NonNullable<TickerContext['news']>>(db, 'news/stock', { symbols: ticker, limit: '5' }),
  ])
  const pick = (r: Record<string, number> | null | undefined) => {
    if (!r) return null
    const keep = ['priceToEarningsRatioTTM', 'priceToSalesRatioTTM', 'priceToBookRatioTTM', 'dividendYieldTTM', 'netProfitMarginTTM', 'debtToEquityRatioTTM', 'freeCashFlowPerShareTTM', 'returnOnEquityTTM']
    const o: Record<string, number> = {}
    for (const k of keep) if (typeof r[k] === 'number') o[k] = Math.round(r[k] * 1000) / 1000
    return Object.keys(o).length ? o : null
  }
  const p = profile?.[0] ?? null
  return {
    ticker,
    profile: p ? { sector: p.sector, industry: p.industry, companyName: p.companyName, isEtf: p.isEtf, isFund: p.isFund, beta: p.beta, description: p.description?.slice(0, 300) } : null,
    ratios: pick(ratios?.[0]),
    grades: grades?.[0] ?? null,
    target: target?.[0] ?? null,
    dividends: dividends?.slice(0, 4).map((d) => ({ date: d.date, dividend: d.dividend, yield: d.yield, frequency: d.frequency })) ?? null,
    news: news?.slice(0, 5).map((n) => ({ title: n.title, publishedDate: n.publishedDate, site: n.site, url: n.url, text: n.text?.slice(0, 240) })) ?? null,
  }
}
