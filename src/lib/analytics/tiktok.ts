// ─── TikTok Business API ─────────────────────────────────────────────────────
//
// SERVER ONLY. Ad results off each app's own ad account in the Clarendon Labs
// LLC Business Center, through the Marketing API (Integrated Report +
// campaign / adgroup / ad reads). Needs TIKTOK_ACCESS_TOKEN — the long-lived
// advertiser token from the "Clarendon Labs Analytics" developer app
// (app_id 7693244812249563157), authorized for every ad account — plus that
// app's <APP>_TIKTOK_ADVERTISER_ID. All five apps have an ad account
// (Rolligan, Gag Order, Borea, YulePick, Jinglewire; see
// reference_tiktok_business_center), so each one lights up on its own once
// its id is set.
//
// fetchTikTok()      — the 30-day spend / impressions / clicks tile.
// tiktokCampaigns()  — one row per campaign with its ads, for the Campaigns
//                      card (/api/analytics/campaigns, FEAT-CLA-022).

export type TikTokMetrics = { spend: number; impressions: number; clicks: number } | null

export const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3'
export const tiktokToken = () => process.env.TIKTOK_ACCESS_TOKEN
export const tiktokAdvertiserId = (appId: string) => process.env[`${appId.toUpperCase()}_TIKTOK_ADVERTISER_ID`] || undefined

/** One Marketing API call. GET params are query-string; POST bodies are JSON.
 *  TikTok answers HTTP 200 with its own `code`; anything but 0 is an error. */
