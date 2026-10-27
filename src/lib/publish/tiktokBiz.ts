// ─── TikTok via TikTok API for Business (Accounts API) ───────────────────────
//
// SERVER ONLY. Replaces the Login Kit / Content Posting app for posting:
// TikTok rejected that app ("internal company use is not eligible"), while
// the Business API's Accounts API is built for a company publishing to the
// TikTok accounts it owns, publicly.
//
// Env (the "Clarendon Labs Analytics" app on business-api.tiktok.com):
//   TIKTOK_BIZ_APP_ID   — App ID (defaults to 7693244812249563157)
//   TIKTOK_BIZ_SECRET   — App secret
//   TIKTOK_BIZ_AUTH_URL — the app's "TikTok account holder authorization URL"
//                         (Basic Information); we add state + disable_auto_auth
// The app's "TikTok account holder redirect URL" must be BIZ_REDIRECT below.
//
// Each app's TikTok account authorizes once (Post › Accounts › Connect TikTok).
// Access tokens last a day and refresh from a one-year refresh token. Videos
// are pulled by TikTok straight from studio-media, whose public URL prefix is
// verified as ours once (ensureMediaVerified).
//
// Docs: business-api.tiktok.com/portal/docs — accounts-api-authentication,
// publish-a-public-video-post-to-an-owned-account, manage-url-properties.

import { handleFits, wrongAccount } from './ownership'
import { getToken, saveToken, signState, type StoredToken } from './tokens'
import type { CreatorInfo, PublishStatus } from './tiktok'
import type { TikTokSettings } from './rules'
import { tiktokFetch } from '@/lib/analytics/tiktok'

const API = 'https://business-api.tiktok.com/open_api/v1.3'
export const BIZ_PLATFORM = 'tiktok-biz'
export const BIZ_REDIRECT = process.env.TIKTOK_BIZ_REDIRECT_URI ?? 'https://clarendon.dev/api/publish/tiktok/biz/callback/'

const appId = () => process.env.TIKTOK_BIZ_APP_ID || '7693244812249563157'
const secret = () => process.env.TIKTOK_BIZ_SECRET ?? ''
export const bizConfigured = () => !!(process.env.TIKTOK_BIZ_SECRET && process.env.TIKTOK_BIZ_AUTH_URL)

