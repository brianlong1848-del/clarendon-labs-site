// ─── Publishing adapters ─────────────────────────────────────────────────────
//
// SERVER ONLY. One function per platform that takes a queued post one step
// further and reports where it got to. Steps, not one long call, because
// Instagram and Threads process video asynchronously: we create the
// container, and a later run (every 5 minutes, or the composer's own polling)
// publishes it once Meta says FINISHED.
//
// Credentials, all server-side:
//   instagram — META_ACCESS_TOKEN (system user) + <APP>_IG_ACCOUNT_ID
//   facebook  — the same token; each Page's own token comes from /me/accounts.
//               Posting needs pages_manage_posts on the token.
//   threads   — THREADS_TOKEN_<APP> (Threads is a separate login from Meta
//               Business; one long-lived token per app account)
//   tiktok    — not wired: public posting needs TikTok's app audit first.

import type { MediaItem, Platform } from './rules'
import { captionFor } from './rules'
import type { Post, TargetState } from './store'

const G = 'https://graph.facebook.com/v21.0'
const T = 'https://graph.threads.net/v1.0'

export const PUBLISH_APPS = [
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F' },
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4' },
] as const

const igId = (app: string) => process.env[`${app.toUpperCase()}_IG_ACCOUNT_ID`]
const threadsToken = (app: string) => process.env[`THREADS_TOKEN_${app.toUpperCase()}`]
const metaToken = () => process.env.META_ACCESS_TOKEN

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000), ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) {
    const e = body?.error
    throw new Error(e?.error_user_msg || e?.message || `HTTP ${res.status}`)
  }
  return body
}
const post = (url: string, params: Record<string, string>) =>
  call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() })

// ── Account readiness (drives the composer's destination cards) ──────────────

type PageRow = { id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }
let pagesCache: { at: number; rows: PageRow[] } | null = null
async function pages(): Promise<PageRow[]> {
  const token = metaToken()
  if (!token) return []
  if (pagesCache && Date.now() - pagesCache.at < 60_000) return pagesCache.rows
  try {
    const body = await call(`${G}/me/accounts?fields=id,name,access_token,instagram_business_account{id}&limit=100&access_token=${token}`)
    pagesCache = { at: Date.now(), rows: body.data ?? [] }
  } catch { pagesCache = { at: Date.now(), rows: [] } }
  return pagesCache.rows
}
const pageFor = async (app: string) => (await pages()).find((p) => p.instagram_business_account?.id === igId(app))

async function grantedPermissions(): Promise<Set<string>> {
  const token = metaToken()
  if (!token) return new Set()
  try {
    const body = await call(`${G}/me/permissions?access_token=${token}`)
    return new Set((body.data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission))
  } catch { return new Set() }
}

export type Account = { platform: Platform; ready: boolean; handle?: string; avatar?: string; reason?: string }

export async function accounts() {
  const perms = await grantedPermissions()
  return Promise.all(PUBLISH_APPS.map(async (app) => {
    const out: Account[] = []
    const ig = igId(app.id)
    // Instagram
    if (!metaToken() || !ig) out.push({ platform: 'instagram', ready: false, reason: 'No Instagram account set for this app.' })
    else {
      try {
        const p = await call(`${G}/${ig}?fields=username,profile_picture_url&access_token=${metaToken()}`)
        // /me/permissions can come back empty for some system-user tokens;
        // "unknown" shouldn't block — the publish call itself will say so.
        out.push(perms.size === 0 || perms.has('instagram_content_publish')
          ? { platform: 'instagram', ready: true, handle: p.username, avatar: p.profile_picture_url }
          : { platform: 'instagram', ready: false, handle: p.username, avatar: p.profile_picture_url, reason: 'Token is missing instagram_content_publish.' })
      } catch (e) {
        out.push({ platform: 'instagram', ready: false, reason: /does not exist|permission/i.test(String(e)) ? 'Link this Instagram account to its Facebook Page first.' : String((e as Error).message) })
      }
    }
    // Facebook
    const page = await pageFor(app.id)
    if (!page) out.push({ platform: 'facebook', ready: false, reason: 'No Facebook Page linked to this app’s Instagram yet.' })
    else out.push(perms.has('pages_manage_posts')
      ? { platform: 'facebook', ready: true, handle: page.name }
      : { platform: 'facebook', ready: false, handle: page.name, reason: 'Needs pages_manage_posts — add the “Manage everything on your Page” use case to the Meta app, then regenerate the token.' })
    // Threads
    const tt = threadsToken(app.id)
    if (!tt) out.push({ platform: 'threads', ready: false, reason: `Connect Threads: sign in as this app’s Threads account and save its token as THREADS_TOKEN_${app.id.toUpperCase()}.` })
    else {
      try {
        const me = await call(`${T}/me?fields=username,threads_profile_picture_url&access_token=${tt}`)
        out.push({ platform: 'threads', ready: true, handle: me.username, avatar: me.threads_profile_picture_url })
      } catch (e) { out.push({ platform: 'threads', ready: false, reason: `Threads token rejected: ${(e as Error).message}` }) }
    }
    // TikTok
    out.push({ platform: 'tiktok', ready: false, reason: 'Public posting unlocks after TikTok approves the app (Content Posting audit). Until then posts could only be private.' })
    return { id: app.id, name: app.name, accent: app.accent, icon: `/icons/${app.id}.png`, accounts: out }
  }))
}

// ── Adapters ─────────────────────────────────────────────────────────────────

type Step = Partial<TargetState>

