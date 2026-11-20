// ─── Google Play installs (FEAT-CLA-025) ─────────────────────────────────────
//
// SERVER ONLY. Play has no "installs" API; Play Console writes daily statistics
// to its own Cloud Storage bucket as monthly CSVs instead:
//   gs://<bucket>/stats/installs/installs_<package>_<YYYYMM>_overview.csv
// (UTF-16LE with a BOM, one row per day, updated daily with ~1–3 days of lag.)
//
// Env (Vercel only, never Drive):
//   PLAY_REPORTS_BUCKET    the bucket name, e.g. pubsite_prod_rev_0123456789
//                          (Play Console → Download reports → Statistics →
//                          "Copy Cloud Storage URI", without gs:// and the path)
//   PLAY_REPORTS_SA_JSON   a service-account key (raw JSON or base64) that was
//                          invited in Play Console → Users and permissions with
//                          "View app information and download bulk reports".
//                          Falls back to GOOGLE_SERVICE_ACCOUNT_JSON.
//
// WHAT COUNTS AS AN INSTALL. "Daily User Installs" — a Google account installing
// the app for the first time on any device — is the closest match to Apple's
// first-time downloads (product types 1/1F/1T/F1 in appstore.ts). Older report
// shapes without it fall back to "Install events", then "Daily Device Installs".

import { createSign } from 'crypto'
import { inflateRawSync } from 'zlib'

type Key = { client_email: string; private_key: string }
/** One day: first-time installs, estimated USD proceeds, and the number of charged orders (minus refunds). */
export type PlayDay = { date: string; installs: number; proceeds: number; units?: number }
export type PlayTally = { installs: number; proceeds: number }
export type PlayMetrics = {
  /** Most recent day with a published report, or null when Play hasn't written anything yet. */
  reportDate: string | null
  /** The last ~35 days ending on reportDate, zeros filled — the Console / Calendar window. */
  series: PlayDay[]
  otherCurrencies: string[]
  /** reportDate alone, and the 30 days ending on it. */
  day: PlayTally
  last30: PlayTally & { days: number }
  /** Every day since the first Play report (PLAY_SINCE), oldest first — revenue rows read this. */
  daily: PlayDay[]
  /** Installs by storefront country over the last 30 days, most first. */
  countries: { code: string; installs: number }[]
  /** Same shape as the App Store history, so the dashboards show both stores side by side. */
  history: {
    ytd: PlayTally & { from: string; to: string }
    prevYtd: PlayTally & { from: string; to: string }
    months: (PlayTally & { month: string })[]
    allTime: PlayTally
  }
}

function key(): Key | null {
  const raw = (process.env.PLAY_REPORTS_SA_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON)?.trim()
  if (!raw) return null
  try {
    const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null
  } catch { return null }
}
const bucket = () => process.env.PLAY_REPORTS_BUCKET?.trim().replace(/^gs:\/\//, '').split('/')[0] || null

export const playConfigured = () => !!bucket() && key() !== null
export const playAccount = () => key()?.client_email ?? null

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

let tok: { token: string; exp: number } | null = null
async function token(): Promise<string> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.token
  const k = key()
  if (!k) throw new Error('Google Play reports aren’t connected (PLAY_REPORTS_SA_JSON is not set).')
  const iat = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: k.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  }))}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(k.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`)
  tok = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return tok.token
}

/** CSV text from a report file: UTF-16LE with BOM (current), or UTF-8 (some older files). */
function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8')
  // UTF-16LE without a BOM: every other byte of ASCII text is 0.
  return buf.length > 1 && buf[1] === 0 ? buf.toString('utf16le') : buf.toString('utf8')
}

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseInstalls(csv: string): PlayDay[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = splitLine(lines[0]).map((h) => h.toLowerCase())
  const iDate = head.indexOf('date')
  const iVal = ['daily user installs', 'install events', 'daily device installs'].map((h) => head.indexOf(h)).find((i) => i >= 0) ?? -1
  if (iDate < 0 || iVal < 0) return []
  return lines.slice(1).map(splitLine)
    .map((c) => ({ date: c[iDate], installs: Number(c[iVal]) || 0, proceeds: 0 }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
}

/** One month's file, or [] when Play hasn't written it (a new app, or the 1st of a month). */
async function month(pkg: string, ym: string): Promise<PlayDay[]> {
  const name = `stats/installs/installs_${pkg}_${ym}_overview.csv`
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket()!)}/o/${encodeURIComponent(name)}?alt=media`, {
    headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 404) return []
  if (res.status === 403) throw new Error(`${playAccount()} can’t read the Play reports bucket — give it “View app information and download bulk reports” in Play Console.`)
  if (!res.ok) throw new Error(`Play reports ${res.status}`)
  return parseInstalls(decode(Buffer.from(await res.arrayBuffer())))
}


