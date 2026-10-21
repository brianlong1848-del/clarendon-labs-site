import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { tiktokCampaignDays } from '@/lib/money/adSpend'
import { closeFinished, metaCampaignDays } from '@/lib/ads/meta'

// Nightly (vercel.json) and the "Sync now" button on Money → Ads: pull every
// app's TikTok campaigns, plus every campaign on the shared Meta ad account, day by day, into ad_spend. Idempotent: rows are keyed
// on (platform, day, campaign_id), so re-pulling a window just refreshes it,
// which also picks up TikTok's late attribution. Backfill with ?days=365.
//
// Jinglewire is kid-directed: its spend is tracked, but attribution
// (installs, conversions, purchase value) is always zeroed.
// Auth: Vercel Cron's CRON_SECRET bearer, or the signed-in admin session.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_ATTRIBUTION = new Set(['jinglewire'])
// Every app with a TikTok ad account, read from <APP>_TIKTOK_ADVERTISER_ID.
const TIKTOK_APPS = ['rolligan', 'gagorder', 'yulepick', 'borea', 'jinglewire']
  .map((id) => ({ id, advertiserId: process.env[`${id.toUpperCase()}_TIKTOK_ADVERTISER_ID`] || undefined }))

export async function GET(req: Request) {
  const cron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cron && !(await consoleAuthed())) return new NextResponse('Unauthorized', { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'Studio DB env missing' }, { status: 500 })

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 7, 1), 365)
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)

  const results: Record<string, { rows?: number; error?: string; skipped?: string }> = {}
  // TikTok isn't connected until TIKTOK_ACCESS_TOKEN is set: report that once
  // as a note, not a per-app error.
  const tiktokOn = !!process.env.TIKTOK_ACCESS_TOKEN
  if (!tiktokOn) results.tiktok = { skipped: 'not connected yet' }
  for (const app of tiktokOn ? TIKTOK_APPS : []) {
    if (!app.advertiserId) { results[app.id] = { skipped: 'no TikTok ad account' }; continue }
    const pulled = await tiktokCampaignDays(app.advertiserId, start, end)
    if ('error' in pulled) { results[app.id] = { error: pulled.error }; continue }
    const rows = NO_ATTRIBUTION.has(app.id)
      ? pulled.map((r) => ({ ...r, installs: 0, conversions: 0, purchase_value_cents: 0 }))
      : pulled
    const now = new Date().toISOString()
    const saved = await db.upsert('ad_spend', rows.map((r) => ({ ...r, owner_id: db.owner, app_slug: app.id, synced_at: now })), 'platform,day,campaign_id')
    results[app.id] = saved.ok ? { rows: rows.length } : { error: saved.error }
  }
  // Meta: one shared ad account; each campaign row already carries its app.
  // Jinglewire rows keep spend only (metaCampaignDays zeroes attribution).
  const meta = await metaCampaignDays(start, end)
  if ('error' in meta) results.meta = { error: meta.error }
  else if (meta.length) {
    const now = new Date().toISOString()
    const saved = await db.upsert('ad_spend', meta.map((r) => ({ ...r, owner_id: db.owner, synced_at: now })), 'platform,day,campaign_id')
    results.meta = saved.ok ? { rows: meta.length } : { error: saved.error }
  } else results.meta = { rows: 0 }
  await closeFinished()

  return NextResponse.json({ ok: true, window: { start, end }, results })
}
