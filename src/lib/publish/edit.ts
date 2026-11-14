// ─── Editing a scheduled post ────────────────────────────────────────────────
//
// Shared types for PATCH /api/publish?id=&action=edit and POST
// /api/publish/bulk (the Studio iOS app mirrors these in its models). Only a
// post that is still status='scheduled' can change; the server re-runs the
// same validate() the composer uses on the merged result.

import { PLATFORMS, validate, type MediaItem, type MediaOverrides, type Platform, type Target } from './rules'
import type { Post, TargetState } from './store'

/** PATCH /api/publish?id=<id>&action=edit — every field optional; send only what changes. */
export type EditPostRequest = {
  caption?: string
  /** Per-platform captions; '' or a missing key = use `caption`. */
  overrides?: Partial<Record<Platform, string>>
  /** ISO 8601 instant, at least 60 s from now. */
  scheduledAt?: string
  /** The shared media, already uploaded (https URLs from /api/publish/upload). */
  media?: MediaItem[]
  /** A platform's own cut; null clears every cut. */
  mediaOverrides?: MediaOverrides | null
  /** Where it goes. A platform kept from before keeps its TikTok settings unless new ones are sent. */
  targets?: Target[]
}
/** Response: { post } (the updated row) or { error } (400 bad input, 404, 409 no longer scheduled). */
export type EditPostResponse = { post: Post } | { error: string }

/** POST /api/publish/bulk */
export type BulkRequest =
  | { ids: string[]; action: 'cancel' }
  | { ids: string[]; action: 'shift'; /** Minutes to move each post by (negative = earlier). */ minutes: number }
export type BulkResponse = {
  /** Posts that changed, as they are now. */
  updated: Post[]
  /** Posts left alone, and why (not scheduled any more, would land in the past…). */
  skipped: { id: string; reason: string }[]
}

const https = (m: unknown): m is MediaItem => !!m && typeof m === 'object' && typeof (m as MediaItem).url === 'string' && /^https:\/\//.test((m as MediaItem).url)
  && ((m as MediaItem).kind === 'image' || (m as MediaItem).kind === 'video')

export const MIN_LEAD_MS = 60_000

/** Checks an edit against the post as it stands; returns the columns to write. */
export function parseEdit(body: unknown, post: Post): { patch: Partial<Post> } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Expected JSON.' }
  const b = body as Record<string, unknown>
  const patch: Partial<Post> = {}

  if ('caption' in b) {
    if (typeof b.caption !== 'string') return { error: 'caption must be text.' }
    patch.caption = b.caption
  }
  if ('overrides' in b) {
    const o = b.overrides
    if (o == null) patch.overrides = {}
    else if (typeof o !== 'object' || Array.isArray(o)) return { error: 'overrides must be an object.' }
    else {
      const out: Partial<Record<Platform, string>> = {}
      for (const p of PLATFORMS) { const v = (o as Record<string, unknown>)[p.id]; if (typeof v === 'string' && v !== '') out[p.id] = v }
      patch.overrides = out
    }
  }
  if ('scheduledAt' in b) {
    const d = typeof b.scheduledAt === 'string' ? new Date(b.scheduledAt) : null
    if (!d || isNaN(d.getTime())) return { error: 'Bad schedule time.' }
    if (d.getTime() < Date.now() + MIN_LEAD_MS) return { error: 'Pick a time at least a minute from now.' }
    patch.scheduled_at = d.toISOString()
  }
  if ('media' in b) {
    if (!Array.isArray(b.media) || !b.media.every(https)) return { error: 'Media must be uploaded first.' }
    patch.media = b.media.map((m) => ({ url: m.url, kind: m.kind, width: Number(m.width) || 0, height: Number(m.height) || 0, ...(m.duration ? { duration: Number(m.duration) } : {}), ...(m.mime ? { mime: String(m.mime) } : {}) }))
  }
  if ('mediaOverrides' in b) {
    const mo = b.mediaOverrides
    if (mo == null) patch.media_overrides = null
    else if (typeof mo !== 'object' || Array.isArray(mo)) return { error: 'mediaOverrides must be an object.' }
    else {
      const out: MediaOverrides = {}
      for (const p of PLATFORMS) {
        const v = (mo as Record<string, unknown>)[p.id]
        if (v === undefined) continue
        if (!Array.isArray(v) || !v.every(https)) return { error: 'Media must be uploaded first.' }
        out[p.id] = v as MediaItem[]
      }
      patch.media_overrides = Object.keys(out).length ? out : null
    }
  }
  if ('targets' in b) {
    if (!Array.isArray(b.targets) || !b.targets.length) return { error: 'Pick at least one place to post.' }
    const list = b.targets as Target[]
    if (list.some((t) => !t || !PLATFORMS.some((p) => p.id === t.platform && p.formats.includes(t.format)))) return { error: 'Unknown platform or format.' }
    if (new Set(list.map((t) => t.platform)).size !== list.length) return { error: 'Each platform once.' }
    patch.targets = list.map((t) => {
      const before = post.targets.find((x) => x.platform === t.platform)
      const tiktok = t.tiktok ?? before?.tiktok
      return { platform: t.platform, format: t.format, ...(tiktok ? { tiktok } : {}), status: 'pending' } as TargetState
    })
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to change.' }

  const m = { ...post, ...patch }
  const errors = validate(m.targets, m.media, m.caption, m.overrides ?? {}, m.media_overrides ?? {}).filter((i) => i.level === 'error')
  if (errors.length) return { error: errors.map((e) => e.text).join(' ') }
  return { patch }
}
