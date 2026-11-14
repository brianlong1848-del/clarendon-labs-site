// ─── /post Calendar data ─────────────────────────────────────────────────────
//
// SERVER ONLY. GET /api/publish/calendar joins, for one app or all of them:
//   • the posts in the range (studio_posts, every status but canceled),
//   • a footer per day: installs (App Store | Google Play), proceeds, ad
//     spend, and the app's scoreboard count (YulePick: exchanges that reached
//     3+ members that day — Clarendon-revenue-strategy.md),
//   • the World strip: one tile per country (installs per store, ad spend +
//     ad installs, posts aimed there).
// Every source is optional: one that isn't configured or fails just leaves its
// fields out and says so in `sources`, it never breaks the calendar.
//
// The types here are the API contract (Studio iOS mirrors them).

import { analyticsRegistry } from '@/lib/analytics/registry'
import { appStoreDailyCached } from '@/lib/analytics/appstore'
import { fetchPlayCountries, playDaily } from '@/lib/analytics/googleplay'
import { PLAY_PACKAGE_IDS } from '@/lib/ads/store'
import { campaignsFor, type CampaignRow } from '@/lib/ads/campaigns'
import { adSpendByCountry } from '@/lib/ads/countries'
import { APP_MARKETS, MARKETS, flagOf, postCountry } from './markets'
import { postsBetween, rest, type Post } from './store'

export const CALENDAR_TZ = 'America/Chicago'

export type SourceState = 'ok' | 'not_connected' | 'error'

/** One calendar day (YYYY-MM-DD, America/Chicago for posts; the stores' own report day for installs). */
export type CalendarDay = {
  date: string
  /** First-time installs. A store missing = no data for that day (not zero). */
  installs?: { appStore?: number; googlePlay?: number }
  /** USD proceeds (Play: estimated from the sales report). */
  proceeds?: { appStore?: number; googlePlay?: number }
  /** Paid-ads spend that day, all networks, in cents. Left out under a country filter (spend is per country only as a total). */
  adSpendCents?: number
  /** The app's scoreboard count that day (YulePick: exchanges reaching 3+ members). */
  scoreboard?: number
}

/** One World-strip tile (same shape WorldStrip takes). `country` is ISO-2 lower case. */
export type WorldTile = {
  country: string; flag?: string; name?: string
  installs?: { appStore?: number; googlePlay?: number }
  spendCents?: number; adInstalls?: number
  posts?: number
  /** Ads aren't running there (all paid ads are paused until the gate passes). */
  paused?: boolean
}

export type CalendarResponse = {
  from: string; to: string
  app: string | 'all'
  /** ISO-2 lower case, when filtered to one country. */
  country: string | null
  tz: typeof CALENDAR_TZ
  posts: Post[]
  days: CalendarDay[]
  world: WorldTile[]
  totals: { installs: { appStore: number; googlePlay: number }; proceeds: { appStore: number; googlePlay: number }; adSpendCents: number; scoreboard?: number; posts: number }
  /** What the scoreboard counts, when the app has one ("Exchanges with 3+ members"). */
  scoreboard?: { label: string; short: string }
  sources: { appStore: SourceState; googlePlay: SourceState; ads: SourceState; scoreboard?: SourceState }
  /** Newest day each store has published. */
  reportDates?: { appStore?: string; googlePlay?: string }
  errors?: string[]
}

const SCOREBOARD: Record<string, { label: string; short: string }> = {
  yulepick: { label: 'Exchanges with 3+ members', short: '3+ exchanges' },
}

const dayIn = (iso: string, tz = CALENDAR_TZ) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

/** Each YulePick exchange counts on the day (Chicago) its third member joined. */
async function yulepickScoreboard(from: string, to: string): Promise<Map<string, number>> {
  const rows = await rest<{ exchange_id: string; joined_at: string }[]>('memberships?select=exchange_id,joined_at&order=joined_at.asc&limit=50000')
  const seen = new Map<string, number>(), out = new Map<string, number>()
  for (const r of rows) {
    const n = (seen.get(r.exchange_id) ?? 0) + 1
    seen.set(r.exchange_id, n)
    if (n !== 3 || !r.joined_at) continue
    const d = dayIn(r.joined_at)
    if (d >= from && d <= to) out.set(d, (out.get(d) ?? 0) + 1)
  }
  return out
}

