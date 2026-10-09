// ─── Publishing adapters ─────────────────────────────────────────────────────
//
// SERVER ONLY. One function per platform that takes a queued post one step
// further and reports where it got to. Steps, not one long call, because
// Instagram, Threads and Facebook Reels process video asynchronously: we
// create the container, and a later run (every 5 minutes, or the composer's
// own polling) publishes it once the platform says it's ready.
//
// How each app finds its accounts — nothing per-app to configure beyond
// META_ACCESS_TOKEN, so a new app is one line in PUBLISH_APPS:
//   facebook  — the Page: <APP>_FB_PAGE_ID, else the known id below, else the
//               Page whose name matches the app. Page token from /me/accounts.
//   instagram — <APP>_IG_ACCOUNT_ID, else the Instagram linked to that Page.
//   threads   — connected once from /post ("Connect Threads", OAuth) and kept
//               in studio_social_tokens, refreshed by the 5-minute runner.
//               THREADS_TOKEN_<APP> still works as a manual override.
//   tiktok    — connected once from /post ("Connect TikTok", OAuth) like
//               Threads; see tiktok.ts. Until TikTok audits the app, posts
//               must be "Only me" (TIKTOK_AUDITED unset).

import type { MediaItem, Platform } from './rules'
import { captionFor } from './rules'
import type { Post, TargetState } from './store'
import { getToken } from './tokens'
import { creatorInfo, publishStatus, startUpload, tiktokConfigured, tiktokToken } from './tiktok'

const G = 'https://graph.facebook.com/v21.0'
const T = 'https://graph.threads.net/v1.0'

export const PUBLISH_APPS = [
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F', pageId: '1432102143309065' },
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A', pageId: '1384167881445516' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C', pageId: '1379556148567077' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4', pageId: '1365844183274727' },
  { id: 'jinglewire', name: 'Jinglewire', accent: '#1F6B3A', pageId: '' },
] as const

const envFor = (app: string, key: string) => process.env[`${app.toUpperCase()}_${key}`]
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
const post = (url: string, params: Record<string, string>, headers: Record<string, string> = {}) =>
  call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(params).toString() })

// ── Which Page / Instagram belongs to which app ──────────────────────────────

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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
async function pageFor(appId: string): Promise<PageRow | undefined> {
  const app = PUBLISH_APPS.find((a) => a.id === appId)
  if (!app) return undefined
  const rows = await pages()
  const wanted = envFor(appId, 'FB_PAGE_ID') || app.pageId
  const igEnv = envFor(appId, 'IG_ACCOUNT_ID')
  return (wanted && rows.find((p) => p.id === wanted))
    || (igEnv && rows.find((p) => p.instagram_business_account?.id === igEnv))
    || rows.find((p) => norm(p.name) === norm(app.name))
    || undefined
}

async function igFor(appId: string): Promise<string | undefined> {
  return envFor(appId, 'IG_ACCOUNT_ID') || (await pageFor(appId))?.instagram_business_account?.id
}

async function threadsToken(appId: string): Promise<string | undefined> {
  return envFor(appId, 'THREADS_TOKEN')?.trim() || process.env[`THREADS_TOKEN_${appId.toUpperCase()}`] || (await getToken('threads', appId))?.token
}

async function grantedPermissions(): Promise<Set<string>> {
  const token = metaToken()
  if (!token) return new Set()
  try {
    const body = await call(`${G}/me/permissions?access_token=${token}`)
    return new Set((body.data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission))
  } catch { return new Set() }
}

// ── Account readiness (drives the composer's destination cards) ──────────────

export type Account = { platform: Platform; ready: boolean; handle?: string; avatar?: string; reason?: string; connect?: 'threads' | 'tiktok' }