export async function tiktokCall<T = any>(path: string, opts: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown; timeout?: number } = {}): Promise<T> {
  const token = tiktokToken()
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN is not set')
  const u = new URL(`${TIKTOK_API}${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v)
  const res = await fetch(u, {
    method: opts.method ?? 'GET', cache: 'no-store', signal: AbortSignal.timeout(opts.timeout ?? 20000),
    headers: { 'Access-Token': token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const out = await res.json().catch(() => ({}))
  if (out?.code !== 0) throw new Error(`TikTok: ${out?.message ?? `HTTP ${res.status}`} (code ${out?.code ?? res.status})`)
  return (out.data ?? {}) as T
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function fetchTikTok(advertiserId?: string): Promise<TikTokMetrics> {
  if (!advertiserId || !tiktokToken()) return null
  const end = new Date()
  const start = new Date(end.getTime() - 29 * 86400000)
  try {
    const data = await tiktokCall('/report/integrated/get/', { query: {
      advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'AUCTION_ADVERTISER',
      dimensions: JSON.stringify(['advertiser_id']), metrics: JSON.stringify(['spend', 'impressions', 'clicks']),
      start_date: iso(start), end_date: iso(end), page_size: '10',
    }, timeout: 8000 })
    const row = data?.list?.[0]?.metrics
    if (!row) return null
    return { spend: n(row.spend), impressions: n(row.impressions), clicks: n(row.clicks) }
  } catch {
    return null
  }
}

// ── Campaigns (FEAT-CLA-022) ─────────────────────────────────────────────────

/** Every figure is optional: a metric TikTok doesn't return for a level or a
 *  date range is left undefined, never shown as 0. */
export type TikTokStats = {
  spend_cents: number; impressions?: number; reach?: number; clicks?: number
  ctr?: number; cpc_cents?: number; cpm_cents?: number
  video_views?: number; views_2s?: number; views_6s?: number; views_15s?: number; views_100?: number
  follows?: number; profile_visits?: number; likes?: number; comments?: number; shares?: number
}

export type TikTokAd = TikTokStats & {
  ad_id: string; adgroup_id?: string; name: string
  /** TikTok's own secondary status, e.g. AD_STATUS_DELIVERY_OK / AD_STATUS_REVIEW / AD_STATUS_AUDIT_DENY. */
  status_detail?: string
  review?: string
  item_id?: string
}

export type TikTokCampaign = TikTokStats & {
  campaign_id: string; name: string; objective?: string
  operation_status?: string; status_detail?: string
  budget_cents?: number; budget_mode?: string; created?: string
  daily: { day: string; spend_cents: number; impressions?: number; views_15s?: number }[]
  ads: TikTokAd[]
}

// The two newest metric names are the ones most likely to be refused on an
// account (they were added in 2024/25); the report is retried without them.
const BASE_METRICS = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'video_play_actions', 'video_watched_2s', 'video_watched_6s',
  'video_views_p100', 'follows', 'profile_visits', 'likes', 'comments', 'shares']
const EXTRA_METRICS = ['reach', 'engaged_view_15s']

function stats(m: Record<string, unknown>): TikTokStats {
  const opt = (k: string) => (m[k] == null || m[k] === '' ? undefined : n(m[k]))
  return {
    spend_cents: Math.round(n(m.spend) * 100), impressions: opt('impressions'), reach: opt('reach'), clicks: opt('clicks'),
    ctr: opt('ctr'), cpc_cents: m.cpc == null ? undefined : Math.round(n(m.cpc) * 100), cpm_cents: m.cpm == null ? undefined : Math.round(n(m.cpm) * 100),
    video_views: opt('video_play_actions'), views_2s: opt('video_watched_2s'), views_6s: opt('video_watched_6s'),
    views_15s: opt('engaged_view_15s'), views_100: opt('video_views_p100'),
    follows: opt('follows'), profile_visits: opt('profile_visits'), likes: opt('likes'), comments: opt('comments'), shares: opt('shares'),
  }
}

type ReportRow = { dimensions: Record<string, string>; metrics: Record<string, unknown> }

/** Integrated report rows for one level, all pages. Falls back to the base
 *  metric set when TikTok refuses one of the newer names. */
export async function tiktokReport(advertiserId: string, level: 'AUCTION_CAMPAIGN' | 'AUCTION_AD' | 'AUCTION_ADVERTISER', dimensions: string[],
                                   start: string, end: string, extraMetrics: string[] = [], filtering?: unknown[]): Promise<ReportRow[]> {
  const run = async (metrics: string[]) => {
    const rows: ReportRow[] = []
    for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
      const data = await tiktokCall('/report/integrated/get/', { query: {
        advertiser_id: advertiserId, report_type: 'BASIC', data_level: level, dimensions: JSON.stringify(dimensions),
        metrics: JSON.stringify(metrics), start_date: start, end_date: end, page: String(page), page_size: '1000',
        ...(filtering ? { filtering: JSON.stringify(filtering) } : {}),
      } })
      pages = n(data.page_info?.total_page) || 1
      rows.push(...((data.list ?? []) as ReportRow[]))
    }
    return rows
  }
  const full = [...BASE_METRICS, ...EXTRA_METRICS, ...extraMetrics]
  try { return await run(full) } catch (e) {
    if (!/metric|field|param|invalid/i.test((e as Error).message)) throw e
    return run([...BASE_METRICS, ...extraMetrics])
  }
}

const STATUS_FROM_SECONDARY: Record<string, string> = {
  AD_STATUS_DELIVERY_OK: 'running', AD_STATUS_REVIEW: 'in_review', AD_STATUS_AUDIT_DENY: 'rejected', AD_STATUS_DISABLE: 'paused',
  AD_STATUS_NOT_START: 'scheduled', AD_STATUS_TIME_DONE: 'ended', AD_STATUS_CAMPAIGN_DISABLE: 'paused', AD_STATUS_ADGROUP_DISABLE: 'paused',
  AD_STATUS_BALANCE_EXCEED: 'no_funds', AD_STATUS_BUDGET_EXCEED: 'budget_spent', AD_STATUS_CAMPAIGN_EXCEED: 'budget_spent',
  CAMPAIGN_STATUS_ENABLE: 'running', CAMPAIGN_STATUS_DISABLE: 'paused', CAMPAIGN_STATUS_DELETE: 'deleted', CAMPAIGN_STATUS_ADVERTISER_AUDIT_DENY: 'rejected',
  CAMPAIGN_STATUS_ADVERTISER_AUDIT: 'in_review', CAMPAIGN_STATUS_BUDGET_EXCEED: 'budget_spent', CAMPAIGN_STATUS_NOT_START: 'scheduled',
  CAMPAIGN_STATUS_ALL: 'running', CAMPAIGN_STATUS_TIME_DONE: 'ended',
}
/** TikTok's secondary status → one word the UI can colour. */
export const tiktokStatusWord = (secondary?: string, operation?: string) =>
  (secondary && STATUS_FROM_SECONDARY[secondary]) || (operation === 'DISABLE' ? 'paused' : operation === 'ENABLE' ? 'running' : 'unknown')

/** Campaigns on one ad account over [start, end] (YYYY-MM-DD), with their
 *  ads and a daily series. Campaigns with no spend and no impressions in the
 *  window are left out unless `includeIdle`. */
export async function tiktokCampaigns(advertiserId: string, start: string, end: string, includeIdle = true): Promise<TikTokCampaign[]> {
  const [camp, daily, ads] = await Promise.all([
    tiktokReport(advertiserId, 'AUCTION_CAMPAIGN', ['campaign_id'], start, end, ['campaign_name', 'objective_type']),
    tiktokReport(advertiserId, 'AUCTION_CAMPAIGN', ['campaign_id', 'stat_time_day'], start, end).catch(() => [] as ReportRow[]),
    tiktokReport(advertiserId, 'AUCTION_AD', ['ad_id'], start, end, ['ad_name', 'campaign_id', 'adgroup_id', 'tiktok_item_id']).catch(() => [] as ReportRow[]),
  ])
  const byId = new Map<string, TikTokCampaign>()
  for (const r of camp) {
    const id = String(r.dimensions.campaign_id ?? '')
    if (!id) continue
    byId.set(id, { campaign_id: id, name: String(r.metrics.campaign_name ?? id), objective: r.metrics.objective_type ? String(r.metrics.objective_type) : undefined,
                   ...stats(r.metrics), daily: [], ads: [] })
  }
  // Names, status, budget — campaign/get covers campaigns the report didn't
  // mention (not started, paused all window), so the card still lists them.
  try {
    for (let page = 1, pages = 1; page <= pages && page <= 5; page++) {
      const data = await tiktokCall('/campaign/get/', { query: { advertiser_id: advertiserId, page: String(page), page_size: '100',
        fields: JSON.stringify(['campaign_id', 'campaign_name', 'objective_type', 'operation_status', 'secondary_status', 'budget', 'budget_mode', 'create_time']) } })
      pages = n(data.page_info?.total_page) || 1
      for (const c of data.list ?? []) {
        const id = String(c.campaign_id)
        const row = byId.get(id) ?? (includeIdle ? { campaign_id: id, name: String(c.campaign_name ?? id), spend_cents: 0, daily: [], ads: [] } : null)
        if (!row) continue
        row.name = String(c.campaign_name ?? row.name); row.objective = c.objective_type ?? row.objective
        row.operation_status = c.operation_status; row.status_detail = c.secondary_status
        row.budget_mode = c.budget_mode; row.budget_cents = c.budget != null ? Math.round(n(c.budget) * 100) : undefined
        row.created = c.create_time
        byId.set(id, row)
      }
    }
  } catch { /* names from the report are enough */ }
  for (const r of daily) {
    const row = byId.get(String(r.dimensions.campaign_id ?? ''))
    if (!row) continue
    const s = stats(r.metrics)
    row.daily.push({ day: String(r.dimensions.stat_time_day ?? '').slice(0, 10), spend_cents: s.spend_cents, impressions: s.impressions, views_15s: s.views_15s })
  }
  for (const row of byId.values()) row.daily.sort((a, b) => a.day.localeCompare(b.day))
  // Ads: report rows first, then ad/get for the review status.
  const adStatus = new Map<string, { secondary?: string; name?: string; item?: string; adgroup?: string; campaign?: string }>()
  try {
    for (let page = 1, pages = 1; page <= pages && page <= 5; page++) {
      const data = await tiktokCall('/ad/get/', { query: { advertiser_id: advertiserId, page: String(page), page_size: '100',
        fields: JSON.stringify(['ad_id', 'ad_name', 'adgroup_id', 'campaign_id', 'secondary_status', 'tiktok_item_id']) } })
      pages = n(data.page_info?.total_page) || 1
      for (const a of data.list ?? []) adStatus.set(String(a.ad_id), { secondary: a.secondary_status, name: a.ad_name, item: a.tiktok_item_id, adgroup: a.adgroup_id, campaign: a.campaign_id })
    }
  } catch { /* optional */ }
  const reviews = await tiktokReviewInfo(advertiserId, Array.from(adStatus.keys()).slice(0, 100)).catch(() => new Map<string, string>())
  const seen = new Set<string>()
  for (const r of ads) {
    const adId = String(r.dimensions.ad_id ?? '')
    const st = adStatus.get(adId)
    const campaignId = String(r.metrics.campaign_id ?? st?.campaign ?? '')
    const row = byId.get(campaignId)
    if (!row || !adId) continue
    seen.add(adId)
    row.ads.push({ ad_id: adId, adgroup_id: String(r.metrics.adgroup_id ?? st?.adgroup ?? ''), name: String(r.metrics.ad_name ?? st?.name ?? adId),
                   status_detail: st?.secondary, review: reviews.get(adId), item_id: r.metrics.tiktok_item_id ? String(r.metrics.tiktok_item_id) : st?.item, ...stats(r.metrics) })
  }
  for (const [adId, st] of adStatus) {
    if (seen.has(adId) || !st.campaign) continue
    const row = byId.get(String(st.campaign))
    if (row) row.ads.push({ ad_id: adId, adgroup_id: st.adgroup, name: st.name ?? adId, status_detail: st.secondary, review: reviews.get(adId), item_id: st.item, spend_cents: 0 })
  }
  return Array.from(byId.values()).sort((a, b) => b.spend_cents - a.spend_cents || (b.created ?? '').localeCompare(a.created ?? ''))
}

/** Why TikTok rejected an ad, by ad id. Best effort: the endpoint isn't on
 *  every account, and a missing reason just leaves the row's status word. */
export async function tiktokReviewInfo(advertiserId: string, adIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!adIds.length) return out
  const data = await tiktokCall('/ad/review_info/get/', { query: { advertiser_id: advertiserId, ad_ids: JSON.stringify(adIds.slice(0, 100)) } })
  for (const r of data.list ?? data.review_info ?? []) {
    const id = String(r.ad_id ?? '')
    const reasons: string[] = []
    for (const k of ['reject_reason', 'audit_reason', 'reason', 'review_reason']) if (typeof r[k] === 'string' && r[k]) reasons.push(r[k])
    for (const d of r.reject_details ?? r.details ?? []) if (d?.reason) reasons.push(String(d.reason))
    if (id && reasons.length) out.set(id, reasons.join(' '))
  }
  return out
}
