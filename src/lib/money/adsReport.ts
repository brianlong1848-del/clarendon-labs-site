// ─── Money → Ads report, as a pure function ──────────────────────────────────
//
// SERVER ONLY. The per-campaign / per-app ad performance that /api/money/ads
// serves (spend, installs, CPI, two ROAS figures) — split out so the Ad
// insights rules (src/lib/ads/insights.ts) can read installs and ROAS too.
// Rows come from ad_spend + revenue + apps; the caller picks the client (the
// signed-in session for the web / Studio, the service role for the cron).

import type { SupabaseClient } from '@supabase/supabase-js'
import { studioDb } from './studioDb'

export type AdRow = {
  platform: string; app_slug: string | null; day: string; campaign_id: string; campaign_name: string | null
  spend_cents: number; impressions: number | null; clicks: number | null; installs: number | null
  conversions: number | null; purchase_value_cents: number | null; synced_at: string | null
}
export type RevenueRow = { app_slug: string | null; period: string; proceeds_cents: number }
export type AppName = { slug: string; name: string }

export type AdsCampaign = {
  platform: string; app_slug: string | null; campaign_id: string; name: string; first_day: string; last_day: string
  spend_cents: number; impressions: number; clicks: number; installs: number; ctr: number | null; cpi_cents: number | null
  platform_value_cents: number; platform_roas: number | null; est_proceeds_cents: number; est_roas: number | null
  daily_spend: { day: string; cents: number }[]
}
export type AdsReport = {
  days: number; since: string; last_sync: string | null
  totals: { spend_cents: number; installs: number; proceeds_cents: number; cpi_cents: number | null; blended_roas: number | null }
  apps: { app_slug: string; spend_cents: number; installs: number; clicks: number; impressions: number; cpi_cents: number | null; proceeds_cents: number; blended_roas: number | null; platform_value_cents: number }[]
  campaigns: AdsCampaign[]
  app_names: AppName[]
}

export const sinceDay = (days: number) => new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)

export function buildAdsReport(input: { ads: AdRow[]; rev: RevenueRow[]; apps: AppName[]; days: number }): AdsReport {
  const { ads, rev, apps, days } = input
  const since = sinceDay(days)
  const num = (v: unknown) => Number(v ?? 0) || 0
  const proceeds: Record<string, number> = {}
  for (const r of rev) if (r.app_slug) proceeds[r.app_slug] = (proceeds[r.app_slug] ?? 0) + num(r.proceeds_cents)

  type Camp = { platform: string; app_slug: string | null; campaign_id: string; name: string; spend: number; impressions: number; clicks: number; installs: number; value: number; first: string; last: string; daily: Record<string, number> }
  const camps = new Map<string, Camp>()
  let lastSync: string | null = null
  for (const r of ads) {
    const key = `${r.platform}:${r.campaign_id}`
    const c = camps.get(key) ?? { platform: r.platform, app_slug: r.app_slug, campaign_id: r.campaign_id, name: r.campaign_name ?? r.campaign_id, spend: 0, impressions: 0, clicks: 0, installs: 0, value: 0, first: r.day, last: r.day, daily: {} }
    c.spend += num(r.spend_cents); c.impressions += num(r.impressions); c.clicks += num(r.clicks)
    c.installs += num(r.installs); c.value += num(r.purchase_value_cents)
    c.first = r.day < c.first ? r.day : c.first; c.last = r.day > c.last ? r.day : c.last
    c.daily[r.day] = (c.daily[r.day] ?? 0) + num(r.spend_cents)
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
      daily_spend: Object.entries(c.daily).sort(([a], [b]) => a.localeCompare(b)).map(([day, cents]) => ({ day, cents })),
    }
  }).sort((a, b) => b.spend_cents - a.spend_cents)

  const appsOut = Object.entries(byApp).map(([slug, a]) => ({
    app_slug: slug, spend_cents: a.spend, installs: a.installs, clicks: a.clicks, impressions: a.impressions,
    cpi_cents: a.installs > 0 ? Math.round(a.spend / a.installs) : null,
    proceeds_cents: proceeds[slug] ?? 0, blended_roas: ratio(proceeds[slug] ?? 0, a.spend),
    platform_value_cents: a.value,
  })).sort((a, b) => b.spend_cents - a.spend_cents)

  const total = appsOut.reduce((t, a) => ({ spend: t.spend + a.spend_cents, installs: t.installs + a.installs, proceeds: t.proceeds + a.proceeds_cents }), { spend: 0, installs: 0, proceeds: 0 })
  return {
    days, since, last_sync: lastSync,
    totals: { spend_cents: total.spend, installs: total.installs, proceeds_cents: total.proceeds, cpi_cents: total.installs ? Math.round(total.spend / total.installs) : null, blended_roas: ratio(total.proceeds, total.spend) },
    apps: appsOut, campaigns, app_names: apps,
  }
}

const AD_COLS = 'platform,app_slug,day,campaign_id,campaign_name,spend_cents,impressions,clicks,installs,conversions,purchase_value_cents,synced_at'

/** The report through the signed-in session (RLS applies). Throws on a query error. */
export async function adsReportForSession(sb: SupabaseClient, days: number): Promise<AdsReport> {
  const since = sinceDay(days)
  const [ads, rev, apps] = await Promise.all([
    sb.from('ad_spend').select(AD_COLS).gte('day', since).order('day'),
    sb.from('revenue').select('app_slug,period,proceeds_cents').gte('period', since),
    sb.from('apps').select('slug,name'),
  ])
  if (ads.error) throw new Error(ads.error.message)
  return buildAdsReport({ ads: (ads.data ?? []) as AdRow[], rev: (rev.data ?? []) as RevenueRow[], apps: (apps.data ?? []) as AppName[], days })
}

/** The report through the service role (cron / no session), or null when the Studio DB isn't configured. */
export async function adsReportForService(days: number): Promise<AdsReport | null> {
  const db = studioDb()
  if (!db) return null
  const since = sinceDay(days)
  const [ads, rev, apps] = await Promise.all([
    db.select<AdRow[]>('ad_spend', `select=${AD_COLS}&owner_id=eq.${db.owner}&day=gte.${since}&order=day`),
    db.select<RevenueRow[]>('revenue', `select=app_slug,period,proceeds_cents&owner_id=eq.${db.owner}&period=gte.${since}`),
    db.select<AppName[]>('apps', 'select=slug,name'),
  ])
  if (!ads.ok) throw new Error(ads.error)
  return buildAdsReport({ ads: ads.data ?? [], rev: rev.ok ? rev.data ?? [] : [], apps: apps.ok ? apps.data ?? [] : [], days })
}