export function bizMediaPrefix() {
  const base = process.env.SUPABASE_URL ?? ''
  return base ? `${base.replace(/\/$/, '')}/storage/v1/object/public/studio-media/` : ''
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export function bizAuthorizeUrl(app: string) {
  const u = new URL(process.env.TIKTOK_BIZ_AUTH_URL ?? '')
  u.searchParams.set('state', signState(app, secret()))
  // Always show the account picker, so connecting Borea after Rolligan
  // doesn't reuse whichever account TikTok has signed in.
  u.searchParams.set('disable_auto_auth', '1')
  return u.toString()
}

type BizToken = { access_token: string; expires_in: number; open_id: string; refresh_token: string; refresh_token_expires_in: number; scope: string }

async function call<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, opts: { token?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const u = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v)
  // Same developer app as /analytics → same 10 requests/second budget: go
  // through the shared limiter and 40100 retry.
  const { out, status } = await tiktokFetch(u, {
    method, timeoutMs: 25000,
    headers: { ...(opts.token ? { 'Access-Token': opts.token } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (out?.code !== 0) throw new Error(friendly(out?.code, out?.message) || `TikTok error (HTTP ${status})`)
  return (out.data ?? {}) as T
}

function friendly(code?: number, message?: string) {
  const m = String(message ?? '')
  if (/access.?token|expired|invalid.*token/i.test(m)) return 'The TikTok sign-in expired — reconnect TikTok for this app.'
  if (/scope|permission/i.test(m)) return `TikTok permission missing (${m}) — reconnect TikTok and allow everything.`
  if (/url.*(verif|owner)|property/i.test(m)) return 'TikTok hasn’t verified the video storage link yet — run the one-time media check on Post › Accounts.'
  if (/limit|too many|frequen/i.test(m)) return 'TikTok’s posting limit for this account has been reached (15 a day). Try again later.'
  return m || (code ? `TikTok error ${code}` : '')
}

const rowFrom = (app: string, t: BizToken, username: string | null) => ({
  platform: BIZ_PLATFORM, app_id: app, account_id: t.open_id, username, token: t.access_token,
  expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  refresh_token: t.refresh_token,
  refresh_expires_at: new Date(Date.now() + t.refresh_token_expires_in * 1000).toISOString(),
})

type Profile = { username?: string; display_name?: string; profile_image?: string; is_business_account?: boolean }
const profile = (token: string, openId: string) =>
  call<Profile>('GET', '/business/get/', { token, query: { business_id: openId, fields: JSON.stringify(['username', 'display_name', 'profile_image']) } })

/** auth_code from the callback → tokens → handle → stored. Returns the handle. */
export async function bizConnectFromCode(app: string, code: string) {
  const t = await call<BizToken>('POST', '/tt_user/oauth2/token/', {
    body: { client_id: appId(), client_secret: secret(), grant_type: 'authorization_code', auth_code: code, redirect_uri: BIZ_REDIRECT },
  })
  if (!t.scope?.includes('video.publish')) {
    throw new Error('TikTok didn’t grant posting permission — tick every box on the TikTok screen and try again.')
  }
  let name: string | null = null
  try { const p = await profile(t.access_token, t.open_id); name = p.username ?? p.display_name ?? null } catch { /* checked below */ }
  if (!handleFits(app, name)) throw new Error(name ? wrongAccount(app, name, 'TikTok') : 'Couldn’t read the TikTok handle — try again.')
  await saveToken(rowFrom(app, t, name))
  return name
}

/** A working access token for this app's TikTok, refreshing it when close to expiry. */
export async function bizToken(app: string): Promise<StoredToken | undefined> {
  const row = await getToken(BIZ_PLATFORM, app)
  if (!row) return undefined
  const fresh = row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 30 * 60_000
  if (fresh || !row.refresh_token) return row
  const t = await call<BizToken>('POST', '/tt_user/oauth2/refresh_token/', {
    body: { client_id: appId(), client_secret: secret(), grant_type: 'refresh_token', refresh_token: row.refresh_token },
  })
  const next = rowFrom(app, t, row.username)
  await saveToken(next)
  return { ...row, ...next }
}

export async function refreshBizTokens(apps: readonly string[]) {
  for (const id of apps) {
    try { await bizToken(id) } catch (e) { console.error(`[tiktok-biz] refresh ${id}:`, (e as Error).message) }
  }
}

// ── Posting ──────────────────────────────────────────────────────────────────

type Settings = { privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number }

/** The same shape the composer already uses for TikTok. The Business API only
 *  posts publicly (or as a draft to the account's inbox). */
export async function bizCreatorInfo(row: StoredToken): Promise<CreatorInfo> {
  const [s, p] = await Promise.all([
    call<Settings>('GET', '/business/video/settings/', { token: row.token, query: { business_id: row.account_id ?? '' } }),
    profile(row.token, row.account_id ?? '').catch(() => ({} as Profile)),
  ])
  return {
    creator_username: p.username ?? row.username ?? '', creator_nickname: p.display_name ?? '', creator_avatar_url: p.profile_image ?? '',
    privacy_level_options: ['PUBLIC_TO_EVERYONE'],
    comment_disabled: !!s.comment_disabled, duet_disabled: !!s.duet_disabled, stitch_disabled: !!s.stitch_disabled,
    max_video_post_duration_sec: s.max_video_post_duration_sec ?? 600,
  }
}

/** Hand TikTok the video's URL. Returns the publish id (share_id). */
export async function bizPublish(row: StoredToken, videoUrl: string, caption: string, s: TikTokSettings) {
  const prefix = bizMediaPrefix()
  if (!prefix || !videoUrl.startsWith(prefix)) throw new Error('TikTok can only take videos uploaded to Studio.')
  const draft = s.mode === 'draft'
  const out = await call<{ share_id: string }>('POST', '/business/video/publish/', {
    token: row.token,
    body: {
      business_id: row.account_id, video_url: videoUrl,
      post_info: draft ? { upload_to_draft: true } : {
        caption: caption.slice(0, 2200),
        is_brand_organic: !!(s.commercial && s.yourBrand),
        is_branded_content: !!(s.commercial && s.brandedContent),
        disable_comment: !s.allowComment, disable_duet: !s.allowDuet, disable_stitch: !s.allowStitch,
        thumbnail_offset: 1000,
      },
    },
  })
  return out.share_id
}

export async function bizStatus(row: StoredToken, publishId: string): Promise<PublishStatus> {
  const d = await call<{ status: PublishStatus['status']; post_ids?: string[]; reason?: string }>('GET', '/business/publish/status/', {
    token: row.token, query: { business_id: row.account_id ?? '', publish_id: publishId },
  })
  return { status: d.status, fail_reason: d.reason, publicaly_available_post_id: d.post_ids }
}

// ── One-time: prove studio-media is ours ─────────────────────────────────────

type Property = { property_type: number; url: string; property_status: number; signature?: string; file_name?: string }

/** Add the studio-media URL prefix as a TikTok URL property, put TikTok's
 *  signature file there, and ask TikTok to verify it. Safe to run again. */
export async function ensureMediaVerified(): Promise<{ status: 'verified' | 'pending' | 'failed'; url: string; detail?: string }> {
  const url = bizMediaPrefix()
  const auth = { app_id: appId(), secret: secret() }
  const list = await call<{ url_property_info_list?: Property[] }>('GET', '/business/property/list/', { query: auth })
  let prop = list.url_property_info_list?.find((p) => p.url === url)
  if (prop?.property_status === 1) return { status: 'verified', url }
  if (!prop) prop = (await call<{ url_property_info: Property }>('POST', '/business/property/add/', { body: { ...auth, url_property_meta: { property_type: 2, url } } })).url_property_info
  if (!prop.file_name || !prop.signature) return { status: 'failed', url, detail: 'TikTok didn’t return a signature file.' }

  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const up = await fetch(`${base}/storage/v1/object/studio-media/${encodeURIComponent(prop.file_name)}`, {
    method: 'POST', cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
    body: prop.signature,
  })
  if (!up.ok) return { status: 'failed', url, detail: `Couldn’t upload TikTok’s signature file (${up.status}).` }

  const v = await call<{ url_property_info: Property }>('POST', '/business/property/verify/', { body: { ...auth, url_property_meta: { property_type: 2, url } } })
  const st = v.url_property_info?.property_status
  return st === 1 ? { status: 'verified', url } : { status: st === 2 ? 'failed' : 'pending', url, detail: st === 2 ? 'TikTok couldn’t read the signature file.' : undefined }
}