async function instagram(p: Post, t: TargetState): Promise<Step> {
  const ig = igId(p.app_id), token = metaToken()
  if (!ig || !token) return { status: 'failed', error: 'Instagram is not configured for this app.' }
  const caption = t.format === 'story' ? '' : captionFor('instagram', p.caption, p.overrides)

  if (!t.containerId) {
    const item = (m: MediaItem, extra: Record<string, string> = {}) =>
      post(`${G}/${ig}/media`, {
        ...(m.kind === 'image' ? { image_url: m.url } : { video_url: m.url, media_type: extra.media_type ?? 'REELS' }),
        ...extra, access_token: token,
      })
    let container: string
    if (t.format === 'story') {
      const m = p.media[0]
      container = (await post(`${G}/${ig}/media`, { media_type: 'STORIES', ...(m.kind === 'image' ? { image_url: m.url } : { video_url: m.url }), access_token: token })).id
    } else if (p.media.length > 1) {
      const children: string[] = []
      for (const m of p.media) children.push((await item(m, { is_carousel_item: 'true', ...(m.kind === 'video' ? { media_type: 'VIDEO' } : {}) })).id)
      container = (await post(`${G}/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token })).id
    } else if (p.media[0].kind === 'video') {
      container = (await item(p.media[0], { caption, media_type: 'REELS', share_to_feed: 'true' })).id
    } else {
      container = (await item(p.media[0], { caption })).id
    }
    return { containerId: container, status: 'processing' }
  }

  const st = await call(`${G}/${t.containerId}?fields=status_code,status&access_token=${token}`)
  if (st.status_code === 'IN_PROGRESS') return { status: 'processing' }
  if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') return { status: 'failed', error: `Instagram couldn’t process the media (${st.status ?? st.status_code}).` }
  const published = await post(`${G}/${ig}/media_publish`, { creation_id: t.containerId, access_token: token })
  let permalink: string | undefined
  try { permalink = (await call(`${G}/${published.id}?fields=permalink&access_token=${token}`)).permalink } catch { /* optional */ }
  return { status: 'published', remoteId: published.id, permalink }
}

async function facebook(p: Post): Promise<Step> {
  const page = await pageFor(p.app_id)
  if (!page?.access_token) return { status: 'failed', error: 'No Facebook Page (or Page token) for this app.' }
  const token = page.access_token
  const message = captionFor('facebook', p.caption, p.overrides)
  const images = p.media.filter((m) => m.kind === 'image')
  const video = p.media.find((m) => m.kind === 'video')
  let id: string
  if (video) {
    id = (await post(`${G}/${page.id}/videos`, { file_url: video.url, description: message, access_token: token })).id
  } else if (images.length === 1) {
    id = (await post(`${G}/${page.id}/photos`, { url: images[0].url, message, access_token: token })).post_id
  } else if (images.length > 1) {
    const ids: string[] = []
    for (const m of images) ids.push((await post(`${G}/${page.id}/photos`, { url: m.url, published: 'false', access_token: token })).id)
    const params: Record<string, string> = { message, access_token: token }
    ids.forEach((mid, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: mid }) })
    id = (await post(`${G}/${page.id}/feed`, params)).id
  } else {
    id = (await post(`${G}/${page.id}/feed`, { message, access_token: token })).id
  }
  return { status: 'published', remoteId: id, permalink: `https://www.facebook.com/${id}` }
}

async function threads(p: Post, t: TargetState): Promise<Step> {
  const token = threadsToken(p.app_id)
  if (!token) return { status: 'failed', error: 'Threads isn’t connected for this app.' }
  const text = captionFor('threads', p.caption, p.overrides)
  if (!t.containerId) {
    const one = (m: MediaItem, extra: Record<string, string>) => post(`${T}/me/threads`, {
      media_type: m.kind === 'image' ? 'IMAGE' : 'VIDEO', ...(m.kind === 'image' ? { image_url: m.url } : { video_url: m.url }), ...extra, access_token: token,
    })
    let container: string
    if (p.media.length === 0) container = (await post(`${T}/me/threads`, { media_type: 'TEXT', text, access_token: token })).id
    else if (p.media.length === 1) container = (await one(p.media[0], { text })).id
    else {
      const kids: string[] = []
      for (const m of p.media) kids.push((await one(m, { is_carousel_item: 'true' })).id)
      container = (await post(`${T}/me/threads`, { media_type: 'CAROUSEL', children: kids.join(','), text, access_token: token })).id
    }
    return { containerId: container, status: 'processing' }
  }
  const st = await call(`${T}/${t.containerId}?fields=status,error_message&access_token=${token}`)
  if (st.status === 'IN_PROGRESS') return { status: 'processing' }
  if (st.status === 'ERROR' || st.status === 'EXPIRED') return { status: 'failed', error: st.error_message ?? 'Threads couldn’t process the media.' }
  const published = await post(`${T}/me/threads_publish`, { creation_id: t.containerId, access_token: token })
  let permalink: string | undefined
  try { permalink = (await call(`${T}/${published.id}?fields=permalink&access_token=${token}`)).permalink } catch { /* optional */ }
  return { status: 'published', remoteId: published.id, permalink }
}

/** Move one target forward a step. Never throws — failures land on the target. */
export async function advance(p: Post, t: TargetState): Promise<Step> {
  try {
    switch (t.platform) {
      case 'instagram': return await instagram(p, t)
      case 'facebook': return await facebook(p)
      case 'threads': return await threads(p, t)
      default: return { status: 'failed', error: 'TikTok posting isn’t available until TikTok approves the app.' }
    }
  } catch (e) {
    console.error(`[publish] ${p.id} ${t.platform}:`, (e as Error).message)
    return { status: 'failed', error: (e as Error).message }
  }
}
