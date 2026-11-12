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
export type PlayDay = { date: string; installs: number; proceeds: number }
export type PlayMetrics = { reportDate: string | null; series: PlayDay[]; otherCurrencies: string[] }

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

type SaleRow = { pkg: string; date: string; usd: number; currency: string }
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
    out.push({ pkg: c[iPkg], date, currency: (c[iCur] ?? 'USD').toUpperCase(), usd: sign * Math.abs(money(c[iPrice])) * (1 - fee) })
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

/** Daily installs + estimated USD proceeds for the last ~35 days: this month's files plus last month's. */
export async function fetchPlay(pkg: string): Promise<PlayMetrics> {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const [a, b, sa, sb] = await Promise.all([month(pkg, ymOf(prev)), month(pkg, ymOf(now)), salesMonth(ymOf(prev)), salesMonth(ymOf(now))])
  const byDate = new Map<string, number>()
  for (const d of [...a, ...b]) byDate.set(d.date, d.installs)
  const proceeds = new Map<string, number>(), other = new Set<string>()
  for (const r of [...sa, ...sb]) {
    if (r.pkg !== pkg) continue
    if (r.currency !== 'USD') { other.add(r.currency); continue }
    proceeds.set(r.date, (proceeds.get(r.date) ?? 0) + r.usd)
  }
  const dates = [...byDate.keys(), ...proceeds.keys()].sort()
  const reportDate = dates.at(-1) ?? null
  // A continuous run of days ending on the latest report day, zeros filled in,
  // so "last 7" means seven calendar days like the App Store series.
  const series: PlayDay[] = []
  if (reportDate) {
    const end = new Date(`${reportDate}T00:00:00Z`)
    for (let i = 34; i >= 0; i--) {
      const day = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10)
      series.push({ date: day, installs: byDate.get(day) ?? 0, proceeds: Math.round((proceeds.get(day) ?? 0) * 100) / 100 })
    }
  }
  return { reportDate, series, otherCurrencies: [...other] }
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
