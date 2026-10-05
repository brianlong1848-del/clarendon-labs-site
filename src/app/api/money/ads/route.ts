import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ─── /api/money/ads?days=30 — per-campaign ad performance ───────────────────
//
// Web Money → Ads and the Studio app's Ads screen. Reads ad_spend (synced from
// TikTok by /api/cron/ad-spend) and App Store proceeds (revenue) through the
// signed-in session, so RLS (owner + 2FA) applies.
//
// Two ROAS numbers, because they answer different questions:
//   platform ROAS — the purchase value TikTok itself attributes to the campaign
//   est. ROAS     — the app's real App Store proceeds in the window, credited to
//                   each campaign by its share of that app's ad installs
// Proceeds aren't tagged by campaign, so est. ROAS is an estimate; app-level
// blended ROAS (proceeds ÷ all ad spend) is exact.

type AdRow = {
  platform: string; app_slug: string | null; day: string; campaign_id: string; campaign_name: string | null
  spend_cents: number; impressions: number | null; clicks: number | null; installs: number | null
  conversions: number | null; purchase_value_cents: number | null; synced_at: string | null
}

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const sb = await supabaseServer()
  const [ads, rev, apps] = await Promise.all([
    sb.from('ad_spend').select('platform,app_slug,day,campaign_id,campaign_name,spend_cents,impressions,clicks,installs,conversions,purchase_value_cents,synced_at').gte('day', since).order('day'),
    sb.from('revenue').select('app_slug,period,proceeds_cents').gte('period', since),
    sb.from('apps').select('slug,name'),
  ])
  if (ads.error) return NextResponse.json({ error: ads.error.message }, { status: 500 })

  const num = (v: unknown) => Number(v ?? 0) || 0
  const proceeds: Record<string, number> = {}
  for (const r of rev.data ?? []) if (r.app_slug) proceeds[r.app_slug] = (proceeds[r.app_slug] ?? 0) + num(r.proceeds_cents)

  type Camp = { platform: string; app_slug: string | null; campaign_id: string; name: string; spend: number; impressions: number; clicks: number; installs: number; value: number; first: string; last: string; daily: Record<string, number> }
  const camps = new Map<string, Camp>()
  let lastSync: string | null = null
  for (const r of (ads.data ?? []) as AdRow[]) {
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

  const campaigns = Array.from(camps.values()).map((c) => {
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
  return NextResponse.json({
    days, since, last_sync: lastSync,
    totals: { spend_cents: total.spend, installs: total.installs, proceeds_cents: total.proceeds, cpi_cents: total.installs ? Math.round(total.spend / total.installs) : null, blended_roas: ratio(total.proceeds, total.spend) },
    apps: appsOut, campaigns, app_names: apps.data ?? [],
  })
}
