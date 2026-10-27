import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { campaignMedia, mediaFields } from '@/lib/ads/media'

// ─── /api/ads/media?platform=&campaign_id=&app=&ad_id=&fresh=1 ──────────────
//
// The thumbnail / playable URL / permalink for one campaign (or one of its
// ads). The Campaigns card and Money → Ads already carry these on their rows;
// this is for the player to re-resolve a link that expired (Meta and TikTok
// CDN URLs 403 after a while) — `fresh=1` skips the hour-long memo.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const u = new URL(req.url)
  const platform = u.searchParams.get('platform')
  const campaignId = u.searchParams.get('campaign_id') ?? ''
  if ((platform !== 'tiktok' && platform !== 'meta') || !campaignId) return NextResponse.json({ error: 'platform and campaign_id are required.' }, { status: 400 })
  const m = await campaignMedia(platform, campaignId, u.searchParams.get('app') || null, u.searchParams.get('fresh') === '1')
  const adId = u.searchParams.get('ad_id')
  return NextResponse.json({ media: mediaFields(adId ? m.ads[adId] ?? m.media : m.media), ad_count: m.ad_count })
}
