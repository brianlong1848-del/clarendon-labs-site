// ─── Ad media: which video each campaign and ad is ───────────────────────────
//
// SERVER ONLY. A thumbnail + playable URL + permalink per campaign and per
// ad, for the Campaigns card, Money → Ads and the Studio app (FEAT-CLA-022
// follow-up). Sources, cheapest first:
//   • Studio boosts (Meta or TikTok): studio_promotions → post → studio_posts
//     media (the platform's own cut when there is one). No API call.
//   • Other Meta ads: ad → creative {thumbnail_url, video_id,
//     effective_instagram_media_id, effective_object_story_id}; the video's
//     `source` or the IG media's media_url for playback.
//   • TikTok Spark ads: ad/get → tiktok_item_id + identity → identity/video/info
//     (cover + preview); other TikTok ads: video_id → file/video/ad/info
//     (poster_url + preview_url). Both need the Ads / Creative Management
//     scopes still under TikTok review (submitted 2026-10-27) and answer 40001
//     until then — the row gets a placeholder tile linking to the post
//     (tiktok.com/@handle/video/<item_id>) or Ads Manager.
// Lookups are memoized for an hour (media doesn't change); platform CDN URLs
// do expire, so /api/ads/media?fresh=1 re-resolves one when playback 403s.

import { tiktokAdvertiserId, tiktokCached, tiktokCall } from '@/lib/analytics/tiktok'
import { getPost, rest } from '@/lib/publish/store'
import { getToken } from '@/lib/publish/tokens'
import type { Platform } from '@/lib/publish/rules'
import { metaCampaignAds, metaConfigured, metaGet, type MetaAdCreative, type Promotion } from './meta'
import { adsManagerUrl } from './tiktok'

export type AdMedia = {
  kind: 'video' | 'image' | 'placeholder'
  thumbnail_url?: string
  video_url?: string
  /** The post on the platform (or Ads Manager when the post isn't known). */
  permalink?: string
  /** Why there's only a placeholder. */
  note?: string
}
export type CampaignMedia = { media: AdMedia | null; ad_count: number; ads: Record<string, AdMedia> }

const HOUR = 60 * 60_000
const EMPTY: CampaignMedia = { media: null, ad_count: 0, ads: {} }
export const TIKTOK_MEDIA_NOTE = 'TikTok video previews need the Creative Management scope (under TikTok review since 2026-10-27). Opens the post on TikTok, or Ads Manager.'

/** Media for one campaign and each of its ads. Memoized for an hour per
 *  platform + campaign; `fresh` re-resolves (expired CDN links). */
export function campaignMedia(platform: 'tiktok' | 'meta', campaignId: string, appId: string | null, fresh = false): Promise<CampaignMedia> {
  return tiktokCached(`media:${platform}:${campaignId}`, fresh, () => campaignMediaNow(platform, campaignId, appId).catch(() => EMPTY), HOUR)
}

async function campaignMediaNow(platform: 'tiktok' | 'meta', campaignId: string, appId: string | null): Promise<CampaignMedia> {
  const promo = (await rest<Pick<Promotion, 'id' | 'post_id' | 'platform' | 'permalink' | 'ad_id' | 'remote_id' | 'app_id'>[]>(
    `studio_promotions?network=eq.${platform}&campaign_id=eq.${encodeURIComponent(campaignId)}&select=id,post_id,platform,permalink,ad_id,remote_id,app_id&limit=1`).catch(() => []))[0]
  if (promo) {
    const m = await promoMedia(promo)
    if (m) return { media: m, ad_count: 1, ads: promo.ad_id ? { [promo.ad_id]: m } : {} }
  }
  if (platform === 'meta') {
    if (!metaConfigured()) return EMPTY
    const ads = await metaCampaignAds(campaignId)
    const resolved = await Promise.all(ads.map(async (a) => [a.ad_id, await metaAdMedia(a.creative)] as const))
    const out: Record<string, AdMedia> = {}
    for (const [id, m] of resolved) if (m) out[id] = m
    const first = ads.map((a) => out[a.ad_id]).find(Boolean) ?? null
    return { media: first, ad_count: ads.length, ads: out }
  }
  const advertiserId = appId ? tiktokAdvertiserId(appId) : undefined
  if (!advertiserId) return EMPTY
  const handle = appId ? await tiktokHandle(appId) : undefined
  let ads: { ad_id: string; item?: string; identity?: string; identityType?: string; video?: string }[] = []
  try {
    const data = await tiktokCall('/ad/get/', { query: { advertiser_id: advertiserId, page_size: '100', filtering: JSON.stringify({ campaign_ids: [campaignId] }),
      fields: JSON.stringify(['ad_id', 'tiktok_item_id', 'identity_id', 'identity_type', 'video_id']) } })
    ads = (data.list ?? []).map((a: any) => ({ ad_id: String(a.ad_id), item: a.tiktok_item_id, identity: a.identity_id, identityType: a.identity_type, video: a.video_id }))
  } catch {
    // ad/get is 40001 until the scope is approved: one placeholder for the campaign.
    return { media: { kind: 'placeholder', permalink: promo?.permalink ?? adsManagerUrl(advertiserId), note: TIKTOK_MEDIA_NOTE }, ad_count: 0, ads: {} }
  }
  const out: Record<string, AdMedia> = {}
  for (const a of ads) out[a.ad_id] = await tiktokAdMedia(advertiserId, a, handle)
  const first = ads.map((a) => out[a.ad_id]).find(Boolean) ?? null
  return { media: first, ad_count: ads.length, ads: out }
}

