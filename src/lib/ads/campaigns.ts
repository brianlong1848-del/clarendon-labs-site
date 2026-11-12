// ─── Campaigns, normalized across TikTok and Meta ────────────────────────────
//
// SERVER ONLY. One row per campaign for the Campaigns card on /analytics and
// each app page (FEAT-CLA-022), whatever platform it runs on. Every figure
// is optional: a platform that doesn't report a metric leaves it undefined
// and the card shows "—", never a made-up zero. Installs and cost per
// install are deliberately empty until App Store Connect campaign tokens
// (/get/<app>?ct=) are wired (APPSTORE_PROVIDER_TOKEN, FEAT-CLA-024).

import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { tiktokAdvertiserId, tiktokCached, tiktokCampaigns, tiktokStatusWord, tiktokToken } from '@/lib/analytics/tiktok'
import { adAccountId, metaAdInsights, metaCampaignAds, metaCampaignDays, metaCampaignInfo, metaStatusWord, type Promotion } from './meta'
import { rest } from '@/lib/publish/store'
import { adsManagerUrl } from './tiktok'
import { campaignMedia, mediaFields, type AdMedia } from './media'

/** Which post / video an ad shows (./media.ts). All optional: a platform that
 *  can't say leaves them out, and older Studio builds still decode. */
export type MediaFields = {
  media_kind?: AdMedia['kind']; thumbnail_url?: string; video_url?: string; permalink?: string; media_note?: string
}

export type CampaignAd = MediaFields & {
  ad_id: string; name: string; status?: string; status_detail?: string; status_note?: string; review?: string
  /** The post the ad runs: TikTok item id, or Meta's IG media / object story id. */
  item_id?: string
  adgroup_id?: string
  spend_cents: number; impressions?: number; clicks?: number; ctr?: number; cpc_cents?: number; views15s?: number; follows?: number
}

export type CampaignRow = MediaFields & {
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
  daily: { day: string; spend_cents: number; impressions?: number; views15s?: number; clicks?: number; reach?: number }[]
  ads: CampaignAd[]
  /** Set when a Studio boost created it. */
  promotion_id?: string
  url?: string
  /** Ads on the campaign (the thumbnail shows the first one, "+N" the rest). */
  ad_count?: number
  /** When the platform created it (TikTok create_time, UTC; Meta created_time). */
  created?: string
  /** When delivery was due to begin: the Studio boost's start_at or Meta's start_time. Stall detection counts from the later of this and `created`. */
  started?: string
}

/** The Studio boost record standing in for a platform status while TikTok's
 *  Ads Management scope is pending: what Studio set it to, bounded by its window. */
function promoStatus(p: Pick<Promotion, 'status' | 'start_at' | 'end_at'>, now = Date.now()): string | undefined {
  if (p.status === 'paused' || p.status === 'ended') return p.status
  if (p.status !== 'active') return undefined
  const start = Date.parse(p.start_at), end = Date.parse(p.end_at)
  if (Number.isFinite(end) && end < now) return 'ended'
  if (Number.isFinite(start) && start > now) return 'scheduled'
  return 'running'
}
const STUDIO_STATUS_NOTE = 'Status from Studio’s boost record — TikTok’s own status needs the Ads Management scope (requested 2026-10-27).'

const cached = tiktokCached
const HOUR = 60 * 60_000

export type Range = '7d' | '30d' | '90d'
export const RANGES: Range[] = ['7d', '30d', '90d']
export function rangeDates(r: Range) {
  const days = r === '7d' ? 7 : r === '90d' ? 90 : 30
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days }
}

export const INSTALLS_NOTE = 'Installs and cost per install per ad appear once Apple has counted 5+ installs through that campaign’s link (/get/<app>?ct=…, App Store Connect campaign tokens).'

/** Every campaign for one app (or all apps), both platforms. Per-platform
 *  failures are reported, not thrown, so one platform being down never
 *  blanks the other. TikTok answers come from a 10-minute cache per app and
 *  window unless `fresh` (the Refresh button). */
