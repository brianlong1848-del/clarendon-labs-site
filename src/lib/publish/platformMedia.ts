// ─── Per-platform media ──────────────────────────────────────────────────────
//
// SHARED by the /post composer and (hand-copied) the Studio iOS app's
// PlatformMedia.swift — change one, change both.
//
// Ads are cut once per platform (safe zones, length, music): the TikTok edit,
// the Instagram Reels edit, the Facebook Reels edit, a Threads edit. Name the
// files with their platform and each platform finds its own:
//   GAG_ad_courtroom_ig-reels_1080x1920.mp4  → Instagram
//   GAG_ad_courtroom_fb-reels_1080x1920.mp4  → Facebook
//   GAG_ad_courtroom_tiktok_1080x1920.mp4    → TikTok
//   GAG_ad_courtroom_threads_1080x1920.mp4   → Threads
// A platform with no file of its own gets, in order: the shared files (no
// platform and not a master in the name), else a sibling platform's cut
// (Threads and Facebook borrow Instagram's, TikTok borrows Instagram's
// Reels cut, Instagram borrows Facebook's), else the master. Masters
// ("…_master-no-music_…") are the edit source, so they're the last resort —
// a no-music master would post silent.

import { PLATFORMS, type Platform } from './rules'

const TAGS: Record<Platform, string[]> = {
  instagram: ['instagram', 'insta', 'ig'],
  facebook: ['facebook', 'fb'],
  threads: ['threads', 'thread'],
  tiktok: ['tiktok', 'tik tok', 'tt'],
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim()} `

/** Platforms named in a file name ("…_ig-fb-reels.mp4" → instagram + facebook). */
export function platformsFromName(name: string): Platform[] {
  const n = norm(name)
  return PLATFORMS.map((p) => p.id).filter((p) => TAGS[p].some((t) => n.includes(` ${t} `)))
}

export type PlatformAssignment = {
  /** Media keys for this platform, in upload order. */
  keys: string[]
  how: 'tagged' | 'shared' | 'borrowed' | 'master' | 'picked' | 'none'
  /** For 'borrowed': whose cut it is. */
  from?: Platform
}

/** Whose cut a platform borrows when it has none, in order. */
const BORROW: Record<Platform, Platform[]> = {
  threads: ['instagram', 'facebook', 'tiktok'],
  facebook: ['instagram', 'threads', 'tiktok'],
  instagram: ['facebook', 'threads', 'tiktok'],
  tiktok: ['instagram', 'facebook', 'threads'],
}

/** A master / source export, not meant to be posted as-is. */
export const isMaster = (name: string) => / (master|no music|nomusic|source|raw) /.test(norm(name))

/** Each platform's media: what Brian picked, else files named for it, else the
 *  shared files, else a sibling platform's cut, else the master. */
export function assignPlatformMedia(
  items: { key: string; name: string }[],
  picked: Partial<Record<Platform, string[]>> = {},
): Record<Platform, PlatformAssignment> {
  const tags = new Map(items.map((i) => [i.key, platformsFromName(i.name)]))
  const untagged = items.filter((i) => !tags.get(i.key)!.length)
  const shared = untagged.filter((i) => !isMaster(i.name)).map((i) => i.key)
  const masters = untagged.filter((i) => isMaster(i.name)).map((i) => i.key)
  const own = (p: Platform) => items.filter((i) => tags.get(i.key)!.includes(p)).map((i) => i.key)
  const out = {} as Record<Platform, PlatformAssignment>
  for (const { id } of PLATFORMS) {
    const manual = picked[id]?.filter((k) => tags.has(k))
    if (manual) { out[id] = { keys: manual, how: 'picked' }; continue }
    const mine = own(id)
    if (mine.length) { out[id] = { keys: mine, how: 'tagged' }; continue }
    if (shared.length) { out[id] = { keys: shared, how: 'shared' }; continue }
    const from = BORROW[id].find((p) => own(p).length)
    if (from) { out[id] = { keys: own(from), how: 'borrowed', from }; continue }
    out[id] = masters.length ? { keys: masters, how: 'master' } : { keys: [], how: 'none' }
  }
  return out
}

/** True when any file is named for a platform — the composer then splits by platform on its own. */
export const anyPlatformTagged = (items: { name: string }[]) => items.some((i) => platformsFromName(i.name).length > 0)