/** adSpendByCountry's rows in whatever shape it returns: [{ country, spendCents|spend_cents, installs|adInstalls }] or { XX: {...} }. */
function normalizeAdCountries(raw: unknown): Map<string, { spendCents: number; installs: number }> {
  const out = new Map<string, { spendCents: number; installs: number }>()
  const take = (cc: unknown, v: unknown) => {
    if (typeof cc !== 'string' || !/^[a-z]{2}$/i.test(cc) || !v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    const spend = Number(o.spendCents ?? o.spend_cents ?? 0) || 0
    const installs = Number(o.installs ?? o.adInstalls ?? o.ad_installs ?? 0) || 0
    const k = cc.toLowerCase(), cur = out.get(k) ?? { spendCents: 0, installs: 0 }
    out.set(k, { spendCents: cur.spendCents + spend, installs: cur.installs + installs })
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { countries?: unknown }).countries) ? (raw as { countries: unknown[] }).countries : null
  if (list) for (const r of list) take((r as Record<string, unknown>)?.country ?? (r as Record<string, unknown>)?.code, r)
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) take(k, v)
  return out
}

export async function buildCalendar(opts: { from: string; to: string; app: string | 'all'; country: string | null; appIds: string[]; only?: 'posts' }): Promise<CalendarResponse> {
  const { from, to, country } = opts
  if (opts.only === 'posts') return postsOnly(opts)
  const apps = opts.app === 'all' ? opts.appIds : [opts.app]
  const CC = country?.toUpperCase() ?? null
  const errors: string[] = []
  // Posts: the whole range in UTC padded a day each side; trimmed to Chicago days below.
  const pad = (d: string, days: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
  const postsP = postsBetween(`${pad(from, -1)}T00:00:00Z`, `${pad(to, 2)}T00:00:00Z`, opts.app === 'all' ? undefined : opts.app)
    .then((list) => list.filter((p) => { const d = dayIn(p.scheduled_at ?? p.created_at); return d >= from && d <= to }))

  const registry = analyticsRegistry()
  const ascP = Promise.all(apps.map(async (id) => {
    const a = registry.find((x) => x.id === id)
    return a ? appStoreDailyCached(a.appStoreId, from, to) : undefined
  }))
  const playP = Promise.all(apps.map(async (id) => {
    const pkg = PLAY_PACKAGE_IDS[id]
    if (!pkg) return undefined
    const [daily, byCountry] = await Promise.all([playDaily(pkg, from, to), fetchPlayCountries(pkg, from, to)])
    return { daily, byCountry }
  }))
  // Ad spend per day: the Campaigns rows (Meta + TikTok), last 90 days at most.
  const adsP = campaignsFor(opts.app === 'all' ? 'all' : opts.app, '90d')
    .then((r) => ({ rows: r.campaigns as CampaignRow[], errors: r.errors }))
    .catch((e) => ({ rows: null as CampaignRow[] | null, errors: [(e as Error).message] }))
  const adCountriesP = Promise.resolve()
    .then(() => adSpendByCountry({ from, to, ...(opts.app === 'all' ? {} : { app: opts.app }) }))
    .then((r: unknown) => normalizeAdCountries(r))
    .catch(() => null as Map<string, { spendCents: number; installs: number }> | null)
  const board = apps.length === 1 ? SCOREBOARD[apps[0]] : undefined
  const scoreP = board && apps[0] === 'yulepick' && !CC
    ? yulepickScoreboard(from, to).catch((e) => { errors.push(`Scoreboard: ${(e as Error).message}`); return null })
    : Promise.resolve(undefined)

  const [posts, asc, play, ads, adCountries, score] = await Promise.all([postsP, ascP, playP, adsP, adCountriesP, scoreP])

  // ── Days ──
  const days = new Map<string, CalendarDay>()
  const day = (d: string) => { let x = days.get(d); if (!x) { x = { date: d }; days.set(d, x) } return x }
  for (let d = from; d <= to; d = pad(d, 1)) day(d)
  const add = (o: Record<string, number> | undefined, k: string, v: number) => ({ ...(o ?? {}), [k]: Math.round(((o?.[k] ?? 0) + v) * 100) / 100 })

  let ascState: SourceState = 'not_connected', playState: SourceState = 'not_connected'
  const reportDates: CalendarResponse['reportDates'] = {}
  const countryInstalls = new Map<string, { appStore?: number; googlePlay?: number }>()
  for (const a of asc) {
    if (a === undefined) continue
    if (a === null) continue
    ascState = 'ok'
    if (a.reportDate && (!reportDates.appStore || a.reportDate > reportDates.appStore)) reportDates.appStore = a.reportDate
    for (const d of a.days) {
      if (d.date < from || d.date > to) continue
      const x = day(d.date)
      const inst = CC ? d.byCountry[CC]?.installs ?? 0 : d.installs
      const proc = CC ? d.byCountry[CC]?.proceeds ?? 0 : d.proceeds
      x.installs = add(x.installs, 'appStore', inst) as CalendarDay['installs']
      x.proceeds = add(x.proceeds, 'appStore', proc) as CalendarDay['proceeds']
      for (const [cc, v] of Object.entries(d.byCountry)) {
        const k = cc.toLowerCase(), cur = countryInstalls.get(k) ?? {}
        countryInstalls.set(k, { ...cur, appStore: (cur.appStore ?? 0) + v.installs })
      }
    }
  }
  for (const p of play) {
    if (!p) continue
    if (p.daily && 'error' in p.daily) { playState = 'error'; errors.push(`Google Play: ${p.daily.error}`); continue }
    if (!p.daily) continue
    if (playState !== 'error') playState = 'ok'
    const last = p.daily.filter((d) => d.installs || d.proceeds).at(-1)?.date ?? p.daily.at(-1)?.date
    if (last && (!reportDates.googlePlay || last > reportDates.googlePlay)) reportDates.googlePlay = last
    const byC = p.byCountry && !('error' in p.byCountry) ? p.byCountry : null
    if (p.byCountry && 'error' in p.byCountry) errors.push(`Google Play by country: ${p.byCountry.error}`)
    for (const d of p.daily) {
      const x = day(d.date)
      // Under a country filter Play's daily proceeds have no country; installs come from the country file.
      const inst = CC ? (byC ? byC.filter((r) => r.date === d.date && r.country === CC).reduce((t, r) => t + r.installs, 0) : 0) : d.installs
      x.installs = add(x.installs, 'googlePlay', inst) as CalendarDay['installs']
      if (!CC) x.proceeds = add(x.proceeds, 'googlePlay', d.proceeds) as CalendarDay['proceeds']
    }
    for (const r of byC ?? []) {
      const k = r.country.toLowerCase(), cur = countryInstalls.get(k) ?? {}
      countryInstalls.set(k, { ...cur, googlePlay: (cur.googlePlay ?? 0) + r.installs })
    }
  }

  let adsState: SourceState = 'not_connected'
  if (ads.rows) {
    adsState = ads.errors.length && !ads.rows.length ? 'error' : 'ok'
    if (!CC) for (const r of ads.rows) {
      if (!r.app_id || !apps.includes(r.app_id)) continue
      for (const d of r.daily) if (d.day >= from && d.day <= to) { const x = day(d.day); x.adSpendCents = (x.adSpendCents ?? 0) + d.spend_cents }
    }
    // Inside the 90 days the campaigns cover, a day with no spend is a real $0.
    const covered = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const today = dayIn(new Date().toISOString())
    if (!CC) for (const x of days.values()) if (x.date >= covered && x.date <= today && x.adSpendCents === undefined) x.adSpendCents = 0
  } else if (ads.errors.length) { adsState = 'error'; errors.push(...ads.errors.map((e) => `Ads: ${e}`)) }

  if (score) for (const x of days.values()) x.scoreboard = score.get(x.date) ?? 0

  // ── Posts (country filter: posts aimed there) ──
  const shown = CC ? posts.filter((p) => postCountry(p.app_id, p.market) === CC) : posts

  // ── World ──
  const postsBy = new Map<string, number>()
  for (const p of posts) { const k = postCountry(p.app_id, p.market).toLowerCase(); postsBy.set(k, (postsBy.get(k) ?? 0) + 1) }
  // Every country the app(s) aim at, then anywhere installs or spend came from.
  const aimed = Array.from(new Set(apps.flatMap((id) => (APP_MARKETS[id] ?? ['us']).map((m) => MARKETS[m].countries[0].toLowerCase()))))
  const extra = [...countryInstalls.keys(), ...(adCountries?.keys() ?? [])].filter((k) => !aimed.includes(k))
  const world: WorldTile[] = [...aimed, ...Array.from(new Set(extra))].map((cc) => {
    const ad = adCountries?.get(cc)
    const inst = countryInstalls.get(cc)
    return {
      country: cc, flag: flagOf(cc),
      ...(inst ? { installs: inst } : ascState === 'ok' || playState === 'ok' ? { installs: {} } : {}),
      ...(adCountries ? { spendCents: ad?.spendCents ?? 0, adInstalls: ad?.installs ?? 0, paused: !(ad && ad.spendCents > 0) } : { paused: true }),
      posts: postsBy.get(cc) ?? 0,
    }
  }).sort((a, b) => {
    const t = (w: WorldTile) => (w.installs?.appStore ?? 0) + (w.installs?.googlePlay ?? 0)
    const ai = aimed.indexOf(a.country), bi = aimed.indexOf(b.country)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || t(b) - t(a)
  })

  const list = Array.from(days.values()).filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  const sum = (f: (d: CalendarDay) => number | undefined) => Math.round(list.reduce((t, d) => t + (f(d) ?? 0), 0) * 100) / 100
  return {
    from, to, app: opts.app, country: country ?? null, tz: CALENDAR_TZ,
    posts: shown, days: list, world,
    totals: {
      installs: { appStore: sum((d) => d.installs?.appStore), googlePlay: sum((d) => d.installs?.googlePlay) },
      proceeds: { appStore: sum((d) => d.proceeds?.appStore), googlePlay: sum((d) => d.proceeds?.googlePlay) },
      adSpendCents: CC ? adCountries?.get(CC.toLowerCase())?.spendCents ?? 0 : sum((d) => d.adSpendCents),
      ...(score ? { scoreboard: sum((d) => d.scoreboard) } : {}),
      posts: shown.length,
    },
    ...(board ? { scoreboard: board } : {}),
    sources: { appStore: ascState, googlePlay: playState, ads: adsState, ...(board ? { scoreboard: score ? 'ok' as const : CC ? 'not_connected' as const : 'error' as const } : {}) },
    reportDates,
    ...(errors.length ? { errors } : {}),
  }
}

/** ?only=posts — just the posts (the cadence meter), no store or ad calls. */
async function postsOnly(opts: { from: string; to: string; app: string | 'all'; country: string | null }): Promise<CalendarResponse> {
  const { from, to } = opts
  const pad = (d: string, days: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
  const CC = opts.country?.toUpperCase() ?? null
  const posts = (await postsBetween(`${pad(from, -1)}T00:00:00Z`, `${pad(to, 2)}T00:00:00Z`, opts.app === 'all' ? undefined : opts.app))
    .filter((p) => { const d = dayIn(p.scheduled_at ?? p.created_at); return d >= from && d <= to && (!CC || postCountry(p.app_id, p.market) === CC) })
  return {
    from, to, app: opts.app, country: opts.country, tz: CALENDAR_TZ, posts, days: [], world: [],
    totals: { installs: { appStore: 0, googlePlay: 0 }, proceeds: { appStore: 0, googlePlay: 0 }, adSpendCents: 0, posts: posts.length },
    sources: { appStore: 'not_connected', googlePlay: 'not_connected', ads: 'not_connected' },
  }
}
