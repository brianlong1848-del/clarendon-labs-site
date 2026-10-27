// ─── Campaigns, normalized across TikTok and Meta ────────────────────────────
//
// SERVER ONLY. One row per campaign for the Campaigns card on /analytics and
// each app page (FEAT-CLA-022), whatever platform it runs on. Every figure
// is optional: a platform that doesn't report a metric leaves it undefined
// and the card shows "—", never a made-up zero. Installs and cost per
// install are deliberately empty until App Store Connect campaign tokens
// (/get/<app>?ct=) are wired (APP_STORE_PROVIDER_TOKEN).

import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { tiktokAdvertiserId, tiktokCampaigns, tiktokStatusWord, tiktokToken } from '@/lib/analytics/tiktok'
import { adAccountId, metaCampaignDays, metaCampaignInfo, type Promotion } from './meta'
import { rest } from '@/lib/publish/store'
import { adsManagerUrl } from './tiktok'

export type CampaignAd = {
  ad_id: string; name: string; status?: string; status_detail?: string; status_note?: string; review?: string; item_id?: string
  spend_cents: number; impressions?: number; clicks?: number; ctr?: number; cpc_cents?: number; views15s?: number; follows?: number
}

export type CampaignRow = {
  platform: 'tiktok' | 'meta'
  app_id: string | null
  campaign_id: string
  name: string
  objective?: string
  /** running | paused | in_review | rejected | scheduled | ended | budget_spent | no_funds | unknown */
  status?: string
  status_detail?: string
  /** Shown as the status chip's tooltip when there is no status (e.g. TikTok hasn't approved the scope yet). */
  status_note?: string
  review?: string
  budget_daily_cents?: number
  spend_cents: number; impressions?: number; reach?: number; clicks?: number
  ctr?: number; cpc_cents?: number; cpm_cents?: number
  video_views?: number; views2s?: number; views6s?: number; views15s?: number; views100?: number
  follows?: number; profile_visits?: number; likes?: number; comments?: number; shares?: number
  /** Not available yet — comes from App Store Connect campaign tokens. */
  installs?: number; cpi_cents?: number
  daily: { day: string; spend_cents: number; impressions?: number; views15s?: number }[]
  ads: CampaignAd[]
  /** Set when a Studio boost created it. */
  promotion_id?: string
  url?: string
}

export type Range = '7d' | '30d' | '90d'
export const RANGES: Range[] = ['7d', '30d', '90d']
export function rangeDates(r: Range) {
  const days = r === '7d' ? 7 : r === '90d' ? 90 : 30
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days }
}

export const INSTALLS_NOTE = 'Installs and cost per install arrive from App Store Connect campaign tokens (/get/<app>?ct=) once APP_STORE_PROVIDER_TOKEN is set.'

/** Every campaign for one app (or all apps), both platforms. Per-platform
 *  failures are reported, not thrown, so one platform being down never
 *  blanks the other. TikTok answers come from a 10-minute cache per app and
 *  window unless `fresh` (the Refresh button). */
