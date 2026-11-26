// ─── Money → Ads report, as a pure function ──────────────────────────────────
//
// SERVER ONLY. The per-campaign / per-app ad performance that /api/money/ads
// serves (spend, installs, CPI, two ROAS figures) — split out so the Ad
// insights rules (src/lib/ads/insights.ts) can read installs and ROAS too.
// Rows come from ad_spend + revenue + apps; the caller picks the client (the
// signed-in session for the web / Studio, the service role for the cron).

import type { SupabaseClient } from '@supabase/supabase-js'
import { studioDb } from './studioDb'
import { appName, campaignLabel, goalWord } from '@/lib/ads/labels'
import { PAUSED_SINCE, currentStrategy, type AppStrategy } from '@/lib/ads/strategy'
import { APP_STORE_IDS, PLAY_PACKAGE_IDS } from '@/lib/ads/store'
import { fetchAppStoreCached } from '@/lib/analytics/appstore'
import { fetchPlayCached, playConfigured } from '@/lib/analytics/googleplay'

export type AdRow = {
  platform: string; app_slug: string | null; day: string; campaign_id: string; campaign_name: string | null
  spend_cents: number; impressions: number | null; clicks: number | null; installs: number | null
  conversions: number | null; purchase_value_cents: number | null; synced_at: string | null
}
/** Revenue rows read here are App Store + Website (source 'stripe'); Play comes from its own reports in storeSplit, and test purchases are left out. */
export type RevenueRow = { app_slug: string | null; period: string; proceeds_cents: number; source?: string }
const REV_COLS = 'app_slug,period,proceeds_cents,source'
export type AppName = { slug: string; name: string }

export type AdsCampaign = {
  platform: string; app_slug: string | null; campaign_id: string; name: string; first_day: string; last_day: string
  spend_cents: number; impressions: number; clicks: number; installs: number; ctr: number | null; cpi_cents: number | null
  platform_value_cents: number; platform_roas: number | null; est_proceeds_cents: number; est_roas: number | null
  /** Per day: spend (cents) and, when any, the platform's attributed installs. */
  daily_spend: { day: string; cents: number; installs?: number }[]
  /** Readable label ("Rolligan · App installs · US · Jul 12"); `name` is the raw platform name (tooltip). */
  label?: string
  /** "Gag Order", never "gagorder". */
  app_name?: string
  /** Why installs are 0 / blank for this campaign (no SDK event, SKAN delay, wrong objective…). Absent when it has installs. */
  installs_why?: string
}
export type AdsReport = {
  days: number; since: string; last_sync: string | null
  /** Every day in the window with any spend or installs, oldest first (sparklines). */
  daily?: { day: string; spend_cents: number; installs: number; proceeds_cents: number }[]
  /** proceeds_cents = App Store + Website; web_proceeds_cents = the Website (Stripe) part of it. */
  totals: { spend_cents: number; installs: number; proceeds_cents: number; web_proceeds_cents?: number; cpi_cents: number | null; blended_roas: number | null }
  apps: { app_slug: string; spend_cents: number; installs: number; clicks: number; impressions: number; cpi_cents: number | null; proceeds_cents: number; web_proceeds_cents?: number; blended_roas: number | null; platform_value_cents: number }[]
  campaigns: AdsCampaign[]
  app_names: AppName[]
}

export const sinceDay = (days: number) => new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)

