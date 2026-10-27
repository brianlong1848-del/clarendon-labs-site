/* eslint-disable @next/next/no-img-element -- platform CDN images (Meta / TikTok / studio-media) */
'use client'
import { useState } from 'react'
import { C } from '@/components/AdminNav'
import { PlatformGlyph } from '@/components/post/shared'
import { MediaViewer, Thumb } from '@/components/post/MediaViewer'

// ─── Ad thumbnail ────────────────────────────────────────────────────────────
//
// The video (or image) an ad shows, on a campaign row and on each ad row —
// so Brian can see which post each one is. Click opens the same player the
// Post queue uses; a platform link that has expired is re-resolved once via
// /api/ads/media?fresh=1. With no media (TikTok until its Creative
// Management scope is approved) the tile is a platform glyph that opens the
// post on TikTok, or Ads Manager.

export type AdThumbMedia = { media_kind?: 'video' | 'image' | 'placeholder'; thumbnail_url?: string; video_url?: string; permalink?: string; media_note?: string }

export function AdThumb({ platform, campaignId, appId, adId, media, badge, size = 44 }:
  { platform: 'tiktok' | 'meta'; campaignId: string; appId?: string | null; adId?: string; media: AdThumbMedia; badge?: string; size?: number }) {
  const [viewing, setViewing] = useState(false)
  const url = media.video_url ?? (media.media_kind === 'image' ? media.thumbnail_url : undefined)
  const kind: 'video' | 'image' = media.video_url ? 'video' : 'image'
  const box: React.CSSProperties = { width: size, height: size, borderRadius: 9, overflow: 'hidden', background: C.card2, flex: 'none', position: 'relative' }
  const refresh = async (old: string) => {
    const q = new URLSearchParams({ platform, campaign_id: campaignId, fresh: '1', ...(appId ? { app: appId } : {}), ...(adId ? { ad_id: adId } : {}) })
    const r = await fetch(`/api/ads/media?${q}`)
    const j = await r.json().catch(() => ({}))
    const next: string | undefined = j.media?.video_url ?? j.media?.thumbnail_url
    return next && next !== old ? next : null
  }
  if (url) {
    return (
      <>
        <div style={box}>
          <Thumb item={{ url, kind }} poster={media.thumbnail_url} badge={badge} onOpen={() => setViewing(true)} title={media.permalink ? 'Play · open on the platform from the row' : 'Play'} />
        </div>
        {viewing && <MediaViewer media={[{ url, kind }]} start={0} onClose={() => setViewing(false)} refresh={refresh} />}
      </>
    )
  }
  if (media.thumbnail_url) {
    // Thumbnail only (no playable link): opens the post on the platform.
    return (
      <a href={media.permalink} target="_blank" rel="noreferrer" title={media.media_note ?? 'Open the post'} style={box}>
        <img src={media.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {badge && <span style={badgeStyle}>{badge}</span>}
      </a>
    )
  }
  const inner = (
    <>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 0.55 }}><PlatformGlyph platform={platform === 'tiktok' ? 'tiktok' : 'facebook'} size={18} /></span>
      {badge && <span style={badgeStyle}>{badge}</span>}
    </>
  )
  return media.permalink
    ? <a href={media.permalink} target="_blank" rel="noreferrer" title={media.media_note ?? 'Open on the platform'} aria-label="Open the ad on the platform" style={{ ...box, display: 'block' }}>{inner}</a>
    : <span title={media.media_note ?? 'No preview for this ad'} style={{ ...box, display: 'block' }}>{inner}</span>
}

const badgeStyle: React.CSSProperties = { position: 'absolute', top: 3, right: 3, fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: 99, padding: '1px 5px' }