export async function campaignsFor(appId: string | 'all', range: Range, fresh = false): Promise<{ campaigns: CampaignRow[]; errors: string[] }> {
  const { start, end } = rangeDates(range)
  const apps = PUBLISH_APPS.filter((a) => appId === 'all' || a.id === appId)
  const errors: string[] = []
  const promos = await rest<Pick<Promotion, 'id' | 'app_id' | 'campaign_id' | 'network'>[]>('studio_promotions?campaign_id=not.is.null&select=id,app_id,campaign_id,network').catch(() => [])
  const promoByCampaign = new Map(promos.map((p) => [`${p.network}:${p.campaign_id}`, p]))

  const tiktok = await Promise.all(apps.map(async (app): Promise<CampaignRow[]> => {
    const advertiserId = tiktokAdvertiserId(app.id)
    if (!advertiserId || !tiktokToken()) return []
    try {
      const rows = await tiktokCampaigns(advertiserId, start, end, true, fresh)
      return rows.map((c) => ({
        platform: 'tiktok' as const, app_id: app.id, campaign_id: c.campaign_id, name: c.name, objective: c.objective,
        status: c.status_detail || c.operation_status ? tiktokStatusWord(c.status_detail, c.operation_status) : undefined, status_detail: c.status_detail, status_note: c.status_note,
        budget_daily_cents: c.budget_mode === 'BUDGET_MODE_DAY' ? c.budget_cents : undefined,
        spend_cents: c.spend_cents, impressions: c.impressions, reach: c.reach, clicks: c.clicks, ctr: c.ctr, cpc_cents: c.cpc_cents, cpm_cents: c.cpm_cents,
        video_views: c.video_views, views2s: c.views2s, views6s: c.views6s, views15s: c.views15s, views100: c.views100,
        follows: c.follows, profile_visits: c.profile_visits, likes: c.likes, comments: c.comments, shares: c.shares,
        daily: c.daily,
        ads: c.ads.map((a) => ({ ad_id: a.ad_id, name: a.name, status: a.status_detail ? tiktokStatusWord(a.status_detail) : undefined, status_detail: a.status_detail, status_note: a.status_note, review: a.review, item_id: a.item_id,
                                 spend_cents: a.spend_cents, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, cpc_cents: a.cpc_cents, views15s: a.views15s, follows: a.follows })),
        promotion_id: promoByCampaign.get(`tiktok:${c.campaign_id}`)?.id,
        url: adsManagerUrl(advertiserId),
      }))
    } catch (e) { errors.push(`TikTok (${app.name}): ${(e as Error).message}`); return [] }
  }))

  let meta: CampaignRow[] = []
  const days = await metaCampaignDays(start, end)
  if ('error' in days) errors.push(days.error)
  else {
    const info = await metaCampaignInfo().catch(() => new Map())
    const by = new Map<string, CampaignRow>()
    for (const d of days) {
      if (appId !== 'all' && d.app_slug !== appId) continue
      const r = by.get(d.campaign_id) ?? {
        platform: 'meta' as const, app_id: d.app_slug, campaign_id: d.campaign_id, name: d.campaign_name ?? d.campaign_id, spend_cents: 0, impressions: 0, clicks: 0, daily: [], ads: [],
        promotion_id: promoByCampaign.get(`meta:${d.campaign_id}`)?.id,
        url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId()}&selected_campaign_ids=${d.campaign_id}`,
      }
      r.spend_cents += d.spend_cents; r.impressions = (r.impressions ?? 0) + d.impressions; r.clicks = (r.clicks ?? 0) + d.clicks
      if (d.reach != null) r.reach = (r.reach ?? 0) + d.reach
      if (d.video_views != null) r.video_views = (r.video_views ?? 0) + d.video_views
      if (d.views15s != null) r.views15s = (r.views15s ?? 0) + d.views15s
      if (d.views100 != null) r.views100 = (r.views100 ?? 0) + d.views100
      r.daily.push({ day: d.day, spend_cents: d.spend_cents, impressions: d.impressions, views15s: d.views15s })
      by.set(d.campaign_id, r)
    }
    for (const r of by.values()) {
      const i = info.get(r.campaign_id)
      if (i) { r.name = i.name ?? r.name; r.status = i.status; r.status_detail = i.effective_status; r.objective = i.objective; r.budget_daily_cents = i.daily_budget_cents }
      if (r.impressions) { r.ctr = Math.round(((r.clicks ?? 0) / r.impressions) * 10000) / 100; r.cpm_cents = Math.round((r.spend_cents / r.impressions) * 1000) }
      if (r.clicks) r.cpc_cents = Math.round(r.spend_cents / r.clicks)
      r.daily.sort((a, b) => a.day.localeCompare(b.day))
    }
    meta = Array.from(by.values())
  }
  const campaigns = [...tiktok.flat(), ...meta].sort((a, b) => b.spend_cents - a.spend_cents || a.name.localeCompare(b.name))
  return { campaigns, errors }
}