// ─── Revenue: estimated sales reports ───────────────────────────────────────
// gs://<bucket>/sales/salesreport_<YYYYMM>.zip — one CSV for every app on the
// account, one row per order event, updated daily. These are what the buyer was
// charged, not payouts (earnings reports only land monthly), so proceeds are
// ESTIMATED here the way Apple reports them: Item Price (tax excluded) minus
// Google's service fee — 15% where the row says "First USD 1M Eligible" = Yes,
// else 30% (subscriptions are 15% either way). Refund rows subtract.
// Like appstore.ts, only USD is summed; other currencies are listed.

/** The first file inside a .zip (local header + deflate or stored). */
function unzipFirst(buf: Buffer): Buffer {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip')
  const method = buf.readUInt16LE(8), nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28)
  let size = buf.readUInt32LE(18)
  const start = 30 + nameLen + extraLen
  if (size === 0 || size === 0xffffffff) {
    // Sizes live in the central directory when the data-descriptor bit is set.
    const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    if (cd >= 0) size = buf.readUInt32LE(cd + 20)
  }
  const data = buf.subarray(start, size ? start + size : undefined)
  return method === 0 ? data : inflateRawSync(data)
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
function isoDate(v: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const m = v.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})/)
  return m && MONTHS[m[1].toLowerCase()] ? `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}` : null
}
const money = (v: string | undefined) => Number((v ?? '').replace(/[^0-9.\-]/g, '')) || 0

type SaleRow = { pkg: string; date: string; usd: number; currency: string; sign: 1 | -1 }
export function parseSales(csv: string): SaleRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = splitLine(lines[0]).map((h) => h.toLowerCase())
  const col = (n: string) => head.indexOf(n)
  const iDate = col('order charged date'), iPkg = col('product id'), iStatus = col('financial status'), iCur = col('currency of sale')
  const iPrice = col('item price'), iType = col('product type'), iFirst = col('first usd 1m eligible')
  if (iDate < 0 || iPkg < 0 || iPrice < 0) return []
  const out: SaleRow[] = []
  for (const l of lines.slice(1)) {
    const c = splitLine(l)
    const date = isoDate(c[iDate] ?? ''); if (!date) continue
    const status = (c[iStatus] ?? 'Charged').toLowerCase()
    const sign = status.startsWith('refund') ? -1 : status === 'charged' ? 1 : 0
    if (!sign) continue
    const sub = (c[iType] ?? '').toLowerCase().includes('subscription')
    const fee = sub || (c[iFirst] ?? '').toLowerCase() === 'yes' ? 0.15 : 0.30
    out.push({ pkg: c[iPkg], date, currency: (c[iCur] ?? 'USD').toUpperCase(), usd: sign * Math.abs(money(c[iPrice])) * (1 - fee), sign })
  }
  return out
}