export async function accounts() {
  const perms = await grantedPermissions()
  const threadsConfigured = !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET)
  return Promise.all(PUBLISH_APPS.map(async (app) => {
    const out: Account[] = []
    const page = await pageFor(app.id)
    const ig = await igFor(app.id)

    // Instagram
    if (!metaToken()) out.push({ platform: 'instagram', ready: false, reason: 'META_ACCESS_TOKEN isn’t set on this deployment.' })
    else if (!ig) out.push({ platform: 'instagram', ready: false, reason: page ? `Link ${app.name}’s Instagram to the “${page.name}” Facebook Page (Meta Business Suite → Settings → Instagram).` : `No Facebook Page or Instagram found for ${app.name}. Create its Page, add it to the Clarendon business, and assign it to the Analytics API system user.` })
    else {
      try {
        const p = await call(`${G}/${ig}?fields=username,profile_picture_url&access_token=${metaToken()}`)
        // /me/permissions can come back empty for some system-user tokens;
        // "unknown" shouldn't block — the publish call itself will say so.
        out.push(perms.size === 0 || perms.has('instagram_content_publish')
          ? { platform: 'instagram', ready: true, handle: p.username, avatar: p.profile_picture_url }
          : { platform: 'instagram', ready: false, handle: p.username, avatar: p.profile_picture_url, reason: 'Token is missing instagram_content_publish.' })
      } catch (e) {
        out.push({ platform: 'instagram', ready: false, reason: /does not exist|permission/i.test(String(e)) ? 'Assign this Instagram account to the Analytics API system user in Business settings.' : String((e as Error).message) })
      }
    }

    // Facebook
    if (!page) out.push({ platform: 'facebook', ready: false, reason: `The token can’t see a ${app.name} Facebook Page. In Business settings → System users → Analytics API → Assign assets, add the Page with full control.` })
    else if (perms.size > 0 && !perms.has('pages_manage_posts')) out.push({ platform: 'facebook', ready: false, handle: page.name, reason: 'Needs pages_manage_posts — add the “Manage everything on your Page” use case to the Meta app, then regenerate the token.' })
    else if (!page.access_token) out.push({ platform: 'facebook', ready: false, handle: page.name, reason: 'The system user can see this Page but can’t post to it — give it full control of the Page.' })
    else out.push({ platform: 'facebook', ready: true, handle: page.name })

    // Threads
    const tt = await threadsToken(app.id)
    if (!tt) out.push(threadsConfigured
      ? { platform: 'threads', ready: false, connect: 'threads', reason: `Sign in to threads.net as ${app.name}’s account, then connect it here.` }
      : { platform: 'threads', ready: false, reason: 'Threads needs a one-time setup: add the Threads use case to the Meta app and save THREADS_APP_ID + THREADS_APP_SECRET.' })
    else {
      try {
        const me = await call(`${T}/me?fields=username,threads_profile_picture_url&access_token=${tt}`)
        out.push({ platform: 'threads', ready: true, handle: me.username, avatar: me.threads_profile_picture_url })
      } catch (e) {
        out.push({ platform: 'threads', ready: false, connect: threadsConfigured ? 'threads' : undefined, reason: `Threads sign-in expired (${(e as Error).message}). Reconnect it.` })
      }
    }

    // TikTok
    if (!tiktokConfigured()) out.push({ platform: 'tiktok', ready: false, reason: 'TikTok needs a one-time setup: save TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET from the developer app.' })
    else {
      let row
      try { row = await tiktokToken(app.id) } catch (e) {
        out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `TikTok sign-in expired (${(e as Error).message}). Reconnect it.` })
      }
      if (row) {
        try {
          const c = await creatorInfo(row.token)
          out.push({ platform: 'tiktok', ready: true, handle: c.creator_username, avatar: c.creator_avatar_url })
        } catch (e) {
          out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `TikTok sign-in expired (${(e as Error).message}). Reconnect it.` })
        }
      } else if (!out.some((a) => a.platform === 'tiktok')) {
        out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `Connect ${app.name}’s TikTok account — TikTok lets you pick the account when you sign in.` })
      }
    }
    return { id: app.id, name: app.name, accent: app.accent, icon: `/icons/${app.id}.png`, accounts: out }
  }))
}

// ── Adapters ─────────────────────────────────────────────────────────────────

type Step = Partial<TargetState>

