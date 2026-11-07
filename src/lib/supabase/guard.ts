import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Admin guard ─────────────────────────────────────────────────────────────
//
// THE rule for everything under /admin, /household, /analytics, /inbox, /post
// and the API routes behind them: a verified Supabase session for one of the
// allow-listed emails, with a TOTP second factor completed in this session
// (aal2). Anything else — no session, a different user, password-only — is
// refused. An empty allowlist means locked, never open.
//
// Allowlist (FEAT-CLA-027, 2026-11-07): ADMIN_EMAILS, comma-separated. The old
// single ADMIN_EMAIL is still read as a fallback (and merged in) so nothing
// breaks on a deployment that only has the old variable. Row access in the
// database is decided separately by studio_members + is_studio_member(): the
// allowlist says who may open the console, the members table says whose rows
// they share.
//
// getUser() asks Supabase to validate the token; we never trust the cookie
// payload alone.

/** Lower-cased set of emails allowed into the console. Empty = locked. */
export function adminEmails(): Set<string> {
  const list = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const single = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (single) list.push(single)
  return new Set(list)
}

export const isAllowedEmail = (email: string | null | undefined) => {
  const e = (email ?? '').trim().toLowerCase()
  return !!e && adminEmails().has(e)
}

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  if (adminEmails().size === 0) return false
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return false
  if (!isAllowedEmail(data.user.email)) return false
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
}

// The native Studio iPhone app can't hold a browser cookie, so it signs in with
// Supabase directly (email + password + authenticator code) and sends the
// resulting access token as "Authorization: Bearer ...". Same rule as above:
// getUser() validates the token with Supabase, the email must be allow-listed,
// and the token itself must carry aal2 (the second factor was completed).
export async function isAdminToken(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY
  if (adminEmails().size === 0 || !url || !key || !token) return false
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return false
  if (!isAllowedEmail(data.user.email)) return false
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
    return claims.aal === 'aal2'
  } catch {
    return false
  }
}

export const bearerToken = (header: string | null | undefined) =>
  header && /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : ''