export async function campaignsFor(appId: string | 'all', range: Range, fresh = false): Promise<{ campaigns: CampaignRow[]; errors: string[] }> {
  const { start, end } = rangeDates(range)
  const apps = PUBLISH_APPS.filter((a) => appId === 'all' || a.id === appId)
  const errors: string[] = []
  const promos = await rest<Pick<Promotion, 'id' | 'app_id' | 'campaign_id' | 'network' | 'status' | 'start_at' | 'end_at'>[]>('studio_promotions?campaign_id=not.is.null&select=id,app_id,campaign_id,network,status,start_at,end_at').catch(() => [])
  const promoByCampaign = new Map(promos.map((p) => [`${p.network}:${p.campaign_id}`, p]))

  const tiktok = await Promise.all(apps.map(async (app): Promise<CampaignRow[]> => {
    const advertiserId = tiktokAdvertiserId(app.id)
    if (!advertiserId || !tiktokToken()) return []
    try {
      const rows = await tiktokCampaigns(advertiserId, start, end, true, fresh)
      return rows.map((c) => {
        const promo = promoByCampaign.get(`tiktok:${c.campaign_id}`)
        // The platform's live status (operation_status / secondary_status); while the
        // scope is pending, the Studio boost record says what Studio set it to.
        const live = c.status_detail || c.operation_status ? tiktokStatusWord(c.status_detail, c.operation_status) : undefined
        const fromStudio = !live && promo ? promoStatus(promo) : undefined
        return {
        platform: 'tiktok' as const, app_id: app.id, campaign_id: c.campaign_id, name: c.name, objective: c.objective,
        status: live ?? fromStudio, status_detail: c.status_detail, status_note: fromStudio ? STUDIO_STATUS_NOTE : c.status_note,
        budget_daily_cents: c.budget_mode === 'BUDGET_MODE_DAY' ? c.budget_cents : undefined, created: c.created, started: promo?.start_at,
        spend_cents: c.spend_cents, impressions: c.impressions, reach: c.reach, clicks: c.clicks, ctr: c.ctr, cpc_cents: c.cpc_cents, cpm_cents: c.cpm_cents,
        video_views: c.video_views, views2s: c.views2s, views6s: c.views6s, views15s: c.views15s, views100: c.views100,
        follows: c.follows, profile_visits: c.profile_visits, likes: c.likes, comments: c.comments, shares: c.shares,
        daily: c.daily,
        ads: c.ads.map((a) => ({ ad_id: a.ad_id, name: a.name, status: a.status_detail ? tiktokStatusWord(a.status_detail) : undefined, status_detail: a.status_detail, status_note: a.status_note, review: a.review, item_id: a.item_id, adgroup_id: a.adgroup_id,
                                 spend_cents: a.spend_cents, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, cpc_cents: a.cpc_cents, views15s: a.views15s, follows: a.follows })),
        promotion_id: promo?.id,
        url: adsManagerUrl(advertiserId),
      } })
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
      r.daily.push({ day: d.day, spend_cents: d.spend_cents, impressions: d.impressions, views15s: d.views15s, clicks: d.clicks, reach: d.reach })
      by.set(d.campaign_id, r)
    }
    for (const r of by.values()) {
      const i = info.get(r.campaign_id)
      if (i) { r.name = i.name ?? r.name; r.status = i.status; r.status_detail = i.effective_status; r.objective = i.objective; r.budget_daily_cents = i.daily_budget_cents; r.created = i.created_time }
      r.started = promoByCampaign.get(`meta:${r.campaign_id}`)?.start_at ?? i?.start_time
      if (r.impressions) { r.ctr = Math.round(((r.clicks ?? 0) / r.impressions) * 10000) / 100; r.cpm_cents = Math.round((r.spend_cents / r.impressions) * 1000) }
      if (r.clicks) r.cpc_cents = Math.round(r.spend_cents / r.clicks)
      r.daily.sort((a, b) => a.day.localeCompare(b.day))
    }
    meta = Array.from(by.values())
    // Ads per Meta campaign: names + status from the ads list (hourly cache),
    // figures from ad-level insights (10 minutes). Best effort per campaign.
    await Promise.all(meta.map(async (r) => {
      try {
        const [list, ins] = await Promise.all([
          cached(`meta-ads:${r.campaign_id}`, fresh, () => metaCampaignAds(r.campaign_id), HOUR),
          cached(`meta-ad-insights:${r.campaign_id}:${start}:${end}`, fresh, () => metaAdInsights(r.campaign_id, start, end)),
        ])
        const byAd = new Map(ins.map((a) => [a.ad_id, a]))
        r.ads = list.map((a) => { const s = byAd.get(a.ad_id); return { ad_id: a.ad_id, name: a.name, status: metaStatusWord(a.effective_status), status_detail: a.effective_status,
          item_id: a.creative?.effective_instagram_media_id ?? a.creative?.effective_object_story_id,
          spend_cents: s?.spend_cents ?? 0, impressions: s?.impressions, clicks: s?.clicks, ctr: s?.ctr, cpc_cents: s?.cpc_cents, views15s: s?.views15s } })
        for (const s of ins) if (!list.some((a) => a.ad_id === s.ad_id)) r.ads.push({ ad_id: s.ad_id, name: s.name ?? s.ad_id, spend_cents: s.spend_cents, impressions: s.impressions, clicks: s.clicks, ctr: s.ctr, cpc_cents: s.cpc_cents, views15s: s.views15s })
      } catch { /* the campaign row stands on its own */ }
    }))
  }
  const campaigns = [...tiktok.flat(), ...meta].sort((a, b) => b.spend_cents - a.spend_cents || a.name.localeCompare(b.name))
  // Which video each one is — thumbnails for the card and the Studio app.
  await Promise.all(campaigns.map(async (r) => {
    const m = await campaignMedia(r.platform, r.campaign_id, r.app_id, fresh).catch(() => null)
    if (!m) return
    Object.assign(r, mediaFields(m.media))
    r.ad_count = Math.max(r.ads.length, m.ad_count)
    for (const a of r.ads) Object.assign(a, mediaFields(m.ads[a.ad_id] ?? (r.ads.length === 1 ? m.media : null)))
  }))
  return { campaigns, errors }
}