async function instagram(p: Post, t: TargetState): Promise<Step> {
  const ig = await igFor(p.app_id), token = metaToken()
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

async function facebook(p: Post, t: TargetState): Promise<Step> {
  const page = await pageFor(p.app_id)
  if (!page?.access_token) return { status: 'failed', error: 'No Facebook Page (or Page token) for this app.' }
  const token = page.access_token
  const message = captionFor('facebook', p.caption, p.overrides)
  const images = p.media.filter((m) => m.kind === 'image')
  const video = p.media.find((m) => m.kind === 'video')

  // Reels: start an upload session, have Facebook fetch the file from our
  // storage, then publish — and poll until it's processed.
  if (t.format === 'reel' && video) {
    if (!t.containerId) {
      const start = await post(`${G}/${page.id}/video_reels`, { upload_phase: 'start', access_token: token })
      await call(`https://rupload.facebook.com/video-upload/v21.0/${start.video_id}`, {
        method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: video.url },
      })
      await post(`${G}/${page.id}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: message, access_token: token })
      return { containerId: start.video_id, status: 'processing' }
    }
    const st = await call(`${G}/${t.containerId}?fields=status,permalink_url&access_token=${token}`)
    const s = st.status ?? {}
    if (s.video_status === 'error' || s.processing_phase?.status === 'error') return { status: 'failed', error: s.processing_phase?.error?.message ?? 'Facebook couldn’t process the Reel.' }
    if (s.video_status === 'ready' || s.publishing_phase?.status === 'complete') {
      return { status: 'published', remoteId: t.containerId, permalink: st.permalink_url ? `https://www.facebook.com${st.permalink_url}` : `https://www.facebook.com/reel/${t.containerId}` }
    }
    return { status: 'processing' }
  }

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
  const token = await threadsToken(p.app_id)
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

async function tiktok(p: Post, t: TargetState): Promise<Step> {
  const row = await tiktokToken(p.app_id)
  if (!row) return { status: 'failed', error: 'TikTok isn’t connected for this app.' }
  const settings = t.tiktok ?? { mode: 'draft' as const }
  const video = p.media.find((m) => m.kind === 'video')
  if (!video) return { status: 'failed', error: 'TikTok here posts one video.' }

  if (!t.containerId) {
    // TikTok asks for creator info right before each post; it also catches a
    // privacy choice that's no longer allowed before any upload happens.
    const c = await creatorInfo(row.token)
    if (settings.mode === 'direct') {
      if (!settings.privacy || !c.privacy_level_options.includes(settings.privacy)) return { status: 'failed', error: 'That privacy choice isn’t available for this TikTok account — pick again.' }
      if (video.duration && c.max_video_post_duration_sec && video.duration > c.max_video_post_duration_sec) {
        return { status: 'failed', error: `This account can post videos up to ${c.max_video_post_duration_sec}s on TikTok.` }
      }
    }
    const publishId = await startUpload(row.token, video.url, video.mime, captionFor('tiktok', p.caption, p.overrides), settings)
    return { containerId: publishId, status: 'processing' }
  }

  const st = await publishStatus(row.token, t.containerId)
  if (st.status === 'FAILED') return { status: 'failed', error: `TikTok couldn’t post it (${st.fail_reason ?? 'unknown reason'}).` }
  const profile = row.username ? `https://www.tiktok.com/@${row.username}` : undefined
  if (st.status === 'SEND_TO_USER_INBOX') return { status: 'published', remoteId: t.containerId, permalink: profile }
  if (st.status === 'PUBLISH_COMPLETE') {
    const id = st.publicaly_available_post_id?.[0]
    return { status: 'published', remoteId: id ? String(id) : t.containerId, permalink: id && profile ? `${profile}/video/${id}` : profile }
  }
  return { status: 'processing' }
}

/** Move one target forward a step. Never throws — failures land on the target. */
export async function advance(p: Post, t: TargetState): Promise<Step> {
  try {
    switch (t.platform) {
      case 'instagram': return await instagram(p, t)
      case 'facebook': return await facebook(p, t)
      case 'threads': return await threads(p, t)
      case 'tiktok': return await tiktok(p, t)
      default: return { status: 'failed', error: 'Unknown platform.' }
    }
  } catch (e) {
    console.error(`[publish] ${p.id} ${t.platform}:`, (e as Error).message)
    return { status: 'failed', error: (e as Error).message }
  }
}
