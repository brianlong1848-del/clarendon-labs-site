// ─── TikTok Business API ─────────────────────────────────────────────────────
//
// Spend/impressions/clicks off the app's ad account, via the Integrated Report
// endpoint. Needs TIKTOK_ACCESS_TOKEN (a long-lived token from the Clarendon
// Labs LLC Business Center login) plus that app's advertiser id. Only Rolligan
// has an ad account as of 2026-09-27 — Gag Order/Borea/YulePick will return
// null until theirs are created (see reference_tiktok_business_center).

export type TikTokMetrics = { spend: number; impressions: number; clicks: number } | null

export async function fetchTikTok(advertiserId?: string): Promise<TikTokMetrics> {
  const token = process.env.TIKTOK_ACCESS_TOKEN
  if (!advertiserId || !token) return null

  const end = new Date()
  const start = new Date(end.getTime() - 29 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_ADVERTISER',
    dimensions: JSON.stringify(['advertiser_id']),
    metrics: JSON.stringify(['spend', 'impressions', 'clicks']),
    start_date: fmt(start),
    end_date: fmt(end),
    page_size: '10',
  })

  try {
    const res = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`,
      { headers: { 'Access-Token': token }, cache: 'no-store', signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const row = data?.data?.list?.[0]?.metrics
    if (!row) return null
    return {
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
    }
  } catch {
    return null
  }
}