export function buildAdsReport(input: { ads: AdRow[]; rev: RevenueRow[]; apps: AppName[]; days: number; since?: string }): AdsReport {
  const { ads, rev, apps, days } = input
  const since = input.since ?? sinceDay(days)
  const num = (v: unknown) => Number(v ?? 0) || 0
  const proceeds: Record<string, number> = {}
  const web: Record<string, number> = {}
  for (const r of rev) if (r.app_slug) {
    proceeds[r.app_slug] = (proceeds[r.app_slug] ?? 0) + num(r.proceeds_cents)
    if (r.source === 'stripe') web[r.app_slug] = (web[r.app_slug] ?? 0) + num(r.proceeds_cents)
  }

  type Camp = { platform: string; app_slug: string | null; campaign_id: string; name: string; spend: number; impressions: number; clicks: number; installs: number; value: number; first: string; last: string; daily: Record<string, number>; dailyInstalls: Record<string, number> }
  const dayTotals: Record<string, { spend: number; installs: number; proceeds: number }> = {}
  const dayOf = (d: string) => (dayTotals[d] ??= { spend: 0, installs: 0, proceeds: 0 })
  for (const r of rev) if (r.period) dayOf(String(r.period).slice(0, 10)).proceeds += num(r.proceeds_cents)
  const camps = new Map<string, Camp>()
  let lastSync: string | null = null
  for (const r of ads) {
    const key = `${r.platform}:${r.campaign_id}`
    const c = camps.get(key) ?? { platform: r.platform, app_slug: r.app_slug, campaign_id: r.campaign_id, name: r.campaign_name ?? r.campaign_id, spend: 0, impressions: 0, clicks: 0, installs: 0, value: 0, first: r.day, last: r.day, daily: {}, dailyInstalls: {} }
    c.spend += num(r.spend_cents); c.impressions += num(r.impressions); c.clicks += num(r.clicks)
    c.installs += num(r.installs); c.value += num(r.purchase_value_cents)
    c.first = r.day < c.first ? r.day : c.first; c.last = r.day > c.last ? r.day : c.last
    c.daily[r.day] = (c.daily[r.day] ?? 0) + num(r.spend_cents)
    if (num(r.installs)) c.dailyInstalls[r.day] = (c.dailyInstalls[r.day] ?? 0) + num(r.installs)
    const t = dayOf(r.day); t.spend += num(r.spend_cents); t.installs += num(r.installs)
    if (r.campaign_name) c.name = r.campaign_name
    camps.set(key, c)
    if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at
  }

  const byApp: Record<string, { spend: number; installs: number; clicks: number; impressions: number; value: number }> = {}
  for (const c of Array.from(camps.values())) {
    const a = (byApp[c.app_slug ?? 'shared'] ??= { spend: 0, installs: 0, clicks: 0, impressions: 0, value: 0 })
    a.spend += c.spend; a.installs += c.installs; a.clicks += c.clicks; a.impressions += c.impressions; a.value += c.value
  }
  const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)

  const campaigns: AdsCampaign[] = Array.from(camps.values()).map((c) => {
    const app = byApp[c.app_slug ?? 'shared']
    const appProceeds = proceeds[c.app_slug ?? ''] ?? 0
    const share = app.installs > 0 ? c.installs / app.installs : app.spend > 0 ? c.spend / app.spend : 0
    const estProceeds = Math.round(appProceeds * share)
    return {
      platform: c.platform, app_slug: c.app_slug, campaign_id: c.campaign_id, name: c.name, first_day: c.first, last_day: c.last,
      spend_cents: c.spend, impressions: c.impressions, clicks: c.clicks, installs: c.installs,
      ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : null,
      cpi_cents: c.installs > 0 ? Math.round(c.spend / c.installs) : null,
      platform_value_cents: c.value, platform_roas: ratio(c.value, c.spend),
      est_proceeds_cents: estProceeds, est_roas: ratio(estProceeds, c.spend),
      daily_spend: Object.entries(c.daily).sort(([a], [b]) => a.localeCompare(b)).map(([day, cents]) => (c.dailyInstalls[day] ? { day, cents, installs: c.dailyInstalls[day] } : { day, cents })),
      label: campaignLabel({ name: c.name, app_slug: c.app_slug, first_day: c.first }),
      app_name: appName(c.app_slug),
      installs_why: installsWhy({ platform: c.platform, app_slug: c.app_slug, name: c.name, installs: c.installs, impressions: c.impressions, last_day: c.last }),
    }
  }).sort((a, b) => b.spend_cents - a.spend_cents)

  const appsOut = Object.entries(byApp).map(([slug, a]) => ({
    app_slug: slug, spend_cents: a.spend, installs: a.installs, clicks: a.clicks, impressions: a.impressions,
    cpi_cents: a.installs > 0 ? Math.round(a.spend / a.installs) : null,
    proceeds_cents: proceeds[slug] ?? 0, web_proceeds_cents: web[slug] ?? 0, blended_roas: ratio(proceeds[slug] ?? 0, a.spend),
    platform_value_cents: a.value,
  })).sort((a, b) => b.spend_cents - a.spend_cents)

  const total = appsOut.reduce((t, a) => ({ spend: t.spend + a.spend_cents, installs: t.installs + a.installs, proceeds: t.proceeds + a.proceeds_cents, web: t.web + (a.web_proceeds_cents ?? 0) }), { spend: 0, installs: 0, proceeds: 0, web: 0 })
  return {
    days, since, last_sync: lastSync,
    daily: Object.entries(dayTotals).filter(([d]) => d >= since).sort(([a], [b]) => a.localeCompare(b)).map(([day, t]) => ({ day, spend_cents: t.spend, installs: t.installs, proceeds_cents: t.proceeds })),
    totals: { spend_cents: total.spend, installs: total.installs, proceeds_cents: total.proceeds, web_proceeds_cents: total.web, cpi_cents: total.installs ? Math.round(total.spend / total.installs) : null, blended_roas: ratio(total.proceeds, total.spend) },
    apps: appsOut, campaigns, app_names: apps,
  }
}

