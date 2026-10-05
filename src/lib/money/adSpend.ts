// ─── Ad spend: per-campaign, per-day rows for the Money "Ads" view ───────────
//
// SERVER ONLY. TikTok Business API (Integrated Report, campaign × day), using
// the same TIKTOK_ACCESS_TOKEN as /analytics and each app's
// <APP>_TIKTOK_ADVERTISER_ID. Rows land in ad_spend (clarendon-studio).
// Meta plugs in here later with the same row shape.
//
// Installs: TikTok reports SKAdNetwork installs separately from its own
// attributed installs; we take the attributed figure and fall back to SKAN
// when it's zero, so the two are never added together. Same for purchase value.

export type CampaignDay = {
  platform: 'tiktok' | 'meta'
  advertiser_id: string
  campaign_id: string
  campaign_name: string | null
  day: string
  spend_cents: number
  impressions: number
  clicks: number
  installs: number
  conversions: number
  purchase_value_cents: number
  currency: string
}

const API = 'https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/'
const METRICS = ['campaign_name', 'spend', 'impressions', 'clicks', 'conversion', 'app_install', 'skan_app_install', 'total_purchase_value', 'skan_total_purchase_value', 'currency']

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Splits [start, end] into windows TikTok accepts with a daily breakdown (≤ 30 days). */
function windows(start: string, end: string): [string, string][] {
  const out: [string, string][] = []
  let s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  while (s <= e) {
    const w = new Date(Math.min(e.getTime(), s.getTime() + 29 * 86400000))
    out.push([iso(s), iso(w)])
    s = new Date(w.getTime() + 86400000)
  }
  return out
}

export async function tiktokCampaignDays(advertiserId: string, start: string, end: string): Promise<CampaignDay[] | { error: string }> {
  const token = process.env.TIKTOK_ACCESS_TOKEN
  if (!token) return { error: 'TIKTOK_ACCESS_TOKEN is not set' }
  const rows: CampaignDay[] = []
  for (const [from, to] of windows(start, end)) {
    for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(['campaign_id', 'stat_time_day']), metrics: JSON.stringify(METRICS),
        start_date: from, end_date: to, page: String(page), page_size: '1000',
      })
      let data: any
      try {
        const res = await fetch(`${API}?${params}`, { headers: { 'Access-Token': token }, cache: 'no-store', signal: AbortSignal.timeout(20000) })
        data = await res.json()
      } catch (e) {
        return { error: `TikTok report failed: ${(e as Error).message}` }
      }
      if (data?.code !== 0) return { error: `TikTok: ${data?.message ?? 'unknown error'} (code ${data?.code})` }
      pages = Number(data.data?.page_info?.total_page ?? 1)
      for (const r of data.data?.list ?? []) {
        const m = r.metrics ?? {}
        const spend = n(m.spend), impressions = n(m.impressions)
        if (spend === 0 && impressions === 0) continue
        const installs = n(m.app_install) || n(m.skan_app_install)
        const value = n(m.total_purchase_value) || n(m.skan_total_purchase_value)
        rows.push({
          platform: 'tiktok', advertiser_id: advertiserId,
          campaign_id: String(r.dimensions?.campaign_id ?? ''),
          campaign_name: m.campaign_name ?? null,
          day: String(r.dimensions?.stat_time_day ?? '').slice(0, 10),
          spend_cents: Math.round(spend * 100), impressions, clicks: n(m.clicks),
          installs, conversions: n(m.conversion), purchase_value_cents: Math.round(value * 100),
          currency: m.currency ?? 'USD',
        })
      }
    }
  }
  return rows
}
