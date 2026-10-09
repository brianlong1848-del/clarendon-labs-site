// ─── TikTok (Login Kit + Content Posting API) ───────────────────────────────
//
// SERVER ONLY. One TikTok sign-in per app account, made from /post ("Connect
// TikTok") and kept in studio_social_tokens like Threads. Access tokens last
// 24 hours, so every read goes through tiktokToken(), which swaps in a fresh
// one from the 365-day refresh token when it's close to expiring.
//
// Env: TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET from the developer app
// "Clarendon Labs" (developers.tiktok.com, app 7694366699693426708). The
// Sandbox keys work until TikTok approves the app; swap in the Production
// keys after that and set TIKTOK_AUDITED=true.
//
// Video goes up with FILE_UPLOAD: the server reads it from studio-media and
// sends it to TikTok in chunks. (PULL_FROM_URL would need the Supabase
// storage URL verified as a TikTok URL property, which we can't do.)
//
// Docs: developers.tiktok.com/doc/content-posting-api-reference-direct-post

import { getToken, saveToken, signState, type StoredToken } from './tokens'
import type { TikTokPrivacy, TikTokSettings } from './rules'

export type { TikTokPrivacy, TikTokSettings }

const API = 'https://open.tiktokapis.com/v2'
export const TIKTOK_SCOPES = 'user.info.basic,video.publish,video.upload'
/** Must match the Redirect URI saved on the developer app exactly. */
export const TIKTOK_REDIRECT = process.env.TIKTOK_REDIRECT_URI ?? 'https://clarendon.dev/api/publish/tiktok/callback'

export const tiktokConfigured = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
/** Until TikTok audits the app, every post must be "Only me". */
export const tiktokAudited = () => process.env.TIKTOK_AUDITED === 'true'
const secret = () => process.env.TIKTOK_CLIENT_SECRET ?? ''

export type CreatorInfo = {
  creator_avatar_url: string; creator_username: string; creator_nickname: string
  privacy_level_options: TikTokPrivacy[]
  comment_disabled: boolean; duet_disabled: boolean; stitch_disabled: boolean
  max_video_post_duration_sec: number
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export function authorizeUrl(appId: string) {
  const u = new URL('https://www.tiktok.com/v2/auth/authorize/')
  u.search = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? '', scope: TIKTOK_SCOPES, response_type: 'code',
    redirect_uri: TIKTOK_REDIRECT, state: signState(appId, secret()),
    // Always show the account picker, so connecting Borea after Rolligan
    // doesn't silently reuse whichever account TikTok has signed in.
    disable_auto_auth: '1',
  }).toString()
  return u.toString()
}

type TokenResponse = { access_token: string; expires_in: number; open_id: string; refresh_token: string; refresh_expires_in: number; scope: string }

async function tokenCall(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? '', client_secret: secret(), ...params }).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!body.access_token) throw new Error(body.error_description || body.error || `TikTok sign-in failed (HTTP ${res.status})`)
  return body
}

const rowFrom = (appId: string, t: TokenResponse, username: string | null) => ({
  platform: 'tiktok', app_id: appId, account_id: t.open_id, username, token: t.access_token,
  expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  refresh_token: t.refresh_token,
  refresh_expires_at: new Date(Date.now() + t.refresh_expires_in * 1000).toISOString(),
})

/** Code from the callback → tokens → profile → stored. Returns the display name. */
export async function connectFromCode(appId: string, code: string) {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT })
  if (!t.scope?.includes('video.publish') && !t.scope?.includes('video.upload')) {
    throw new Error('TikTok didn’t grant posting permission — tick every box on the TikTok screen and try again.')
  }
  let name: string | null = null
  try { name = (await creatorInfo(t.access_token)).creator_username } catch {
    try { name = (await api(t.access_token, 'GET', '/user/info/?fields=open_id,display_name')).user?.display_name ?? null } catch { /* optional */ }
  }
  await saveToken(rowFrom(appId, t, name))
  return name
}

/** A working access token for this app's TikTok, refreshing it if needed. */
export async function tiktokToken(appId: string): Promise<StoredToken | undefined> {
  const row = await getToken('tiktok', appId)
  if (!row) return undefined
  const fresh = row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 10 * 60_000
  if (fresh || !row.refresh_token) return row
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
  const next = rowFrom(appId, t, row.username)
  await saveToken(next)
  return { ...row, ...next }
}