const AD_COLS = 'platform,app_slug,day,campaign_id,campaign_name,spend_cents,impressions,clicks,installs,conversions,purchase_value_cents,synced_at'

/** The report through the signed-in session (RLS applies). Throws on a query error. */
export async function adsReportForSession(sb: SupabaseClient, days: number, opts: { since?: string } = {}): Promise<AdsReport> {
  const since = opts.since ?? sinceDay(days)
  const [ads, rev, apps] = await Promise.all([
    sb.from('ad_spend').select(AD_COLS).gte('day', since).order('day'),
    sb.from('revenue').select(REV_COLS).gte('period', since).eq('is_test', false).neq('source', 'play'),
    sb.from('apps').select('slug,name'),
  ])
  if (ads.error) throw new Error(ads.error.message)
  return buildAdsReport({ ads: (ads.data ?? []) as AdRow[], rev: (rev.data ?? []) as RevenueRow[], apps: (apps.data ?? []) as AppName[], days, since })
}

/** The report through the service role (cron / no session), or null when the Studio DB isn't configured. */
export async function adsReportForService(days: number): Promise<AdsReport | null> {
  const db = studioDb()
  if (!db) return null
  const since = sinceDay(days)
  const [ads, rev, apps] = await Promise.all([
    db.select<AdRow[]>('ad_spend', `select=${AD_COLS}&owner_id=eq.${db.owner}&day=gte.${since}&order=day`),
    db.select<RevenueRow[]>('revenue', `select=${REV_COLS}&owner_id=eq.${db.owner}&period=gte.${since}&is_test=eq.false&source=neq.play`),
    db.select<AppName[]>('apps', 'select=slug,name'),
  ])
  if (!ads.ok) throw new Error(ads.error)
  return buildAdsReport({ ads: ads.data ?? [], rev: rev.ok ? rev.data ?? [] : [], apps: apps.ok ? apps.data ?? [] : [], days })
}

// ─── Why a campaign shows no installs (handoff fix 6) ───────────────────────

/** Apps that send Meta / TikTok an install event themselves (yulepick-android: Meta + TikTok SDKs). */
export const SDK_APPS = new Set(['yulepick'])
const PLATFORM = (p: string) => (p === 'tiktok' ? 'TikTok' : p === 'meta' ? 'Meta' : p)

export function installsWhy(c: { platform: string; app_slug: string | null; name: string; installs: number; impressions: number; last_day: string }, now = Date.now()): string | undefined {
  if (c.installs > 0) return undefined
  if (c.app_slug === 'jinglewire') return 'Kid-directed app: install attribution is switched off on purpose.'
  if (!c.impressions) return 'It never delivered, so there was nothing to count.'
  const goal = goalWord(null, c.name)
  if (goal && goal !== 'App installs' && goal !== 'Sales') return `Wrong objective for installs: a ${goal.toLowerCase()} campaign counts taps, not installs. Only an App Store campaign link with 5+ installs would show them.`
  const ageDays = (now - Date.parse(`${c.last_day}T00:00:00Z`)) / 86400000
  if (c.platform === 'tiktok' && ageDays <= 3) return 'SKAN delay: Apple reports iOS installs to TikTok 1–3 days late, and only above its privacy threshold.'
  if (!SDK_APPS.has(c.app_slug ?? '')) return `No SDK install event: ${appName(c.app_slug)} doesn’t send ${PLATFORM(c.platform)} an install event, so only Apple’s SKAN reports could show installs, and they reported none.`
  return `None reported: ${PLATFORM(c.platform)} saw no install from this campaign, SKAN included.`
}

