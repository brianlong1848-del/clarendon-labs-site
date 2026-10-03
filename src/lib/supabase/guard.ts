import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Admin guard ─────────────────────────────────────────────────────────────
//
// THE rule for everything under /admin, /analytics, /inbox, /post and the API
// routes behind them: a verified Supabase session for exactly ADMIN_EMAIL, with
// a TOTP second factor completed in this session (aal2). Anything else — no
// session, a different user, password-only — is refused. Unset ADMIN_EMAIL
// means locked, never open.
//
// getUser() asks Supabase to validate the token; we never trust the cookie
// payload alone.

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const allowed = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (!allowed) return false
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return false
  if ((data.user.email ?? '').toLowerCase() !== allowed) return false
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
}

// The native Studio iPhone app can't hold a browser cookie, so it signs in with
// Supabase directly (email + password + authenticator code) and sends the
// resulting access token as "Authorization: Bearer ...". Same rule as above:
// getUser() validates the token with Supabase, the email must be ADMIN_EMAIL,
// and the token itself must carry aal2 (the second factor was completed).
export async function isAdminToken(token: string): Promise<boolean> {
  const allowed = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY
  if (!allowed || !url || !key || !token) return false
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return false
  if ((data.user.email ?? '').toLowerCase() !== allowed) return false
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
