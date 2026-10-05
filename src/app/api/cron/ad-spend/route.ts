import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { analyticsRegistry } from '@/lib/analytics/registry'
import { tiktokCampaignDays } from '@/lib/money/adSpend'

// Nightly (vercel.json) and the "Sync now" button on Money → Ads: pull every
// app's TikTok campaigns, day by day, into ad_spend. Idempotent: rows are keyed
// on (platform, day, campaign_id), so re-pulling a window just refreshes it,
// which also picks up TikTok's late attribution. Backfill with ?days=365.
//
// Jinglewire is kid-directed: no ad attribution is ever linked for it.
// Auth: Vercel Cron's CRON_SECRET bearer, or the signed-in admin session.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NEVER = new Set(['jinglewire'])

export async function GET(req: Request) {
  const cron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cron && !(await consoleAuthed())) return new NextResponse('Unauthorized', { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'Studio DB env missing' }, { status: 500 })

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 7, 1), 365)
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)

  const results: Record<string, { rows?: number; error?: string; skipped?: string }> = {}
  for (const app of analyticsRegistry()) {
    if (NEVER.has(app.id)) { results[app.id] = { skipped: 'kid-directed' }; continue }
    if (!app.tiktokAdvertiserId) { results[app.id] = { skipped: 'no TikTok ad account' }; continue }
    const rows = await tiktokCampaignDays(app.tiktokAdvertiserId, start, end)
    if ('error' in rows) { results[app.id] = { error: rows.error }; continue }
    const now = new Date().toISOString()
    const saved = await db.upsert('ad_spend', rows.map((r) => ({ ...r, owner_id: db.owner, app_slug: app.id, synced_at: now })), 'platform,day,campaign_id')
    results[app.id] = saved.ok ? { rows: rows.length } : { error: saved.error }
  }
  return NextResponse.json({ ok: true, window: { start, end }, results })
}
