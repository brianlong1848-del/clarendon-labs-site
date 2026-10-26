// ─── Safe zones: where each app's own UI covers a full-screen vertical video ──
//
// SHARED by /post's preview overlay and the Studio iOS app (Studio/Core/SafeZones.swift
// mirrors these numbers — change one, change both). Vault: FEAT-CLA-020.
//
// Measured on a 1080×1920 (9:16) frame. Each zone is the WORST case for that
// placement: the promoted/ad state, because any organic post can be boosted later
// (a promoted TikTok adds "Sponsored" and a full-width CTA button under the caption).
// Keep faces, headlines, app screens, logos and CTAs inside the safe box; only
// expendable background may sit in the red areas.
//
// Checked 2026-10-26:
// - TikTok: TikTok's in-feed ad template (240 / 660 / 120 / 120 + a 300px action
//   column from y=840), matched against Gag Order's live Spark Ads preview.
// - Instagram + Facebook Reels and Stories: Meta's unified 9:16 safe zone (March 2026):
//   top 14%, bottom 35%, sides 6%. The right-side action column is our own
//   measurement of the Reels UI, not a Meta number.
// - Threads: video plays in the feed card with only a small mute badge; it uses the
//   Instagram cut, so the Instagram zone covers it.
// Platforms change their UI; re-check against a real post when something looks off.

export const SAFE_FRAME = { width: 1080, height: 1920 } as const

export type SafeZone = {
  label: string
  /** Covered margins in px on 1080×1920. */
  top: number; bottom: number; left: number; right: number
  /** The like/comment/share column: covers `width` px on the right from `fromY` down to the bottom margin. */
  actionColumn?: { fromY: number; width: number }
  covers: string
}

export const SAFE_ZONES: Record<'tiktok' | 'meta_reel' | 'meta_story', SafeZone> = {
  tiktok: {
    label: 'TikTok', top: 240, bottom: 660, left: 120, right: 120,
    actionColumn: { fromY: 840, width: 300 },
    covers: 'Following/For You tabs and search on top; profile, like, comment, save, share and the sound disc on the right; username, caption, "Sponsored" and the CTA button at the bottom.',
  },
  meta_reel: {
    label: 'Reels (Instagram + Facebook)', top: 269, bottom: 672, left: 65, right: 65,
    actionColumn: { fromY: 1000, width: 150 },
    covers: 'Reels header and camera on top; like, comment, share and audio on the right; username, caption, audio and ad CTA at the bottom.',
  },
  meta_story: {
    label: 'Stories (Instagram + Facebook)', top: 269, bottom: 672, left: 65, right: 65,
    covers: 'Progress bar and profile name on top; reply bar, stickers and the ad CTA at the bottom.',
  },
}

/** Which zone applies to a placement, or null when nothing covers the media (feed posts, Threads). */
export function safeZoneFor(platform: string, format: string): SafeZone | null {
  if (platform === 'tiktok') return SAFE_ZONES.tiktok
  if ((platform === 'instagram' || platform === 'facebook') && format === 'reel') return SAFE_ZONES.meta_reel
  if (platform === 'instagram' && format === 'story') return SAFE_ZONES.meta_story
  return null
}

/** The safe box in px on 1080×1920, for briefs and export checks. */
export function safeBox(z: SafeZone) {
  const right = SAFE_FRAME.width - z.right - (z.actionColumn ? z.actionColumn.width - z.right : 0)
  return { x: z.left, y: z.top, width: right - z.left, height: SAFE_FRAME.height - z.top - z.bottom }
}