/** Keep every connection alive (the runner calls this every 5 minutes). */
export async function refreshTikTokTokens(appIds: readonly string[]) {
  for (const id of appIds) {
    try { await tiktokToken(id) } catch (e) { console.error(`[tiktok] refresh ${id}:`, (e as Error).message) }
  }
}

// ── API ──────────────────────────────────────────────────────────────────────

async function api(token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const out = await res.json().catch(() => ({}))
  const err = out?.error
  if (!res.ok || (err?.code && err.code !== 'ok')) throw new Error(friendly(err?.code, err?.message) || `TikTok error (HTTP ${res.status})`)
  return out.data ?? {}
}

function friendly(code?: string, message?: string) {
  switch (code) {
    case 'access_token_invalid': return 'The TikTok sign-in expired — reconnect TikTok for this app.'
    case 'scope_not_authorized': return 'This TikTok account didn’t grant posting permission — reconnect and allow everything.'
    case 'spam_risk_too_many_posts': return 'TikTok’s daily posting limit for this account has been reached. Try again tomorrow.'
    case 'spam_risk_user_banned_from_posting': return 'TikTok has blocked this account from posting through apps right now.'
    case 'privacy_level_option_mismatch': return 'That privacy choice isn’t available for this account any more — pick again.'
    case 'unaudited_client_can_only_post_to_private_accounts': return 'Until TikTok approves the app, posts must go up as “Only me”, and the account itself has to be set to private.'
    case 'url_ownership_unverified': return 'TikTok can’t verify the video’s URL.'
    default: return message || code
  }
}

export const creatorInfo = (token: string): Promise<CreatorInfo> =>
  api(token, 'POST', '/post/publish/creator_info/query/')

const MB = 1024 * 1024

/** Start the post and upload the file. Returns TikTok's publish_id. */
export async function startUpload(token: string, videoUrl: string, mime: string | undefined, title: string, s: TikTokSettings) {
  const head = await fetch(videoUrl, { method: 'HEAD', cache: 'no-store' })
  const size = Number(head.headers.get('content-length') ?? 0)
  if (!head.ok || !size) throw new Error('Couldn’t read the video from storage.')

  // TikTok: chunks of 5–64MB; anything up to 64MB goes as one chunk, and the
  // last chunk absorbs the remainder.
  const chunk = size <= 64 * MB ? size : 20 * MB
  const count = size <= 64 * MB ? 1 : Math.floor(size / chunk)
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count }

  const init = s.mode === 'draft'
    ? await api(token, 'POST', '/post/publish/inbox/video/init/', { source_info })
    : await api(token, 'POST', '/post/publish/video/init/', {
        post_info: {
          title: title.slice(0, 2200),
          privacy_level: s.privacy,
          disable_comment: !s.allowComment, disable_duet: !s.allowDuet, disable_stitch: !s.allowStitch,
          brand_organic_toggle: !!(s.commercial && s.yourBrand), brand_content_toggle: !!(s.commercial && s.brandedContent),
          video_cover_timestamp_ms: 1000,
        },
        source_info,
      })

  for (let i = 0; i < count; i++) {
    const start = i * chunk
    const end = i === count - 1 ? size - 1 : start + chunk - 1
    const part = await fetch(videoUrl, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store' })
    if (!part.ok) throw new Error(`Couldn’t read the video from storage (HTTP ${part.status}).`)
    const bytes = new Uint8Array(await part.arrayBuffer())
    const put = await fetch(init.upload_url, {
      method: 'PUT', cache: 'no-store',
      headers: { 'Content-Type': mime === 'video/quicktime' ? 'video/quicktime' : 'video/mp4', 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${start}-${end}/${size}` },
      body: bytes,
    })
    if (put.status !== 201 && put.status !== 206 && !put.ok) throw new Error(`TikTok upload failed (HTTP ${put.status}).`)
  }
  return init.publish_id as string
}

export type PublishStatus = { status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED'; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }

export const publishStatus = (token: string, publishId: string): Promise<PublishStatus> =>
  api(token, 'POST', '/post/publish/status/fetch/', { publish_id: publishId })