// ─── Ranges (Money → Ads chips) ─────────────────────────────────────────────

export type AdsRange = '7d' | '30d' | '90d' | '1y' | 'lifetime'
export const ADS_RANGES: AdsRange[] = ['7d', '30d', '90d', '1y', 'lifetime']
/** Before the first ad dollar (Studio's ad_spend starts 2026). */
export const LIFETIME_SINCE = '2025-01-01'
export function rangeWindow(r: AdsRange): { days: number; since: string } {
  if (r === 'lifetime') return { days: Math.ceil((Date.now() - Date.parse(`${LIFETIME_SINCE}T00:00:00Z`)) / 86400000) + 1, since: LIFETIME_SINCE }
  const days = r === '7d' ? 7 : r === '30d' ? 30 : r === '90d' ? 90 : 365
  return { days, since: sinceDay(days) }
}

// ─── Store split: App Store + Google Play (FEAT-CLA-025 / 031) ───────────────
//
// Same cached reads the Console uses (src/lib/consoleSummary.ts):
// fetchAppStoreCached (installs, last ~30 published days) and fetchPlayCached
// (installs + USD proceeds, last ~35 days). App Store proceeds come from the
// revenue table for the whole window. Each store says which days it covers,
// so a 1-year window never pretends Play's 35 days are a year.

export type StoreFigure = {
  /** Proceeds in the window, cents (App Store: revenue table; Play: Play sales reports, USD only). */
  proceeds_cents: number
  /** Store installs (all installs, not just ads) in the covered days; null = not readable. */
  installs: number | null
  /** The days the installs / Play proceeds actually cover (ISO), when narrower than the window. */
  covered_from?: string
  covered_to?: string
  connected: boolean
  error?: string
  other_currencies?: string[]
}
export type AppStores = { app_slug: string; app_store: StoreFigure | null; google_play: StoreFigure | null }
export type StoreSplit = {
  app_store: StoreFigure
  google_play: StoreFigure
  apps: AppStores[]
}

type Series = { date: string; installs: number; proceeds: number }[]
const inWindow = (s: Series | undefined, since: string) => (s ?? []).filter((d) => d.date >= since)
const span = (s: Series) => (s.length ? { covered_from: s[0].date, covered_to: s[s.length - 1].date } : {})