const salesCache = new Map<string, { at: number; v: Promise<SaleRow[]> }>()
/** One month of every app's sales, fetched once and shared across apps. */
function salesMonth(ym: string): Promise<SaleRow[]> {
  const hit = salesCache.get(ym)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v
  const v = (async () => {
    const name = `sales/salesreport_${ym}.zip`
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket()!)}/o/${encodeURIComponent(name)}?alt=media`, {
      headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 404) return []
    if (!res.ok) throw new Error(`Play sales report ${res.status}`)
    return parseSales(decode(unzipFirst(Buffer.from(await res.arrayBuffer()))))
  })().catch(() => [] as SaleRow[])
  salesCache.set(ym, { at: Date.now(), v })
  return v
}

const ymOf = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/** The first month a Clarendon app was on Google Play (YulePick, 2026-11-09). Nothing to read before it. */
const PLAY_SINCE = '202611'
/** 'YYYYMM' for every month from `from` through `to`, inclusive. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4) - 1, 1)); ymOf(d) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) out.push(ymOf(d))
  return out
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const tally = (days: PlayDay[]): PlayTally => ({
  installs: days.reduce((t, d) => t + d.installs, 0),
  proceeds: Math.round(days.reduce((t, d) => t + d.proceeds, 0) * 100) / 100,
})

/** Daily installs + estimated USD proceeds for every month since PLAY_SINCE (one installs CSV per
 *  app per month, one sales zip per month shared by every app; months Play hasn't written are 404 → []). */
export async function fetchPlay(pkg: string): Promise<PlayMetrics> {
  const today = new Date().toISOString().slice(0, 10)
  const months = monthsBetween(PLAY_SINCE, ymOf(new Date()))
  const [inst, sales, countryRows] = await Promise.all([
    Promise.all(months.map((ym) => month(pkg, ym))),
    Promise.all(months.map((ym) => salesMonth(ym))),
    Promise.all(months.slice(-2).map((ym) => countryMonthCached(pkg, ym).catch(() => [] as PlayCountryDay[]))),
  ])
  const byDate = new Map<string, number>()
  for (const d of inst.flat()) byDate.set(d.date, d.installs)
  const proceeds = new Map<string, number>(), units = new Map<string, number>(), other = new Set<string>()
  for (const r of sales.flat()) {
    if (r.pkg !== pkg) continue
    if (r.currency !== 'USD') { other.add(r.currency); continue }
    proceeds.set(r.date, (proceeds.get(r.date) ?? 0) + r.usd)
    units.set(r.date, (units.get(r.date) ?? 0) + r.sign)
  }
  const dates = [...byDate.keys(), ...proceeds.keys()].sort()
  const reportDate = dates.at(-1) ?? null
  const empty: PlayTally = { installs: 0, proceeds: 0 }
  const year = today.slice(0, 4), prevYear = String(+year - 1)
  if (!reportDate) {
    return {
      reportDate, series: [], otherCurrencies: [...other], day: empty, last30: { ...empty, days: 0 }, daily: [], countries: [],
      history: { ytd: { ...empty, from: `${year}-01-01`, to: today }, prevYtd: { ...empty, from: `${prevYear}-01-01`, to: `${prevYear}${today.slice(4)}` }, months: [], allTime: empty },
    }
  }
  // A continuous run of days from the first report day to the latest, zeros
  // filled in, so "last 7" means seven calendar days like the App Store series.
  const daily: PlayDay[] = []
  for (let day = dates[0]; day <= reportDate; day = addDays(day, 1)) {
    daily.push({ date: day, installs: byDate.get(day) ?? 0, proceeds: Math.round((proceeds.get(day) ?? 0) * 100) / 100, units: units.get(day) ?? 0 })
  }
  const series = daily.slice(-35)
  const last30 = daily.slice(-30)
  const from30 = addDays(reportDate, -29)
  const byCountry = new Map<string, number>()
  for (const c of countryRows.flat()) if (c.date >= from30 && c.date <= reportDate) byCountry.set(c.country, (byCountry.get(c.country) ?? 0) + c.installs)
  const byMonth = new Map<string, PlayDay[]>()
  for (const d of daily) { const k = d.date.slice(0, 7); byMonth.set(k, [...(byMonth.get(k) ?? []), d]) }
  const sameDayLastYear = `${prevYear}${reportDate.slice(4)}`
  return {
    reportDate, series, otherCurrencies: [...other],
    day: tally(daily.slice(-1)),
    last30: { ...tally(last30), days: last30.length },
    daily,
    countries: [...byCountry].map(([code, installs]) => ({ code, installs })).filter((c) => c.installs > 0).sort((a, b) => b.installs - a.installs),
    history: {
      ytd: { ...tally(daily.filter((d) => d.date >= `${year}-01-01`)), from: `${year}-01-01`, to: reportDate },
      prevYtd: { ...tally(daily.filter((d) => d.date >= `${prevYear}-01-01` && d.date <= sameDayLastYear)), from: `${prevYear}-01-01`, to: sameDayLastYear },
      months: [...byMonth].map(([m, days]) => ({ month: m, ...tally(days) })),
      allTime: tally(daily),
    },
  }
}

// ─── Connection check (/api/admin/connections) ───────────────────────────────

export const playBucket = () => bucket()

/** Names, sizes and update times of the report files under a prefix (e.g. 'stats/installs/'). */
export async function listPlayReports(prefix: string, max = 200): Promise<{ name: string; size: number; updated: string }[]> {
  const q = new URLSearchParams({ prefix, maxResults: String(max), fields: 'items(name,size,updated)' })
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket()!)}/o?${q}`, {
    headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 403) throw new Error(`${playAccount()} can’t list gs://${bucket()}/${prefix} — it needs “View app information and download bulk reports” (and “View financial data” for sales) in Play Console → Users and permissions.`)
  if (res.status === 404) throw new Error(`Bucket gs://${bucket()} was not found — check PLAY_REPORTS_BUCKET against Play Console → Download reports → “Copy Cloud Storage URI”.`)
  if (!res.ok) throw new Error(`Play reports list ${res.status}`)
  const j = await res.json() as { items?: { name: string; size?: string; updated?: string }[] }
  return (j.items ?? []).map((i) => ({ name: i.name, size: Number(i.size) || 0, updated: i.updated ?? '' }))
}

