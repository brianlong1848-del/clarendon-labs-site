'use client'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, Label, btn, labelStyle } from '@/components/AdminNav'
import { supabaseBrowser } from '@/lib/supabase/browser'

// Security: who can open this console and how each person signs in.
//   Members      both household members (email, authenticator yes/no, last sign-in).
//                Adding one is done in Supabase (Auth → Users → Invite); the
//                invite makes them a member on its own (studio_member_invites).
//   Authenticator re-enrol your own TOTP app — your own only; nobody can touch
//                another member's factors from here.
//   Passkeys     Touch ID / Face ID sign-in for this device.

type Member = { user_id: string; email: string; display_name: string | null; added_at: string; last_sign_in_at: string | null; totp_enrolled: boolean }
type Passkey = { id: string; friendly_name?: string | null; created_at: string; last_used_at?: string | null }

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'

export default function Security() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [keys, setKeys] = useState<Passkey[]>([])
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  // Re-enrol flow: a new factor is enrolled and verified first, then the old
  // one is removed, so there is never a moment with no authenticator.
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')

  const load = useCallback(async () => {
    const [m, k] = await Promise.all([
      fetch('/api/admin/members').then((r) => r.json()).catch(() => ({})),
      supabaseBrowser().auth.passkey.list(),
    ])
    if (Array.isArray(m.members)) { setMembers(m.members); setMe(m.me ?? null) }
    else setMsg({ text: m.error ?? 'Could not load the members list', bad: true })
    setKeys((k.data as Passkey[] | null) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function addPasskey() {
    setBusy(true); setMsg(null)
    const { error } = await supabaseBrowser().auth.registerPasskey()
    setBusy(false)
    setMsg(error ? { text: `Could not add a passkey: ${error.message}`, bad: true } : { text: 'Passkey added.' })
    await load()
  }
  async function removePasskey(id: string) {
    setBusy(true)
    await supabaseBrowser().auth.passkey.delete({ passkeyId: id })
    setBusy(false); setMsg({ text: 'Passkey removed.' }); await load()
  }

  async function startReenrol() {
    setBusy(true); setMsg(null)
    const sb = supabaseBrowser()
    // Clear any half-finished enrolment first (unverified factors only).
    const { data: f } = await sb.auth.mfa.listFactors()
    for (const t of f?.totp ?? []) if (t.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: t.id })
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (error || !data) { setMsg({ text: `Could not start a new authenticator: ${error?.message ?? 'unknown error'}`, bad: true }); return }
    setEnrol({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); setCode('')
  }
  async function finishReenrol() {
    if (!enrol) return
    setBusy(true); setMsg(null)
    const sb = supabaseBrowser()
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enrol.factorId, code: code.trim() })
    if (error) { setBusy(false); setMsg({ text: 'That code didn’t work. Try the next one from the app.', bad: true }); return }
    // New factor is verified: retire the old ones.
    const { data: f } = await sb.auth.mfa.listFactors()
    for (const t of f?.totp ?? []) if (t.id !== enrol.factorId) await sb.auth.mfa.unenroll({ factorId: t.id })
    setEnrol(null); setCode(''); setBusy(false)
    setMsg({ text: 'Authenticator replaced. Use the new entry in your app from now on.' })
    await load()
  }
  function cancelReenrol() {
    const id = enrol?.factorId
    setEnrol(null); setCode('')
    if (id) supabaseBrowser().auth.mfa.unenroll({ factorId: id })
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, maxWidth: 1180 }
  const h2: React.CSSProperties = { fontFamily: C.serif, fontSize: 20, margin: '0 0 6px' }
  const p: React.CSSProperties = { color: C.ink2, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }
  const th: React.CSSProperties = { ...labelStyle, textAlign: 'left', padding: '8px 10px' }
  const td: React.CSSProperties = { padding: '0 10px', height: 48, borderTop: `1px solid ${C.rule}`, fontSize: 14.5, whiteSpace: 'nowrap' }

  return (
    <AdminShell title="Security" subtitle="Who can open this console, and how each of you signs in">
      {msg && <p style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5, margin: 0 }}>{msg.text}</p>}

      <div data-card style={card}>
        <h2 style={h2}>Members</h2>
        <p style={p}>Everyone here sees the whole console: Money &amp; ROI and Household alike. Each person signs in with their own email, password and authenticator app.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Member</th><th style={th}>Authenticator</th><th style={th}>Last sign-in</th><th style={th}>Since</th></tr></thead>
            <tbody>
              {members === null && <tr><td style={{ ...td, color: C.soft }} colSpan={4}>Loading…</td></tr>}
              {members?.map((m) => (
                <tr key={m.user_id}>
                  <td style={td}>
                    <span style={{ fontWeight: 650 }}>{m.display_name ?? m.email}</span>
                    {m.display_name && <span style={{ color: C.soft }}> · {m.email}</span>}
                    {m.user_id === me && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.mintTint, color: C.teal, fontWeight: 600 }}>you</span>}
                  </td>
                  <td style={{ ...td, color: m.totp_enrolled ? C.mint : C.amber, fontWeight: 600 }}>{m.totp_enrolled ? 'Set up' : 'Not yet — set up at first sign-in'}</td>
                  <td style={{ ...td, color: C.ink2 }}>{when(m.last_sign_in_at)}</td>
                  <td style={{ ...td, color: C.ink2 }}>{new Date(m.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...p, margin: '14px 0 0', fontSize: 13 }}>
          To add someone: Supabase → clarendon-studio → Authentication → Users → Invite user. Their email must be on the console allowlist (Vercel env <code style={{ fontFamily: C.mono, fontSize: 12 }}>ADMIN_EMAILS</code>) and in the invites table; the invite link brings them to <code style={{ fontFamily: C.mono, fontSize: 12 }}>/auth/set-password</code>.
        </p>
      </div>

      <div data-card style={card}>
        <h2 style={h2}>Your authenticator</h2>
        <p style={p}>The 6-digit code app you use after your password. New phone, or lost the entry? Set up a new one here; the old one stops working the moment the new one is confirmed. You can only change your own.</p>
        {!enrol ? (
          <button style={btn('ghost')} disabled={busy} onClick={startReenrol}>Set up a new authenticator</button>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            <Label>Scan this with your authenticator app</Label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrol.qr} alt="Authenticator QR code" width={180} height={180} style={{ display: 'block', background: '#fff', borderRadius: 8 }} />
            <p style={{ fontFamily: C.mono, fontSize: 11, color: C.soft, wordBreak: 'break-all', margin: 0 }}>{enrol.secret}</p>
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from the app" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)}
              style={{ background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn('mint')} disabled={busy || code.trim().length !== 6} onClick={finishReenrol}>Confirm new authenticator</button>
              <button style={btn('ghost')} disabled={busy} onClick={cancelReenrol}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div data-card style={card}>
        <h2 style={h2}>Passkeys</h2>
        <p style={p}>
          A passkey signs you in with Touch ID or Face ID instead of a typed password. Add one on each device you use. The 6-digit code from your authenticator app is still asked for after it.
        </p>
        <button style={btn('ghost')} disabled={busy} onClick={addPasskey}>Add a passkey on this device</button>
        <div style={{ marginTop: 14 }}>
          {keys.length === 0 && <p style={{ color: C.soft, fontSize: 14 }}>No passkeys on this account yet.</p>}
          {keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.rule}` }}>
              <div>
                <div style={{ fontWeight: 650 }}>{k.friendly_name || 'Passkey'}</div>
                <div style={{ color: C.soft, fontSize: 12.5 }}>
                  Added {new Date(k.created_at).toLocaleDateString()}{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button style={btn('ghost')} disabled={busy} onClick={() => removePasskey(k.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  )
}
