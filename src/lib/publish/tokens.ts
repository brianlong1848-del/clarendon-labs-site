// ─── Connected-account tokens ────────────────────────────────────────────────
//
// SERVER ONLY. OAuth tokens for platforms that need one sign-in per account
// (Threads today; TikTok once it's approved). Kept in studio_social_tokens in
// the site's Supabase project — RLS on, no policies, service role only — so
// connecting an account never means pasting a token into Vercel.

import { createHmac, timingSafeEqual } from 'crypto'

export type StoredToken = { platform: string; app_id: string; account_id: string | null; username: string | null; token: string; expires_at: string | null; refreshed_at: string }

const env = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured on this deployment.')
  return { url, key, h: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

let cache: { at: number; rows: StoredToken[] } | null = null
async function all(): Promise<StoredToken[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.rows
  try {
    const { url, h } = env()
    const res = await fetch(`${url}/rest/v1/studio_social_tokens?select=*`, { headers: h, cache: 'no-store' })
    cache = { at: Date.now(), rows: res.ok ? await res.json() : [] }
  } catch { cache = { at: Date.now(), rows: [] } }
  return cache.rows
}

export async function getToken(platform: string, appId: string) {
  return (await all()).find((t) => t.platform === platform && t.app_id === appId)
}

export async function saveToken(row: Omit<StoredToken, 'refreshed_at'>) {
  const { url, h } = env()
  const res = await fetch(`${url}/rest/v1/studio_social_tokens?on_conflict=platform,app_id`, {
    method: 'POST', cache: 'no-store',
    headers: { ...h, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ ...row, refreshed_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Couldn’t save the connection (${res.status}).`)
  cache = null
}

// ── Threads ──────────────────────────────────────────────────────────────────

export const THREADS_SCOPES = 'threads_basic,threads_content_publish'

export function threadsRedirect(req: Request) {
  return `${process.env.SITE_ORIGIN ?? new URL(req.url).origin}/api/publish/threads/callback`
}

/** Signed, 15-minute OAuth state naming the app being connected. */
export function signState(appId: string) {
  const body = `${appId}.${Date.now() + 15 * 60_000}`
  const mac = createHmac('sha256', process.env.THREADS_APP_SECRET ?? '').update(body).digest('base64url')
  return `${body}.${mac}`
}
export function readState(state: string): string | null {
  const [appId, exp, mac] = state.split('.')
  if (!appId || !exp || !mac || Number(exp) < Date.now()) return null
  const want = createHmac('sha256', process.env.THREADS_APP_SECRET ?? '').update(`${appId}.${exp}`).digest()
  const got = Buffer.from(mac, 'base64url')
  return got.length === want.length && timingSafeEqual(got, want) ? appId : null
}

/** Long-lived Threads tokens last 60 days; refresh any older than a week. */
export async function refreshThreadsTokens() {
  const stale = (await all()).filter((t) => t.platform === 'threads' && Date.now() - new Date(t.refreshed_at).getTime() > 7 * 86400_000)
  for (const t of stale) {
    try {
      const res = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${t.token}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok || !body.access_token) throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      await saveToken({ ...t, token: body.access_token, expires_at: new Date(Date.now() + (body.expires_in ?? 5184000) * 1000).toISOString() })
    } catch (e) { console.error(`[threads] refresh ${t.app_id}:`, (e as Error).message) }
  }
}
