import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { adsReportForSession } from '@/lib/money/adsReport'
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

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365)
  let report
  try { report = await adsReportForSession(await supabaseServer(), days) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  const media = new Map(await Promise.all(report.campaigns.map(async (c) =>
    [`${c.platform}:${c.campaign_id}`, c.platform === 'tiktok' || c.platform === 'meta' ? await campaignMedia(c.platform, c.campaign_id, c.app_slug).catch(() => null) : null] as const)))
  return NextResponse.json({
    ...report,
    campaigns: report.campaigns.map((c) => ({ ...c, ...mediaFields(media.get(`${c.platform}:${c.campaign_id}`)?.media), ad_count: media.get(`${c.platform}:${c.campaign_id}`)?.ad_count })),
  })
}
