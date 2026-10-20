// ─── App Store Connect API ───────────────────────────────────────────────────
//
// Installs + proceeds per app, from the daily Sales Reports. Needs four env
// vars from an App Store Connect API key (Users and Access → Integrations →
// App Store Connect API — an Admin or Finance role key, to read sales):
//   ASC_KEY_ID          the key's Key ID
//   ASC_ISSUER_ID       the Issuer ID shown on the same Integrations page
//   ASC_PRIVATE_KEY     the .p8 file's contents, newlines kept as \n
//   ASC_VENDOR_NUMBER   Agreements, Tax, and Banking → the vendor number
//
// WHAT COUNTS AS AN INSTALL. A sales report row's Units covers several very
// different things, told apart by its Product Type Identifier:
//   1 · 1F · 1T · F1   first-time downloads          → installs
//   3 · 3F · 3T · F3   re-downloads (same Apple ID)  → redownloads
//   7 · 7F · 7T · F7   updates                       → updates
// Counting all three as "downloads" (what the first version of this file did)
// overstates installs badly once an app has users receiving updates.
//
// WHERE THE MONEY IS. In-app purchases and subscriptions are rows of their
// own, with their OWN Apple Identifier — they point back to the app through
// Parent Identifier, which holds the app's SKU. So proceeds = the app's rows
// plus every row whose parent is the app's SKU. The SKU comes from the API
// (/v1/apps/{id}), not the report, because a day with zero downloads has no
// app row to read it from while still having purchases.
//
// CURRENCY. Developer Proceeds is per unit, in "Currency of Proceeds" — which
// varies by storefront (USD, CAD, EUR…). Only USD is summed into `proceeds`;
// any other currency seen is listed in `otherCurrencies` so the dashboard can
// say so rather than silently adding euros to dollars. Finance reports give
// converted totals, but only monthly.
//
// Reports publish with a day or two of lag. Past days never change, so each
// day's parsed report is cached for the life of the server instance and shared
// across every app — one download per day, not one per app.

import { createSign } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const API = 'https://api.appstoreconnect.apple.com'
const WINDOW_DAYS = 30
const LOOKBACK_DAYS = WINDOW_DAYS + 5 // room for the publishing lag

const INSTALL = new Set(['1', '1F', '1T', 'F1'])
const REDOWNLOAD = new Set(['3', '3F', '3T', 'F3'])
const UPDATE = new Set(['7', '7F', '7T', 'F7'])

export type Row = {
  appleId: string
  parent: string
  type: string
  units: number
  proceeds: number // per unit
  currency: string
  country: string // storefront, ISO 3166-1 alpha-2 (e.g. "US")
}

export type AppStoreMetrics = {
  /** Most recent day with a published report. */
  reportDate: string
  /** That day alone. */
  day: { installs: number; redownloads: number; updates: number; proceeds: number }
  /** Summed over the last 30 published days. */
  last30: { installs: number; redownloads: number; updates: number; proceeds: number; days: number }
  /** Non-USD proceeds currencies seen in the window (not included in proceeds). */
  otherCurrencies: string[]
  /** Last-30-day installs and USD proceeds by storefront country, most installs first. */
  countries: { code: string; installs: number; proceeds: number }[]
  /** One point per published day in the window, oldest first — for charts. */
  series: { date: string; installs: number; proceeds: number }[]
  /** Longer view, from Apple's monthly reports plus this month's daily ones. */
  history?: AppStoreHistory
} | null

export type Tally = { installs: number; proceeds: number }
export type AppStoreHistory = {
  /** Jan 1 of this year through the latest published day. */
  ytd: Tally & { from: string; to: string }
  /** The same stretch of last year (this month's share estimated from last
   *  year's whole month, by days elapsed). */
  prevYtd: Tally & { from: string; to: string }
  /** Every month of last year and this year, oldest first ('2026-07'). */
  months: (Tally & { month: string })[]
  /** Since the app's first sale or install in the data we have. */
  allTime: Tally
}

