'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { C, btn } from '@/components/AdminNav'
import { supabaseBrowser } from '@/lib/supabase/browser'

// Two steps: email + password, then a TOTP code from an authenticator app.
// First sign-in enrolls the authenticator (QR); after that it's code-only.
// There is no sign-up here — new users are disabled in the Supabase project.

type Step = 'creds' | 'enroll' | 'code'

function LoginForm() {
  const params = useSearchParams()
  const [step, setStep] = useState<Step>('creds')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const next = (() => {
    const n = params.get('next') ?? '/admin'
    return n.startsWith('/') && !n.startsWith('//') ? n : '/admin'
  })()

  async function signIn() {
    setBusy(true); setError(null)
    const sb = supabaseBrowser()
    const { error: e } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    if (e) { setBusy(false); setError('Sign-in failed.'); return }
    const { data: f } = await sb.auth.mfa.listFactors()
    const verified = f?.totp?.find((t) => t.status === 'verified')
    if (verified) { setFactorId(verified.id); setStep('code'); setBusy(false); return }
    // Clear any half-finished enrolment, then start a fresh one.
    for (const t of f?.totp ?? []) await sb.auth.mfa.unenroll({ factorId: t.id })
    const { data, error: ee } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    setBusy(false)
    if (ee || !data) { setError('Could not start authenticator setup.'); return }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setStep('enroll')
  }

  async function passkeySignIn() {
    setBusy(true); setError(null)
    const sb = supabaseBrowser()
    const { error: e } = await sb.auth.signInWithPasskey()
    if (e) { setBusy(false); setError('Passkey sign-in didn’t work.'); return }
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') { window.location.href = next; return }
    // A passkey alone doesn't reach the console's required level yet: ask for the authenticator code too.
    const { data: f } = await sb.auth.mfa.listFactors()
    const verified = f?.totp?.find((t) => t.status === 'verified')
    setBusy(false)
    if (verified) { setFactorId(verified.id); setStep('code'); return }
    setError('Signed in, but no authenticator is set up. Use email and password once.')
  }

  async function verify() {
    setBusy(true); setError(null)
    const sb = supabaseBrowser()
    const { error: e } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (e) { setBusy(false); setError('That code didn’t work.'); return }
    window.location.href = next
  }

  const input: React.CSSProperties = { background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box', marginBottom: 10 }
  return (
    <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink, display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
      <form style={{ width: '100%', maxWidth: 360 }} onSubmit={(e) => { e.preventDefault(); step === 'creds' ? signIn() : verify() }}>
        <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
        <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '10px 0 22px' }}>Console</h1>

        {step === 'creds' && (<>
          <input style={input} type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" style={{ ...btn('mint'), width: '100%' }} disabled={busy || !email || !password}>Continue</button>
          <button type="button" style={{ ...btn('ghost'), width: '100%', marginTop: 10 }} disabled={busy} onClick={passkeySignIn}>Sign in with a passkey</button>
        </>)}

        {step === 'enroll' && (<>
          <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5 }}>Scan this with your authenticator app, then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Authenticator QR code" width={180} height={180} style={{ display: 'block', margin: '8px 0', background: '#fff' }} />
          <p style={{ fontFamily: C.mono, fontSize: 11, color: C.soft, wordBreak: 'break-all' }}>{secret}</p>
        </>)}

        {(step === 'enroll' || step === 'code') && (<>
          <input style={input} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <button type="submit" style={{ ...btn('mint'), width: '100%' }} disabled={busy || code.trim().length !== 6}>Sign in</button>
        </>)}

        {error && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</p>}
      </form>
    </main>
  )
}

export default function LoginPage() { return <Suspense><LoginForm /></Suspense> }
