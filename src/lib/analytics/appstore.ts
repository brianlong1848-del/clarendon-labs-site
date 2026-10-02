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
} | null

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

    const tsv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf-8')
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
  } catch {
    return 'error'
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

  return {
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
