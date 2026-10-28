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
import { captionFor, mediaFor } from './rules'
import type { Post, TargetState } from './store'
import { clearTokenCache, connectedElsewhere, getToken } from './tokens'
import { handleFits, wrongAccount } from './ownership'
import { creatorInfo, publishStatus, startUpload, tiktokConfigured, tiktokToken, type CreatorInfo, type PublishStatus } from './tiktok'
import { bizConfigured, bizCreatorInfo, bizPublish, bizStatus, bizToken, ensureMediaVerified } from './tiktokBiz'
import type { StoredToken } from './tokens'

const G = 'https://graph.facebook.com/v21.0'
const T = 'https://graph.threads.net/v1.0'

export const PUBLISH_APPS = [
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F', pageId: '1432102143309065' },
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A', pageId: '1384167881445516' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C', pageId: '1379556148567077' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4', pageId: '1365844183274727' },
  { id: 'jinglewire', name: 'Jinglewire', accent: '#1F6B3A', pageId: '1302483119622294' },
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
export async function pageFor(appId: string): Promise<PageRow | undefined> {
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

export async function igFor(appId: string): Promise<string | undefined> {
  return envFor(appId, 'IG_ACCOUNT_ID') || (await pageFor(appId))?.instagram_business_account?.id
}

async function threadsToken(appId: string): Promise<string | undefined> {
  return envFor(appId, 'THREADS_TOKEN')?.trim() || process.env[`THREADS_TOKEN_${appId.toUpperCase()}`] || (await getToken('threads', appId))?.token
}

export async function grantedPermissions(): Promise<Set<string>> {
  const token = metaToken()
  if (!token) return new Set()
  try {
    const body = await call(`${G}/me/permissions?access_token=${token}`)
    return new Set((body.data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission))
  } catch { return new Set() }
}

// ── Account readiness (drives the composer's destination cards) ──────────────

export type Account = { platform: Platform; ready: boolean; handle?: string; avatar?: string; reason?: string; connect?: 'threads' | 'tiktok' }

// The account check talks to Meta, Threads and TikTok for every app, so it's
// cached for a few minutes on a warm server ("Check again" and a fresh
// sign-in bypass it), every platform is checked at the same time, and a
// platform that doesn't answer within 8s is reported rather than holding up
// the page.
let accountsCache: { at: number; data: Awaited<ReturnType<typeof checkAccounts>> } | null = null
// "Check again" also re-runs the TikTok media check (the studio-media URL
// prefix TikTok pulls videos from); a problem there shows on every TikTok card.
let mediaProblem: string | null = null
export async function accounts(fresh = false) {
  if (!fresh && accountsCache && Date.now() - accountsCache.at < 180_000) return accountsCache.data
  if (fresh) clearTokenCache()
  if (fresh && bizConfigured()) {
    try {
      const m = await ensureMediaVerified()
      mediaProblem = m.status === 'verified' ? null : `TikTok hasn’t verified the video storage link yet (${m.status}${m.detail ? `: ${m.detail}` : ''}). Check again in a minute.`
    } catch (e) { mediaProblem = `TikTok media check failed: ${(e as Error).message}` }
  }
  const data = await checkAccounts()
  accountsCache = { at: Date.now(), data }
  return data
}

const PNAME: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', tiktok: 'TikTok' }
async function within(list: Account[], platform: Account['platform'], fn: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), 8000) })
  const r = await Promise.race([fn().then(() => 'ok' as const), late])
  clearTimeout(timer)
  if (r === 'late' && !list.length) list.push({ platform, ready: false, reason: `${PNAME[platform]} didn’t answer in time — press Check again on the Accounts tab.` })
}

