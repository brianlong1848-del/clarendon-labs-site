// ─── Publish queue storage ───────────────────────────────────────────────────
//
// SERVER ONLY. The studio_posts table and studio-media bucket live in the
// Supabase project this site already uses (SUPABASE_URL / SERVICE_ROLE_KEY).
// Service-role only — RLS is on with no policies, so nothing else can read it.

import type { MediaItem, MediaOverrides, Platform, Target } from './rules'
import type { RepeatRule } from './recur'

export type TargetState = Target & {
  status: 'pending' | 'processing' | 'published' | 'failed' | 'skipped'
  containerId?: string
  remoteId?: string
  permalink?: string
  error?: string
}

export type Post = {
  id: string
  app_id: string
  caption: string
  overrides: Partial<Record<Platform, string>>
  media: MediaItem[]
  /** A platform's own cut (rules.ts mediaFor); absent/{} = every platform gets `media`. */
  media_overrides?: MediaOverrides | null
  targets: TargetState[]
  status: 'scheduled' | 'publishing' | 'done' | 'partial' | 'failed' | 'canceled'
  scheduled_at: string | null
  created_at: string
  updated_at: string
  source: string
  series_id?: string | null
  occurrence?: number | null
  notes?: string
  caption_by?: 'brian' | 'ai'
  /** Market edition ('gb', 'cafr', …; see markets.ts) — null for a single-market post. */
  market?: string | null
  /** Shared by the editions of one multi-market post. */
  edition_group?: string | null
  logged_at?: string | null
  stats?: Partial<Record<Platform, PostStat>> | null
  stats_at?: string | null
}

/** One platform's result for a post, read ~48h after it went out. */
export type PostStat = { reach: number; engagement: number; at: string }

/** A repeating post: what to post, where, and the rule for when. The runner
 *  turns it into ordinary Post rows, one upcoming copy at a time. */
export type Series = {
  id: string
  app_id: string
  caption: string
  overrides: Partial<Record<Platform, string>>
  media: MediaItem[]
  media_overrides?: MediaOverrides | null
  targets: Target[]
  frames: string[]
  notes: string
  caption_mode: 'fresh' | 'same'
  rule: RepeatRule
  starts_at: string | null
  ends_at: string | null
  max_runs: number | null
  runs: number
  status: 'active' | 'paused' | 'ended'
  next_at: string | null
  last_error: string | null
  source: string
  created_at: string
  updated_at: string
}

const env = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured on this deployment.')
  return { url, key }
}
const headers = (key: string, extra: Record<string, string> = {}) =>
  ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra })

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = env()
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: 'no-store', headers: { ...headers(key), ...(init.headers as Record<string, string> ?? {}) } })
  if (!res.ok) throw new Error(`Queue storage error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const listPosts = (limit = 60) =>
  rest<Post[]>(`studio_posts?status=neq.canceled&order=created_at.desc&limit=${limit}`)

/** Failed or partly-failed posts (the ones "Clear failed" tidies), optionally for one app. */
export const failedPosts = (appId?: string) =>
  rest<Post[]>(`studio_posts?status=in.(failed,partial)${appId ? `&app_id=eq.${encodeURIComponent(appId)}` : ''}&order=created_at.desc&limit=200`)

export const getPost = async (id: string) =>
  (await rest<Post[]>(`studio_posts?id=eq.${encodeURIComponent(id)}`))[0] ?? null

export const insertPost = async (row: Partial<Post>) =>
  (await rest<Post[]>('studio_posts', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]

export const updatePost = async (id: string, patch: Partial<Post>) =>
  (await rest<Post[]>(`studio_posts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  }))[0]

/** Due now: scheduled posts whose time has come, plus anything mid-publish
 *  (e.g. an Instagram video still processing on Meta's side). */
export const duePosts = () => {
  const now = new Date().toISOString()
  return rest<Post[]>(`studio_posts?or=(and(status.eq.scheduled,scheduled_at.lte."${now}"),status.eq.publishing)&order=scheduled_at.asc.nullsfirst&limit=5`)
}