const cache = new Map<string, { at: number; v: Promise<PlayMetrics | { error: string }> }>()
/** Ten-minute cache per package; errors come back as { error } so one app can't break the console. */
export function fetchPlayCached(pkg: string): Promise<PlayMetrics | { error: string }> {
  const hit = cache.get(pkg)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v
  const v = fetchPlay(pkg).catch((e) => ({ error: e instanceof Error ? e.message : 'Play reports unavailable' }))
  cache.set(pkg, { at: Date.now(), v })
  return v
}

// ─── Installs by country (Calendar + World strip) ───────────────────────────
// gs://<bucket>/stats/installs/installs_<package>_<YYYYMM>_country.csv — one
// row per day per country ("Date, Package Name, Country, Daily User Installs, …").
// Optional and separate from fetchPlay, so the console card never depends on it.

export type PlayCountryDay = { date: string; country: string; installs: number }

export function parseCountryInstalls(csv: string): PlayCountryDay[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = splitLine(lines[0]).map((h) => h.toLowerCase())
  const iDate = head.indexOf('date'), iCountry = head.indexOf('country')
  const iVal = ['daily user installs', 'install events', 'daily device installs'].map((h) => head.indexOf(h)).find((i) => i >= 0) ?? -1
  if (iDate < 0 || iCountry < 0 || iVal < 0) return []
  return lines.slice(1).map(splitLine)
    .map((c) => ({ date: c[iDate], country: (c[iCountry] ?? '').toUpperCase(), installs: Number(c[iVal]) || 0 }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && /^[A-Z]{2}$/.test(d.country))
}

async function countryMonth(pkg: string, ym: string): Promise<PlayCountryDay[]> {
  const name = `stats/installs/installs_${pkg}_${ym}_country.csv`
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket()!)}/o/${encodeURIComponent(name)}?alt=media`, {
    headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Play country report ${res.status}`)
  return parseCountryInstalls(decode(Buffer.from(await res.arrayBuffer())))
}

const countryCache = new Map<string, { at: number; v: Promise<PlayCountryDay[]> }>()
function countryMonthCached(pkg: string, ym: string): Promise<PlayCountryDay[]> {
  const k = `${pkg}|${ym}`
  const hit = countryCache.get(k)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v
  const v = countryMonth(pkg, ym)
  countryCache.set(k, { at: Date.now(), v })
  v.catch(() => countryCache.delete(k))
  return v
}
/** Daily installs per country between two dates (inclusive), or { error }. Null when Play isn't connected. */
export async function fetchPlayCountries(pkg: string, from: string, to: string): Promise<PlayCountryDay[] | { error: string } | null> {
  if (!playConfigured()) return null
  const months: string[] = []
  for (let d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(ymOf(d))
  try {
    const all = await Promise.all(months.slice(-14).map((ym) => countryMonthCached(pkg, ym)))
    return all.flat().filter((d) => d.date >= from && d.date <= to)
  } catch (e) { return { error: e instanceof Error ? e.message : 'Play country reports unavailable' } }
}

/** fetchPlay's daily series (installs + estimated USD proceeds), between two dates. */
export async function playDaily(pkg: string, from: string, to: string): Promise<PlayDay[] | { error: string } | null> {
  if (!playConfigured()) return null
  const m = await fetchPlayCached(pkg)
  if ('error' in m) return m
  return m.daily.filter((d) => d.date >= from && d.date <= to)
}