async function checkAccounts() {
  const [perms] = await Promise.all([grantedPermissions(), pages()])
  const threadsConfigured = !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET)
  return Promise.all(PUBLISH_APPS.map(async (app) => {
    const out: Account[] = []
    const page = await pageFor(app.id)
    const ig = await igFor(app.id)
    const igA: Account[] = [], fbA: Account[] = [], thA: Account[] = [], tkA: Account[] = []
    await Promise.all([within(igA, 'instagram', async () => { const out = igA
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

    }), within(fbA, 'facebook', async () => { const out = fbA
    // Facebook
    if (!page) out.push({ platform: 'facebook', ready: false, reason: `The token can’t see a ${app.name} Facebook Page. In Business settings → System users → Analytics API → Assign assets, add the Page with full control.` })
    else if (perms.size > 0 && !perms.has('pages_manage_posts')) out.push({ platform: 'facebook', ready: false, handle: page.name, reason: 'Needs pages_manage_posts — add the “Manage everything on your Page” use case to the Meta app, then regenerate the token.' })
    else if (!page.access_token) out.push({ platform: 'facebook', ready: false, handle: page.name, reason: 'The system user can see this Page but can’t post to it — give it full control of the Page.' })
    else out.push({ platform: 'facebook', ready: true, handle: page.name })

    }), within(thA, 'threads', async () => { const out = thA
    // Threads
    const tt = await threadsToken(app.id)
    if (!tt) out.push(threadsConfigured
      ? { platform: 'threads', ready: false, connect: 'threads', reason: `Sign in to threads.net as ${app.name}’s account, then connect it here.` }
      : { platform: 'threads', ready: false, reason: 'Threads needs a one-time setup: add the Threads use case to the Meta app and save THREADS_APP_ID + THREADS_APP_SECRET.' })
    else {
      try {
        const me = await call(`${T}/me?fields=id,username,threads_profile_picture_url&access_token=${tt}`)
        // Same Threads account as another app (connected while threads.net was
        // signed in as that app): not ready, so nothing posts as the wrong brand.
        // When two apps share one account, the app whose name is in the handle
        // keeps it (@gagordergame belongs to Gag Order, not Rolligan).
        const owns = (id: string, name: string, handle: string) => [id, name].some((x) => handle.toLowerCase().includes(x.toLowerCase().replace(/[^a-z0-9]/g, '')))
        const shared = await connectedElsewhere('threads', me.id ?? null, app.id)
        const other = shared && !owns(app.id, app.name, String(me.username ?? '')) ? shared : undefined
        const otherName = other && PUBLISH_APPS.find((a) => a.id === other.app_id)?.name
        out.push(!handleFits(app.id, me.username)
          ? { platform: 'threads', ready: false, connect: 'threads', handle: me.username, reason: wrongAccount(app.id, me.username, 'Threads') }
          : other
          ? { platform: 'threads', ready: false, connect: 'threads', handle: me.username, reason: `Connected to @${me.username}, which is ${otherName}’s account. On threads.net switch to ${app.name}’s account, then press Connect.` }
          : { platform: 'threads', ready: true, handle: me.username, avatar: me.threads_profile_picture_url })
      } catch (e) {
        out.push({ platform: 'threads', ready: false, connect: threadsConfigured ? 'threads' : undefined, reason: `Threads sign-in expired (${(e as Error).message}). Reconnect it.` })
      }
    }

    }), within(tkA, 'tiktok', async () => { const out = tkA
    // TikTok
    const biz = bizConfigured()
    if (!biz && !tiktokConfigured()) out.push({ platform: 'tiktok', ready: false, reason: 'TikTok needs a one-time setup: save TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET from the developer app.' })
    else {
      let row
      try { row = biz ? await bizToken(app.id) : await tiktokToken(app.id) } catch (e) {
        out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `TikTok sign-in expired (${(e as Error).message}). Reconnect it.` })
      }
      if (row) {
        try {
          const c = biz ? await bizCreatorInfo(row) : await creatorInfo(row.token)
          out.push(!handleFits(app.id, c.creator_username)
            ? { platform: 'tiktok', ready: false, connect: 'tiktok', handle: c.creator_username, reason: wrongAccount(app.id, c.creator_username, 'TikTok') }
            : biz && mediaProblem
            ? { platform: 'tiktok', ready: false, handle: c.creator_username, avatar: c.creator_avatar_url, reason: mediaProblem }
            : { platform: 'tiktok', ready: true, handle: c.creator_username, avatar: c.creator_avatar_url })
        } catch (e) {
          out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `TikTok sign-in expired (${(e as Error).message}). Reconnect it.` })
        }
      } else if (!out.some((a) => a.platform === 'tiktok')) {
        out.push({ platform: 'tiktok', ready: false, connect: 'tiktok', reason: `Connect ${app.name}’s TikTok account — TikTok lets you pick the account when you sign in.` })
      }
    }
    })])
    out.push(...igA, ...fbA, ...thA, ...tkA)
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
  const stored = await getToken('threads', p.app_id)
  if (stored && !handleFits(p.app_id, stored.username)) return { status: 'failed', error: wrongAccount(p.app_id, stored.username!, 'Threads') }
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
  // A post started on one TikTok route finishes on it: Business API publish
  // ids start with "v_pub" / "p_pub"; anything else is the old Login Kit app.
  const biz = bizConfigured() && (!t.containerId || /^[vp]_pub/.test(t.containerId))
  const row = biz ? await bizToken(p.app_id) : await tiktokToken(p.app_id)
  const info = (r: StoredToken): Promise<CreatorInfo> => biz ? bizCreatorInfo(r) : creatorInfo(r.token)
  const status = (r: StoredToken, id: string): Promise<PublishStatus> => biz ? bizStatus(r, id) : publishStatus(r.token, id)
  if (!row) return { status: 'failed', error: 'TikTok isn’t connected for this app.' }
  // Never post an app's video to someone else's account (e.g. Brian's personal TikTok).
  if (!handleFits(p.app_id, row.username)) return { status: 'failed', error: wrongAccount(p.app_id, row.username!, 'TikTok') }
  let settings = t.tiktok ?? { mode: 'draft' as const }
  const video = p.media.find((m) => m.kind === 'video')
  if (!video) return { status: 'failed', error: 'TikTok here posts one video.' }

  if (!t.containerId) {
    // TikTok asks for creator info right before each post; it also catches a
    // privacy choice that's no longer allowed before any upload happens.
    const c = await info(row)
    if (settings.mode === 'direct') {
      if (!settings.privacy || !c.privacy_level_options.includes(settings.privacy)) {
        // The Business API posts to an account we own, publicly. A saved
        // choice it no longer offers (SELF_ONLY from the private-only era,
        // 2026-10-17/18) becomes Public instead of a dead post.
        if (!biz) return { status: 'failed', error: 'That privacy choice isn’t available for this TikTok account — pick again.' }
        settings = { ...settings, privacy: c.privacy_level_options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : c.privacy_level_options[0] }
      }
      if (video.duration && c.max_video_post_duration_sec && video.duration > c.max_video_post_duration_sec) {
        return { status: 'failed', error: `This account can post videos up to ${c.max_video_post_duration_sec}s on TikTok.` }
      }
    }
    const caption = captionFor('tiktok', p.caption, p.overrides)
    const publishId = biz
      ? await bizPublish(row, video.url, caption, settings)
      : await startUpload(row.token, video.url, video.mime, caption, settings)
    // Keep what actually went out (e.g. the privacy fallback) on the target.
    return { containerId: publishId, status: 'processing', tiktok: settings }
  }

  const st = await status(row, t.containerId)
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
export async function advance(post: Post, t: TargetState): Promise<Step> {
  // Each platform gets its own cut when the post has one (mediaFor).
  const p: Post = { ...post, media: mediaFor(t.platform, post.media, post.media_overrides) }
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

// ── Results (for "Best time") ────────────────────────────────────────────────
//
// Reach + engagement per published target, read once ~48h after posting by
// the runner. Instagram and Facebook come from the Meta token we already have.
// Threads (needs threads_manage_insights) and TikTok (needs video.list) would
// need new scopes and a reconnect, so they learn from the app's Meta results
// until then.

export async function postStats(p: Post, t: TargetState): Promise<{ reach: number; engagement: number } | null> {
  if (t.status !== 'published' || !t.remoteId) return null
  try {
    if (t.platform === 'instagram' && t.format !== 'story') {
      const token = metaToken()
      if (!token) return null
      const body = await call(`${G}/${t.remoteId}/insights?metric=reach,total_interactions&access_token=${token}`)
      const v = (name: string) => Number(body.data?.find((d: { name: string }) => d.name === name)?.values?.[0]?.value ?? 0)
      return { reach: v('reach'), engagement: v('total_interactions') }
    }
    if (t.platform === 'facebook') {
      const page = await pageFor(p.app_id)
      if (!page?.access_token) return null
      const token = page.access_token
      const count = (b: { summary?: { total_count?: number } } | undefined) => Number(b?.summary?.total_count ?? 0)
      try {
        const b = await call(`${G}/${t.remoteId}?fields=reactions.limit(0).summary(true),comments.limit(0).summary(true),shares&access_token=${token}`)
        return { reach: 0, engagement: count(b.reactions) + count(b.comments) + Number(b.shares?.count ?? 0) }
      } catch {
        // Videos / Reels are video objects, not posts.
        const b = await call(`${G}/${t.remoteId}?fields=likes.limit(0).summary(true),comments.limit(0).summary(true)&access_token=${token}`)
        return { reach: 0, engagement: count(b.likes) + count(b.comments) }
      }
    }
  } catch { return null }
  return null
}

/** Instagram "followers online" by weekday/hour (last 30 days), when Meta has it
 *  (accounts with 100+ followers). Keys are Meta's hours, which it reports in
 *  Pacific time. Returns null when unavailable. */
export async function igOnlineFollowers(appId: string): Promise<{ date: string; hours: Record<string, number> }[] | null> {
  const ig = await igFor(appId), token = metaToken()
  if (!ig || !token) return null
  try {
    const body = await call(`${G}/${ig}/insights?metric=online_followers&period=lifetime&access_token=${token}`)
    const values = body.data?.[0]?.values ?? []
    const out = values.filter((v: { value?: object }) => v.value && Object.keys(v.value).length)
      .map((v: { value: Record<string, number>; end_time: string }) => ({ date: v.end_time, hours: v.value }))
    return out.length ? out : null
  } catch { return null }
}
