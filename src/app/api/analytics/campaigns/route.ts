import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { campaignsFor, INSTALLS_NOTE, RANGES, rangeDates, type Range } from '@/lib/ads/campaigns'

// ─── /api/analytics/campaigns?app=&range= ────────────────────────────────────
//
// One normalized row per ad campaign (TikTok + Meta) with its ads, for the
// Campaigns card on /analytics and /analytics/<app> and the Studio app
// (FEAT-CLA-022). `app` = an app id or "all" (default); `range` = 7d | 30d | 90d.
// Figures a platform doesn't report are absent, never zero. Installs and
// cost per install stay empty until App Store Connect campaign tokens land.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const u = new URL(req.url)
  const app = u.searchParams.get('app') || 'all'
  const range = (RANGES.includes(u.searchParams.get('range') as Range) ? u.searchParams.get('range') : '30d') as Range
  if (app !== 'all' && !PUBLISH_APPS.some((a) => a.id === app)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  const { campaigns, errors } = await campaignsFor(app, range)
  return NextResponse.json({
    range: { id: range, ...rangeDates(range) },
    apps: PUBLISH_APPS.map((a) => ({ id: a.id, name: a.name, accent: a.accent })),
    campaigns, errors, notes: { installs: INSTALLS_NOTE },
  })
}
