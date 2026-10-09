// ─── Publishing rules ────────────────────────────────────────────────────────
//
// SHARED by the server (final gate before anything is sent) and the /post
// composer (live checks while you type). The Studio iOS app mirrors these in
// PublishRules.swift — change one, change both.
//
// Numbers are each platform's published API limits (not their in-app ones),
// kept conservative where the docs disagree with themselves.

export type Platform = 'instagram' | 'facebook' | 'threads' | 'tiktok'
export type Format = 'feed' | 'reel' | 'story' | 'post'
export type MediaKind = 'image' | 'video'
export type MediaItem = { url: string; path?: string; kind: MediaKind; width: number; height: number; duration?: number; mime?: string; size?: number }
export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
/** What the TikTok card collects. TikTok's rules: privacy has no default, the
 *  interaction switches start off, and commercial content must be disclosed. */
export type TikTokSettings = {
  mode: 'direct' | 'draft'
  privacy?: TikTokPrivacy
  allowComment?: boolean; allowDuet?: boolean; allowStitch?: boolean
  /** Commercial content disclosure: promoting your own business / a paid partnership. */
  commercial?: boolean; yourBrand?: boolean; brandedContent?: boolean
}
export type Target = { platform: Platform; format: Format; tiktok?: TikTokSettings }

export const TIKTOK_PRIVACY_LABEL: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone', MUTUAL_FOLLOW_FRIENDS: 'Friends', FOLLOWER_OF_CREATOR: 'Followers', SELF_ONLY: 'Only me',
}
export type Issue = { platform: Platform; level: 'error' | 'warn'; text: string }

export const PLATFORMS: { id: Platform; name: string; formats: Format[]; captionMax: number }[] = [
  { id: 'instagram', name: 'Instagram', formats: ['feed', 'reel', 'story'], captionMax: 2200 },
  { id: 'facebook', name: 'Facebook', formats: ['post', 'reel'], captionMax: 63206 },
  { id: 'threads', name: 'Threads', formats: ['post'], captionMax: 500 },
  { id: 'tiktok', name: 'TikTok', formats: ['post'], captionMax: 2200 },
]

export const FORMAT_LABEL: Record<Format, string> = { feed: 'Post', reel: 'Reel', story: 'Story', post: 'Post' }

/** Which format a target should default to for this media. */
export function defaultFormat(platform: Platform, media: MediaItem[]): Format {
  const oneVideo = media.length === 1 && media[0].kind === 'video'
  if (platform === 'facebook') return oneVideo && fbReelOK(media[0]) ? 'reel' : 'post'
  if (platform !== 'instagram') return 'post'
  return oneVideo ? 'reel' : 'feed'
}

/** Facebook Reels: one vertical video, 3–90 seconds. */
export function fbReelOK(m: MediaItem) {
  const d = m.duration ?? 0
  return m.kind === 'video' && m.height > m.width && d >= 3 && d <= 90
}

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length

export function captionFor(platform: Platform, caption: string, overrides: Partial<Record<Platform, string>>) {
  const o = overrides[platform]
  return o != null && o !== '' ? o : caption
}

