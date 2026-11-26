import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { ADS_RANGES, adsReportForSession, rangeWindow, storeSplit, strategyBlock, type AdsApiResponse, type AdsRange } from '@/lib/money/adsReport'
import { adsState } from '@/lib/ads/strategy'
import { appName } from '@/lib/ads/labels'
import { scoreboardCounts } from '@/lib/money/scoreboard'
import { campaignMedia, mediaFields } from '@/lib/ads/media'

export const dynamic = 'force-dynamic'

// ─── /api/money/ads?days=30 — per-campaign ad performance ───────────────────
//
// Web Money → Ads and the Studio app's Ads screen. Reads ad_spend (synced from
// TikTok and Meta by /api/cron/ad-spend) and App Store proceeds (revenue)
// through the signed-in session, so RLS (owner + 2FA) applies. The numbers
// are built in src/lib/money/adsReport.ts (shared with Ad insights).
//
// Two ROAS numbers, because they answer different questions:
//   platform ROAS — the purchase value TikTok / Meta itself attributes to the campaign
//   est. ROAS     — the app's real App Store proceeds in the window, credited to
//                   each campaign by its share of that app's ad installs
// Proceeds aren't tagged by campaign, so est. ROAS is an estimate; app-level
// blended ROAS (proceeds ÷ all ad spend) is exact.
// Each campaign also carries which video it is (thumbnail / player; src/lib/ads/media.ts).
//
// 2026-11-14 (all optional, AdsApiResponse in adsReport.ts): ?range=7d|30d|90d|1y|lifetime
// (wins over ?days), per-campaign label / app_name / installs_why, daily totals,
// the App Store + Google Play split with blended ROAS on both (`stores`), and
// the strategy block (paused apps, gates, last-7-day spend).

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const rangeParam = q.get('range') as AdsRange | null
  const range = rangeParam && ADS_RANGES.includes(rangeParam) ? rangeParam : undefined
  const win = range ? rangeWindow(range) : { days: Math.min(Math.max(Number(q.get('days')) || 30, 1), 365), since: undefined }
  let report
  try { report = await adsReportForSession(await supabaseServer(), win.days, { since: win.since }) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))])
  const [media, stores, counts] = await Promise.all([
    Promise.all(report.campaigns.map(async (c) =>
      [`${c.platform}:${c.campaign_id}`, c.platform === 'tiktok' || c.platform === 'meta' ? await campaignMedia(c.platform, c.campaign_id, c.app_slug).catch(() => null) : null] as const)).then((e) => new Map(e)),
    // Store reads never fail the page: a timeout leaves `stores` out.
    timeout(storeSplit(report).catch(() => undefined), 15000),
    timeout(scoreboardCounts(report.since, new Date().toISOString().slice(0, 10)).catch(() => undefined), 8000),
  ])
  const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)
  const playBy = new Map((stores?.apps ?? []).map((a) => [a.app_slug, a]))
  const playTotal = stores?.google_play.proceeds_cents ?? 0
  const out: AdsApiResponse = {
    ...report,
    range,
    totals: {
      ...report.totals,
      // proceeds_cents is App Store + Website (Stripe); Play is added from its reports.
      app_store_proceeds_cents: report.totals.proceeds_cents - (report.totals.web_proceeds_cents ?? 0),
      website_proceeds_cents: report.totals.web_proceeds_cents ?? 0,
      google_play_proceeds_cents: stores ? playTotal : undefined,
      app_store_installs: stores?.app_store.installs,
      google_play_installs: stores?.google_play.installs,
      blended_roas_all: ratio(report.totals.proceeds_cents + playTotal, report.totals.spend_cents),
    },
    apps: report.apps.map((a) => {
      const s = playBy.get(a.app_slug)
      const play = s?.google_play?.proceeds_cents ?? 0
      return { ...a, app_name: appName(a.app_slug === 'shared' ? null : a.app_slug), google_play_proceeds_cents: s?.google_play ? play : undefined,
        app_store_installs: s?.app_store?.installs, google_play_installs: s?.google_play?.installs,
        blended_roas_all: ratio(a.proceeds_cents + play, a.spend_cents), ads_state: adsState(a.app_slug) }
    }),
    campaigns: report.campaigns.map((c) => ({ ...c, ...mediaFields(media.get(`${c.platform}:${c.campaign_id}`)?.media), ad_count: media.get(`${c.platform}:${c.campaign_id}`)?.ad_count })),
    stores,
    strategy: strategyBlock(report, counts ?? {}),
  }
  return NextResponse.json(out)
}