/** A Studio boost's media is the post's own file — the platform's cut when it has one. */
async function promoMedia(p: Pick<Promotion, 'post_id' | 'platform' | 'permalink'>): Promise<AdMedia | null> {
  if (!p.post_id) return p.permalink ? { kind: 'placeholder', permalink: p.permalink } : null
  const post = await getPost(p.post_id).catch(() => null)
  if (!post) return p.permalink ? { kind: 'placeholder', permalink: p.permalink } : null
  const m = post.media_overrides?.[p.platform as Platform]?.[0] ?? post.media[0]
  if (!m) return p.permalink ? { kind: 'placeholder', permalink: p.permalink } : null
  return m.kind === 'video'
    ? { kind: 'video', video_url: m.url, permalink: p.permalink ?? undefined }
    : { kind: 'image', thumbnail_url: m.url, permalink: p.permalink ?? undefined }
}

/** Playable URL + thumbnail for a Meta creative. Each video / IG media is
 *  resolved once an hour. */
async function metaAdMedia(c?: MetaAdCreative): Promise<AdMedia | null> {
  if (!c) return null
  const story = c.effective_object_story_id
  const permalink = c.instagram_permalink_url ?? (story && story.includes('_') ? `https://www.facebook.com/${story.replace('_', '/posts/')}` : undefined)
  if (c.video_id) {
    const v = await tiktokCached(`meta-video:${c.video_id}`, false, () => metaGet(c.video_id!, { fields: 'source,picture,permalink_url' }).catch(() => ({})), HOUR)
    return { kind: 'video', video_url: v.source, thumbnail_url: v.picture ?? c.thumbnail_url, permalink: permalink ?? (v.permalink_url ? `https://www.facebook.com${v.permalink_url}` : undefined) }
  }
  if (c.effective_instagram_media_id) {
    const ig = await tiktokCached(`meta-ig:${c.effective_instagram_media_id}`, false, () => metaGet(c.effective_instagram_media_id!, { fields: 'media_url,thumbnail_url,permalink,media_type' }).catch(() => ({})), HOUR)
    const video = ig.media_type === 'VIDEO'
    return { kind: video ? 'video' : 'image', video_url: video ? ig.media_url : undefined, thumbnail_url: ig.thumbnail_url ?? (video ? c.thumbnail_url : ig.media_url ?? c.thumbnail_url), permalink: ig.permalink ?? permalink }
  }
  if (c.thumbnail_url) return { kind: 'image', thumbnail_url: c.thumbnail_url, permalink }
  return permalink ? { kind: 'placeholder', permalink } : null
}

/** Cover + preview for a TikTok ad: Spark (identity + item) or uploaded video. */
async function tiktokAdMedia(advertiserId: string, a: { item?: string; identity?: string; identityType?: string; video?: string }, handle?: string): Promise<AdMedia> {
  const postUrl = handle && a.item ? `https://www.tiktok.com/@${handle}/video/${a.item}` : undefined
  const fallback: AdMedia = { kind: 'placeholder', permalink: postUrl ?? adsManagerUrl(advertiserId), note: TIKTOK_MEDIA_NOTE }
  const pick = (v: any) => ({ cover: v?.video_cover_url ?? v?.cover_url ?? v?.poster_url, preview: v?.preview_url ?? v?.video_url ?? v?.play_url ?? v?.url })
  try {
    if (a.item && a.identity) {
      const data = await tiktokCall('/identity/video/info/', { query: { advertiser_id: advertiserId, identity_id: a.identity, identity_type: a.identityType ?? 'BC_AUTH_TT',
        ...(process.env.TIKTOK_BC_ID && a.identityType === 'BC_AUTH_TT' ? { identity_authorized_bc_id: process.env.TIKTOK_BC_ID } : {}), item_id: a.item } })
      const { cover, preview } = pick(data.video_info ?? data.list?.[0] ?? data)
      if (cover || preview) return { kind: preview ? 'video' : 'image', thumbnail_url: cover, video_url: preview, permalink: postUrl ?? adsManagerUrl(advertiserId) }
    } else if (a.video) {
      const data = await tiktokCall('/file/video/ad/info/', { query: { advertiser_id: advertiserId, video_ids: JSON.stringify([a.video]) } })
      const { cover, preview } = pick(data.list?.[0])
      if (cover || preview) return { kind: preview ? 'video' : 'image', thumbnail_url: cover, video_url: preview, permalink: adsManagerUrl(advertiserId) }
    }
  } catch { /* scope not granted yet, or no preview for this ad */ }
  return fallback
}

/** The app's TikTok handle: env override, else the connected posting account. */
async function tiktokHandle(appId: string): Promise<string | undefined> {
  const env = process.env[`${appId.toUpperCase()}_TIKTOK_HANDLE`]
  if (env) return env.replace(/^@/, '')
  for (const platform of ['tiktok', 'tiktok-biz']) {
    const row = await getToken(platform, appId).catch(() => undefined)
    if (row?.username) return row.username.replace(/^@/, '')
  }
  return undefined
}

/** The flat fields the APIs put on a row (all optional so older Studio builds decode). */
export function mediaFields(m: AdMedia | null | undefined) {
  if (!m) return {}
  return { media_kind: m.kind, thumbnail_url: m.thumbnail_url, video_url: m.video_url, permalink: m.permalink, media_note: m.note }
}
