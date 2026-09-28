// ─── Publish queue storage ───────────────────────────────────────────────────
//
// SERVER ONLY. The studio_posts table and studio-media bucket live in the
// Supabase project this site already uses (SUPABASE_URL / SERVICE_ROLE_KEY).
// Service-role only — RLS is on with no policies, so nothing else can read it.

import type { MediaItem, Platform, Target } from './rules'

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
  targets: TargetState[]
  status: 'scheduled' | 'publishing' | 'done' | 'partial' | 'failed' | 'canceled'
  scheduled_at: string | null
  created_at: string
  updated_at: string
  source: string
}

const env = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured on this deployment.')
  return { url, key }
}
const headers = (key: string, extra: Record<string, string> = {}) =>
  ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra })

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = env()
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: 'no-store', headers: { ...headers(key), ...(init.headers as Record<string, string> ?? {}) } })
  if (!res.ok) throw new Error(`Queue storage error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const listPosts = (limit = 60) =>
  rest<Post[]>(`studio_posts?status=neq.canceled&order=created_at.desc&limit=${limit}`)

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