export async function storeSplit(report: AdsReport): Promise<StoreSplit> {
  const slugs = Array.from(new Set([...Object.keys(APP_STORE_IDS), ...Object.keys(PLAY_PACKAGE_IDS)]))
  const ascProceeds: Record<string, number> = {}
  for (const a of report.apps) ascProceeds[a.app_slug] = a.proceeds_cents - (a.web_proceeds_cents ?? 0)
  const apps = await Promise.all(slugs.map(async (slug): Promise<AppStores> => {
    const appleId = APP_STORE_IDS[slug], pkg = PLAY_PACKAGE_IDS[slug]
    const [asc, play] = await Promise.all([
      appleId ? fetchAppStoreCached(appleId).catch(() => null) : Promise.resolve(null),
      pkg && playConfigured() ? fetchPlayCached(pkg).catch((e) => ({ error: (e as Error).message })) : Promise.resolve(null),
    ])
    let app_store: StoreFigure | null = null
    if (appleId) {
      const s = inWindow(asc?.series, report.since)
      app_store = { proceeds_cents: ascProceeds[slug] ?? 0, installs: asc ? s.reduce((t, d) => t + d.installs, 0) : null, ...span(s), connected: !!asc,
        other_currencies: asc?.otherCurrencies?.length ? asc.otherCurrencies : undefined }
    }
    let google_play: StoreFigure | null = null
    if (pkg) {
      if (!play) google_play = { proceeds_cents: 0, installs: null, connected: false, error: playConfigured() ? 'Play reports unavailable' : 'Play reports bucket isn’t set up (PLAY_REPORTS)' }
      else if ('error' in play) google_play = { proceeds_cents: 0, installs: null, connected: true, error: play.error }
      else {
        const s = inWindow(play.series, report.since)
        google_play = { proceeds_cents: Math.round(s.reduce((t, d) => t + d.proceeds, 0) * 100), installs: s.reduce((t, d) => t + d.installs, 0), ...span(s), connected: true,
          other_currencies: play.otherCurrencies.length ? play.otherCurrencies : undefined }
      }
    }
    return { app_slug: slug, app_store, google_play }
  }))
  const sum = (pick: (a: AppStores) => StoreFigure | null): StoreFigure => {
    const figs = apps.map(pick).filter((f): f is StoreFigure => !!f)
    const live = figs.filter((f) => f.installs != null)
    const froms = figs.map((f) => f.covered_from).filter((x): x is string => !!x).sort()
    const tos = figs.map((f) => f.covered_to).filter((x): x is string => !!x).sort()
    return {
      proceeds_cents: figs.reduce((t, f) => t + f.proceeds_cents, 0),
      installs: live.length ? live.reduce((t, f) => t + (f.installs ?? 0), 0) : null,
      covered_from: froms[0], covered_to: tos.at(-1),
      connected: figs.some((f) => f.connected),
      error: figs.every((f) => f.error) ? figs[0]?.error : undefined,
    }
  }
  return { app_store: sum((a) => a.app_store), google_play: sum((a) => a.google_play), apps }
}

// ─── /api/money/ads response (web + Studio iOS mirror) ──────────────────────

export type AdsStrategyBlock = {
  /** Every app's paid ads are paused (the revenue strategy, 2026-11-12). */
  all_paused: boolean
  paused_since: string
  /** Spend over the last 7 days, cents, whatever the range. */
  spend_7d_cents: number
  apps: AppStrategy[]
}

/** What GET /api/money/ads returns. Everything added on 2026-11-14 is optional. */
export type AdsApiResponse = Omit<AdsReport, 'campaigns' | 'totals' | 'apps'> & {
  range?: AdsRange
  totals: AdsReport['totals'] & {
    /** App Store proceeds (proceeds_cents minus the website part). */
    app_store_proceeds_cents?: number
    /** Website (Stripe) proceeds, test purchases left out (2026-11-23). */
    website_proceeds_cents?: number
    google_play_proceeds_cents?: number
    app_store_installs?: number | null
    google_play_installs?: number | null
    /** (App Store + Google Play proceeds) ÷ ad spend. */
    blended_roas_all?: number | null
  }
  apps: (AdsReport['apps'][number] & {
    app_name?: string
    google_play_proceeds_cents?: number
    app_store_installs?: number | null
    google_play_installs?: number | null
    blended_roas_all?: number | null
    ads_state?: 'paused' | 'gated' | 'live'
  })[]
  campaigns: (AdsCampaign & {
    media_kind?: 'video' | 'image' | 'placeholder'; thumbnail_url?: string; video_url?: string; permalink?: string; media_note?: string
    ad_count?: number
  })[]
  stores?: StoreSplit
  strategy?: AdsStrategyBlock
}

/** The strategy const plus live scoreboard counts (null = not measured) for the window. */
export function strategyBlock(report: AdsReport, counts: Record<string, number | null> = {}): AdsStrategyBlock {
  const since7 = sinceDay(7)
  const spend7 = (report.daily ?? []).filter((d) => d.day >= since7).reduce((t, d) => t + d.spend_cents, 0)
  const strategy = currentStrategy()
  const apps = strategy.map((s) => {
    const count = counts[s.app_slug] ?? null
    return count == null ? s : { ...s, scoreboard: { ...s.scoreboard, count, note: `Since ${report.since}` } }
  })
  return { all_paused: strategy.every((s) => s.ads_state === 'paused'), paused_since: PAUSED_SINCE, spend_7d_cents: spend7, apps }
}
