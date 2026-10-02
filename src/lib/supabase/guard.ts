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
