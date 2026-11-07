'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { C, btn } from '@/components/AdminNav'
import { supabaseBrowser } from '@/lib/supabase/browser'

// Where an invite (or a password reset) lands. Supabase sends the person here
// with a one-time session — in the URL hash (#access_token=…&type=invite) or,
// with a token-hash template, as ?token_hash=…&type=invite. We take that
// session, ask for one password, save it, sign out, and send them to /login,
// where the first sign-in enrols their authenticator exactly as Brian's did.
//
// Not behind the middleware on purpose (nobody has a password yet). New users
// stay disabled in the Supabase project: only an invite from the dashboard can
// create the user this page sets a password for. The URL must be listed in
// Supabase → Auth → URL Configuration → Redirect URLs:
//   https://www.clarendon.dev/auth/set-password

type Phase = 'checking' | 'ready' | 'saving' | 'done' | 'nolink'

function SetPasswordForm() {
  const params = useSearchParams()
  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sb = supabaseBrowser()
    let settled = false
    const ready = (e: string | null | undefined) => { settled = true; setEmail(e ?? null); setPhase('ready') }

    // Token-hash form of the link (works in any browser, no hash fragment).
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (tokenHash && (type === 'invite' || type === 'recovery' || type === 'magiclink' || type === 'email')) {
      sb.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'recovery' | 'magiclink' | 'email' })
        .then(({ data, error: e }) => { if (e || !data.session) setPhase('nolink'); else ready(data.user?.email) })
      return
    }

    // Hash / code form: the client picks the session out of the URL on its own
    // and tells us through onAuthStateChange.
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) ready(session.user.email)
    })
    // If the URL carried nothing usable, say so rather than spin forever.
    const t = setTimeout(async () => {
      if (settled) return
      const { data } = await sb.auth.getSession()
      if (data.session) ready(data.session.user.email)
      else setPhase('nolink')
    }, 2500)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [params])

  async function save() {
    setError(null)
    if (password.length < 12) { setError('Use at least 12 characters.'); return }
    if (password !== again) { setError('The two passwords don’t match.'); return }
    setPhase('saving')
    const sb = supabaseBrowser()
    const { error: e } = await sb.auth.updateUser({ password })
    if (e) { setPhase('ready'); setError(`Couldn’t save that password (${e.message}).`); return }
    await sb.auth.signOut()
    setPhase('done')
    setTimeout(() => { window.location.href = '/login' }, 1800)
  }

  const input: React.CSSProperties = { background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box', marginBottom: 10 }
  return (
    <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink, display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
      <form style={{ width: '100%', maxWidth: 380 }} onSubmit={(e) => { e.preventDefault(); if (phase === 'ready') save() }}>
        <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
        <h1 style={{ fontFamily: C.serif, fontSize: 34, fontWeight: 800, margin: '10px 0 8px', letterSpacing: '-.02em' }}>Choose a password</h1>

        {phase === 'checking' && <p style={{ fontSize: 14, color: C.ink2 }}>Checking your invitation…</p>}

        {phase === 'nolink' && (<>
          <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5 }}>
            This page needs the link from your invitation email, and that link works once. Open the email again and tap the button in it, or ask Brian to send a new invitation.
          </p>
          <a href="/login" style={{ ...btn('ghost'), display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>Go to sign in</a>
        </>)}

        {(phase === 'ready' || phase === 'saving') && (<>
          <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5, margin: '0 0 16px' }}>
            {email ? <>For <b style={{ color: C.ink }}>{email}</b>. </> : null}
            Pick a password you don&rsquo;t use anywhere else. Next, signing in once will set up your authenticator app.
          </p>
          <input style={input} type="password" autoComplete="new-password" placeholder="New password (12+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <input style={input} type="password" autoComplete="new-password" placeholder="Type it again" value={again} onChange={(e) => setAgain(e.target.value)} />
          <button type="submit" style={{ ...btn('mint'), width: '100%' }} disabled={phase === 'saving' || !password || !again}>
            {phase === 'saving' ? 'Saving…' : 'Save password'}
          </button>
        </>)}

        {phase === 'done' && <p style={{ fontSize: 14, color: C.mint }}>Saved. Taking you to sign in…</p>}

        {error && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</p>}
      </form>
    </main>
  )
}

export default function SetPasswordPage() { return <Suspense><SetPasswordForm /></Suspense> }