/** Claim a scheduled post so two runners can't publish it twice. */
export const claim = async (id: string) =>
  (await rest<Post[]>(`studio_posts?id=eq.${encodeURIComponent(id)}&status=eq.scheduled`, {
    method: 'PATCH', body: JSON.stringify({ status: 'publishing', updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  })).length > 0

// ── Repeating series ─────────────────────────────────────────────────────────

export const listSeries = () =>
  rest<Series[]>('studio_post_series?status=neq.ended&order=created_at.desc&limit=50')

export const getSeries = async (id: string) =>
  (await rest<Series[]>(`studio_post_series?id=eq.${encodeURIComponent(id)}`))[0] ?? null

export const insertSeries = async (row: Partial<Series>) =>
  (await rest<Series[]>('studio_post_series', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]

export const updateSeries = async (id: string, patch: Partial<Series>, onlyIfRuns?: number) =>
  (await rest<Series[]>(`studio_post_series?id=eq.${encodeURIComponent(id)}${onlyIfRuns != null ? `&runs=eq.${onlyIfRuns}` : ''}`, {
    method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  }))[0] ?? null

/** Active series whose next copy is due within `leadMs` (so the queue shows it
 *  with its caption ahead of time). */
export const seriesDue = (leadMs: number) =>
  rest<Series[]>(`studio_post_series?status=eq.active&next_at=lte."${new Date(Date.now() + leadMs).toISOString()}"&order=next_at.asc&limit=5`)

/** The copy of a series that is still waiting or going out, if any. */
export const openCopy = async (seriesId: string) =>
  (await rest<Post[]>(`studio_posts?series_id=eq.${encodeURIComponent(seriesId)}&status=in.(scheduled,publishing)&limit=1`))[0] ?? null

/** Captions already used by a series, newest first — the AI avoids repeating them. */
export const pastCaptions = async (seriesId: string, limit = 6) =>
  (await rest<Pick<Post, 'caption' | 'overrides'>[]>(`studio_posts?series_id=eq.${encodeURIComponent(seriesId)}&select=caption,overrides&order=created_at.desc&limit=${limit}`))

export const cancelOpenCopies = (seriesId: string) =>
  rest<Post[]>(`studio_posts?series_id=eq.${encodeURIComponent(seriesId)}&status=eq.scheduled`, {
    method: 'PATCH', body: JSON.stringify({ status: 'canceled', updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  })

/** Finished posts not yet written to the app's post log in Drive. */
export const unloggedPosts = () => {
  const since = new Date(Date.now() - 3 * 864e5).toISOString()
  return rest<Post[]>(`studio_posts?status=in.(done,partial)&logged_at=is.null&updated_at=gte."${since}"&order=updated_at.asc&limit=4`)
}

/** Published 2–14 days ago and not measured yet. */
export const postsNeedingStats = () => {
  const now = Date.now()
  return rest<Post[]>(`studio_posts?status=in.(done,partial)&stats_at=is.null&scheduled_at=lte."${new Date(now - 48 * 3600_000).toISOString()}"&scheduled_at=gte."${new Date(now - 14 * 864e5).toISOString()}"&order=scheduled_at.asc&limit=4`)
}

/** Measured posts for one app (the "Best time" learning set). */
export const measuredPosts = (appId: string) =>
  rest<Pick<Post, 'scheduled_at' | 'created_at' | 'stats'>[]>(`studio_posts?app_id=eq.${encodeURIComponent(appId)}&stats=not.is.null&select=scheduled_at,created_at,stats&order=scheduled_at.desc&limit=300`)

/** A one-time URL the browser / iPhone uploads the file to directly, so big
 *  videos never pass through a Vercel function. */
export async function signedUpload(appId: string, filename: string) {
  const { url, key } = env()
  const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'file'
  const path = `${appId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`
  const res = await fetch(`${url}/storage/v1/object/upload/sign/studio-media/${path}`, {
    method: 'POST', headers: headers(key), body: '{}', cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Could not start upload (${res.status}).`)
  const { url: signed } = await res.json()
  return {
    path,
    uploadUrl: `${url}/storage/v1${signed}`,
    publicUrl: `${url}/storage/v1/object/public/studio-media/${path}`,
  }
}