export function signAppStoreJWT(): string | null {
  const keyId = process.env.ASC_KEY_ID
  const issuerId = process.env.ASC_ISSUER_ID
  const privateKey = process.env.ASC_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !issuerId || !privateKey) return null

  const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const signingInput = `${b64url({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64url({
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1',
  })}`

  try {
    const sign = createSign('SHA256')
    sign.update(signingInput)
    sign.end()
    // ASC wants the raw R||S signature (IEEE P1363), not the DER encoding
    // Node's default ECDSA signing produces.
    const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    return `${signingInput}.${signature.toString('base64url')}`
  } catch {
    return null
  }
}

// ─── Per-instance caches ─────────────────────────────────────────────────────

export type DayResult = Row[] | 'missing' | 'error'
const dayCache = new Map<string, { at: number; value: Promise<DayResult> }>()
const skuCache = new Map<string, Promise<string | null>>()
const MISSING_TTL_MS = 60 * 60 * 1000 // re-ask about unpublished days hourly

async function fetchDay(date: string, jwt: string, vendor: string): Promise<DayResult> {
  const params = new URLSearchParams({
    'filter[frequency]': 'DAILY',
    'filter[reportDate]': date,
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': vendor,
    'filter[version]': '1_0',
  })
  try {
    const res = await fetch(`${API}/v1/salesReports?${params}`, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/a-gzip' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) return 'missing' // not published yet, or no sales at all that day
    if (!res.ok) return 'error'

    return parseReport(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf-8'))
  } catch {
    return 'error'
  }
}

function parseReport(tsv: string): DayResult {
  {
    const [headerLine, ...lines] = tsv.trim().split('\n')
    const cols = headerLine.split('\t').map((c) => c.trim())
    const at = (name: string) => cols.indexOf(name)
    const iId = at('Apple Identifier'), iParent = at('Parent Identifier'), iType = at('Product Type Identifier')
    const iUnits = at('Units'), iProceeds = at('Developer Proceeds'), iCur = at('Currency of Proceeds')
    const iCountry = at('Country Code')
    if (iId === -1 || iUnits === -1 || iType === -1) return 'error'

    return lines.map((line) => {
      const c = line.split('\t')
      return {
        appleId: (c[iId] ?? '').trim(),
        parent: iParent === -1 ? '' : (c[iParent] ?? '').trim(),
        type: (c[iType] ?? '').trim(),
        units: Number(c[iUnits] ?? 0) || 0,
        proceeds: iProceeds === -1 ? 0 : Number(c[iProceeds] ?? 0) || 0,
        currency: iCur === -1 ? 'USD' : (c[iCur] ?? '').trim(),
        country: iCountry === -1 ? '' : (c[iCountry] ?? '').trim().toUpperCase(),
      }
    })
  }
}

export function getDay(date: string, jwt: string, vendor: string): Promise<DayResult> {
  const hit = dayCache.get(date)
  if (hit) {
    // Keep good reports forever; retry errors immediately and "missing" hourly.
    const stale = hit.value.then((v) =>
      v === 'error' || (v === 'missing' && Date.now() - hit.at > MISSING_TTL_MS),
    )
    return stale.then((isStale) => (isStale ? refetch() : hit.value))
  }
  return refetch()

  function refetch() {
    const value = fetchDay(date, jwt, vendor)
    dayCache.set(date, { at: Date.now(), value })
    if (dayCache.size > LOOKBACK_DAYS * 2) {
      const oldest = Array.from(dayCache.keys()).sort()[0]
      dayCache.delete(oldest)
    }
    return value
  }
}

export function getSku(appleAppId: string, jwt: string): Promise<string | null> {
  const hit = skuCache.get(appleAppId)
  if (hit) return hit
  const value = fetch(`${API}/v1/apps/${appleAppId}?fields[apps]=sku`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
    .then(async (res) => (res.ok ? ((await res.json())?.data?.attributes?.sku as string) ?? null : null))
    .catch(() => null)
  skuCache.set(appleAppId, value)
  // Don't cache a failed lookup forever.
  value.then((sku) => { if (!sku) skuCache.delete(appleAppId) })
  return value
}

// Monthly summary reports: one per completed month, published ~5 days after
// the month ends, never changing after that — so they're cached for the life
// of the instance (and shared across apps).
const monthCache = new Map<string, { at: number; value: Promise<DayResult> }>()

async function fetchMonth(ym: string, jwt: string, vendor: string): Promise<DayResult> {
  const params = new URLSearchParams({
    'filter[frequency]': 'MONTHLY', 'filter[reportDate]': ym, 'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY', 'filter[vendorNumber]': vendor, 'filter[version]': '1_0',
  })
  try {
    const res = await fetch(`${API}/v1/salesReports?${params}`, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/a-gzip' }, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) return 'missing'
    if (!res.ok) return 'error'
    return parseReport(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf-8'))
  } catch { return 'error' }
}

function getMonth(ym: string, jwt: string, vendor: string): Promise<DayResult> {
  const hit = monthCache.get(ym)
  if (hit) {
    const stale = hit.value.then((v) => v === 'error' || (v === 'missing' && Date.now() - hit.at > MISSING_TTL_MS))
    return stale.then((isStale) => (isStale ? load() : hit.value))
  }
  return load()
  function load() { const value = fetchMonth(ym, jwt, vendor); monthCache.set(ym, { at: Date.now(), value }); return value }
}

// ─── Tally ───────────────────────────────────────────────────────────────────

type CountryTotals = Map<string, { installs: number; proceeds: number }>

function tally(rows: Row[], appleAppId: string, sku: string | null, other: Set<string>,
               countries?: CountryTotals) {
  const t = { installs: 0, redownloads: 0, updates: 0, proceeds: 0 }
  for (const r of rows) {
    const isApp = r.appleId === appleAppId
    const isChild = !!sku && r.parent === sku && !isApp
    if (!isApp && !isChild) continue

    const install = isApp && INSTALL.has(r.type)
    if (install) t.installs += r.units
    else if (isApp && REDOWNLOAD.has(r.type)) t.redownloads += r.units
    else if (isApp && UPDATE.has(r.type)) t.updates += r.units

    const amount = r.units * r.proceeds
    const usd = r.currency === 'USD' ? amount : 0
    if (amount !== 0 && r.currency !== 'USD' && r.currency) other.add(r.currency)
    t.proceeds += usd

    if (countries && r.country && (install || usd !== 0)) {
      const c = countries.get(r.country) ?? { installs: 0, proceeds: 0 }
      if (install) c.installs += r.units
      c.proceeds += usd
      countries.set(r.country, c)
    }
  }
  return t
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function fetchAppStore(appleAppId: string): Promise<AppStoreMetrics> {
  const jwt = signAppStoreJWT()
  const vendor = process.env.ASC_VENDOR_NUMBER
  if (!jwt || !vendor) return null

  const dates = Array.from({ length: LOOKBACK_DAYS }, (_, i) =>
    new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10),
  )
  const [sku, ...days] = await Promise.all([
    getSku(appleAppId, jwt),
    ...dates.map((d) => getDay(d, jwt, vendor)),
  ])

  // Newest first. A 'missing' day inside the window after the first published
  // one is a real zero-sales day, not lag — still counts toward the 30.
  const firstPublished = days.findIndex((d) => Array.isArray(d))
  if (firstPublished === -1) return null
  const window = days.slice(firstPublished, firstPublished + WINDOW_DAYS)
  if (window.some((d) => d === 'error')) return null // partial data would read as a real dip

  const other = new Set<string>()
  const byCountry: CountryTotals = new Map()
  const latest = tally(window[0] as Row[], appleAppId, sku, other)
  const sum = { installs: 0, redownloads: 0, updates: 0, proceeds: 0 }
  const series: { date: string; installs: number; proceeds: number }[] = []
  window.forEach((d, i) => {
    const date = dates[firstPublished + i]
    if (!Array.isArray(d)) {
      series.push({ date, installs: 0, proceeds: 0 }) // a real zero-sales day
      return
    }
    const t = tally(d, appleAppId, sku, other, byCountry)
    sum.installs += t.installs
    sum.redownloads += t.redownloads
    sum.updates += t.updates
    sum.proceeds += t.proceeds
    series.push({ date, installs: t.installs, proceeds: round2(t.proceeds) })
  })
  series.reverse()

  const history = await appHistory(appleAppId, sku, jwt, vendor, window as DayResult[], dates.slice(firstPublished, firstPublished + window.length)).catch(() => undefined)

  return {
    history,
    reportDate: dates[firstPublished],
    day: { ...latest, proceeds: round2(latest.proceeds) },
    last30: { ...sum, proceeds: round2(sum.proceeds), days: window.length },
    otherCurrencies: Array.from(other).sort(),
    series,
    countries: Array.from(byCountry, ([code, v]) => ({ code, installs: v.installs, proceeds: round2(v.proceeds) }))
      .filter((c) => c.installs > 0 || c.proceeds > 0)
      .sort((a, b) => b.installs - a.installs || b.proceeds - a.proceeds),
  }
}

// ─── Year to date / year over year ──────────────────────────────────────────
//
// Completed months come from Apple's MONTHLY reports; the current month (and
// last month, until its monthly report is published) is summed from the daily
// reports already fetched for the 30-day window. Months with no report (before
// launch, or no sales) count as zero.

const ym = (d: Date) => d.toISOString().slice(0, 7)
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

async function appHistory(appleAppId: string, sku: string | null, jwt: string, vendor: string,
                          window: DayResult[], windowDates: string[]): Promise<AppStoreHistory> {
  const latest = windowDates[0]                       // newest published day, 'YYYY-MM-DD'
  const now = new Date(`${latest}T12:00:00Z`)
  const year = now.getUTCFullYear(), m0 = now.getUTCMonth()
  const other = new Set<string>()
  const t = (rows: DayResult) => Array.isArray(rows) ? tally(rows, appleAppId, sku, other) : { installs: 0, proceeds: 0 }

  // Daily totals by month, from the window.
  const dailyByMonth = new Map<string, Tally & { days: Set<string> }>()
  window.forEach((d, i) => {
    const key = windowDates[i].slice(0, 7)
    const x = dailyByMonth.get(key) ?? { installs: 0, proceeds: 0, days: new Set<string>() }
    const v = t(d); x.installs += v.installs; x.proceeds += v.proceeds; x.days.add(windowDates[i])
    dailyByMonth.set(key, x)
  })

  const keys: string[] = []
  for (let y = year - 1; y <= year; y++) for (let m = 0; m < 12; m++) {
    if (y === year && m > m0) break
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`)
  }
  const current = ym(now)
  const months = await Promise.all(keys.map(async (key) => {
    if (key === current) { const d = dailyByMonth.get(key); return { month: key, installs: d?.installs ?? 0, proceeds: d?.proceeds ?? 0 } }
    const r = await getMonth(key, jwt, vendor)
    if (Array.isArray(r)) { const v = t(r); return { month: key, ...v } }
    // Last month before Apple publishes its monthly report: use the dailies we have.
    const d = dailyByMonth.get(key)
    if (d && d.days.size >= daysIn(Number(key.slice(0, 4)), Number(key.slice(5)) - 1) - 1) return { month: key, installs: d.installs, proceeds: d.proceeds }
    return { month: key, installs: 0, proceeds: 0 }
  }))

  const sum = (list: Tally[]) => list.reduce((a, b) => ({ installs: a.installs + b.installs, proceeds: a.proceeds + b.proceeds }), { installs: 0, proceeds: 0 })
  const thisYear = months.filter((x) => x.month.startsWith(`${year}-`))
  const lastYearFull = months.filter((x) => x.month.startsWith(`${year - 1}-`))
  const lastYearBefore = lastYearFull.filter((x) => Number(x.month.slice(5)) - 1 < m0)
  const lastYearSame = lastYearFull.find((x) => Number(x.month.slice(5)) - 1 === m0)
  const share = now.getUTCDate() / daysIn(year - 1, m0)
  const prev = sum(lastYearBefore)
  const r2 = (n: number) => Math.round(n * 100) / 100
  const ytd = sum(thisYear)
  const all = sum(months)
  return {
    ytd: { installs: ytd.installs, proceeds: r2(ytd.proceeds), from: `${year}-01-01`, to: latest },
    prevYtd: {
      installs: Math.round(prev.installs + (lastYearSame?.installs ?? 0) * share),
      proceeds: r2(prev.proceeds + (lastYearSame?.proceeds ?? 0) * share),
      from: `${year - 1}-01-01`, to: `${year - 1}${latest.slice(4)}`,
    },
    months: months.map((x) => ({ ...x, proceeds: r2(x.proceeds) })),
    allTime: { installs: all.installs, proceeds: r2(all.proceeds) },
  }
}