export function validate(targets: Target[], media: MediaItem[], caption: string,
                         overrides: Partial<Record<Platform, string>> = {}): Issue[] {
  const issues: Issue[] = []
  const images = media.filter((m) => m.kind === 'image')
  const videos = media.filter((m) => m.kind === 'video')
  const add = (platform: Platform, level: Issue['level'], text: string) => issues.push({ platform, level, text })

  if (targets.length === 0) return issues
  for (const t of targets) {
    const text = captionFor(t.platform, caption, overrides)
    const spec = PLATFORMS.find((p) => p.id === t.platform)!
    if (text.length > spec.captionMax) add(t.platform, 'error', `Caption is ${text.length - spec.captionMax} characters over ${spec.name}'s ${spec.captionMax.toLocaleString()} limit.`)

    if (t.platform === 'instagram') {
      if (media.length === 0) add(t.platform, 'error', 'Instagram needs a photo or video.')
      if (count(/(^|\s)#\w/g, text) > 30) add(t.platform, 'error', 'Instagram allows 30 hashtags at most.')
      if (count(/(^|\s)@\w/g, text) > 20) add(t.platform, 'error', 'Instagram allows 20 @mentions at most.')
      if (t.format === 'reel' && (media.length !== 1 || videos.length !== 1)) add(t.platform, 'error', 'A Reel is exactly one video.')
      if (t.format === 'story' && media.length !== 1) add(t.platform, 'error', 'A Story is one photo or one video — the first item will not be chosen for you.')
      if (t.format === 'feed' && media.length > 10) add(t.platform, 'error', 'Instagram carousels hold up to 10 items.')
      if (t.format === 'feed' && media.length === 1 && videos.length === 1) add(t.platform, 'warn', 'A single video is published as a Reel.')
      for (const m of images) {
        const r = m.width / m.height
        if (t.format === 'feed' && (r < 0.8 - 0.01 || r > 1.91 + 0.01)) add(t.platform, 'error', `A photo is ${ratioName(r)} — Instagram feed photos must be between 4:5 and 1.91:1. Crop it or post it as a Story.`)
        if (m.mime && m.mime !== 'image/jpeg') add(t.platform, 'warn', 'Photos are converted to JPEG for Instagram.')
      }
      for (const m of videos) {
        const d = m.duration ?? 0
        if (t.format === 'story' && d > 60) add(t.platform, 'error', `Story videos can be up to 60 seconds (this one is ${Math.round(d)}s).`)
        if (t.format !== 'story' && d > 15 * 60) add(t.platform, 'error', 'Reels can be up to 15 minutes.')
        if (d && d < 3) add(t.platform, 'error', 'Videos must be at least 3 seconds.')
        if ((t.format === 'reel' || t.format === 'story') && Math.abs(m.width / m.height - 9 / 16) > 0.08) add(t.platform, 'warn', `This video is ${ratioName(m.width / m.height)}; Reels and Stories look best at 9:16.`)
      }
      if (t.format === 'story' && text) add(t.platform, 'warn', 'Stories don’t show captions — the caption is skipped here.')
    }

    if (t.platform === 'facebook') {
      if (media.length === 0 && !text.trim()) add(t.platform, 'error', 'Add a caption or media for Facebook.')
      if (videos.length > 1 || (videos.length && images.length)) add(t.platform, 'error', 'Facebook posts take several photos or one video, not a mix.')
      if (t.format === 'reel') {
        if (media.length !== 1 || videos.length !== 1) add(t.platform, 'error', 'A Facebook Reel is exactly one video.')
        else {
          const d = videos[0].duration ?? 0
          if (d > 90) add(t.platform, 'error', `Facebook Reels can be up to 90 seconds (this one is ${Math.round(d)}s) — post it as a regular video instead.`)
          if (d && d < 3) add(t.platform, 'error', 'Facebook Reels must be at least 3 seconds.')
          if (Math.abs(videos[0].width / videos[0].height - 9 / 16) > 0.08) add(t.platform, 'warn', `This video is ${ratioName(videos[0].width / videos[0].height)}; Facebook Reels look best at 9:16.`)
        }
      }
    }

    if (t.platform === 'threads') {
      if (media.length === 0 && !text.trim()) add(t.platform, 'error', 'A Thread needs text or media.')
      if (media.length > 10) add(t.platform, 'error', 'Threads carousels hold up to 10 items.')
      for (const m of videos) if ((m.duration ?? 0) > 300) add(t.platform, 'error', 'Threads videos can be up to 5 minutes.')
    }

    if (t.platform === 'tiktok') {
      const s = t.tiktok
      if (videos.length !== 1 || images.length) add(t.platform, 'error', 'TikTok here posts one video.')
      for (const m of videos) if (m.duration && m.duration < 3) add(t.platform, 'error', 'TikTok videos must be at least 3 seconds.')
      if (!s) add(t.platform, 'error', 'Choose how to send it to TikTok.')
      else if (s.mode === 'direct') {
        if (!s.privacy) add(t.platform, 'error', 'Choose who can see it on TikTok.')
        if (s.commercial && !s.yourBrand && !s.brandedContent) add(t.platform, 'error', 'You turned on commercial content — say whether it promotes your own brand, a paid partnership, or both.')
        if (s.brandedContent && s.privacy === 'SELF_ONLY') add(t.platform, 'error', 'Branded content can’t be private on TikTok — choose another audience.')
      }
    }
  }
  return issues
}

export function ratioName(r: number) {
  const known: [number, string][] = [[1, '1:1'], [0.8, '4:5'], [9 / 16, '9:16'], [16 / 9, '16:9'], [1.91, '1.91:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [2 / 3, '2:3'], [3 / 2, '3:2']]
  const hit = known.find(([k]) => Math.abs(k - r) < 0.02)
  return hit ? hit[1] : `${r.toFixed(2)}:1`
}
