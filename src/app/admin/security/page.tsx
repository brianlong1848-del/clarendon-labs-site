'use client'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { supabaseBrowser } from '@/lib/supabase/browser'

// Security: register and remove passkeys for the admin login. A passkey lives on
// a device (Touch ID / Face ID / security key) and can't be phished like a password.

type Passkey = { id: string; friendly_name?: string | null; created_at: string; last_used_at?: string | null }

export default function Security() {
  const [keys, setKeys] = useState<Passkey[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().auth.passkey.list()
    setKeys((data as Passkey[] | null) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    setBusy(true); setMsg(null)
    const { error } = await supabaseBrowser().auth.registerPasskey()
    setBusy(false)
    setMsg(error ? `Could not add a passkey: ${error.message}` : 'Passkey added.')
    await load()
  }
  async function remove(id: string) {
    setBusy(true)
    await supabaseBrowser().auth.passkey.delete({ passkeyId: id })
    setBusy(false); setMsg('Passkey removed.'); await load()
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: 22, maxWidth: 640 }
  return (
    <AdminShell title="Security" subtitle="How you sign in to this console">
      <div style={card}>
        <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 6px' }}>Passkeys</h2>
        <p style={{ color: C.ink2, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>
          A passkey signs you in with Touch ID or Face ID instead of a typed password. Add one on each device you use, your Mac and your iPhone.
        </p>
        <button style={btn('mint')} disabled={busy} onClick={add}>Add a passkey on this device</button>
        {msg && <p style={{ color: C.mint, fontSize: 13.5 }}>{msg}</p>}
        <div style={{ marginTop: 14 }}>
          {keys.length === 0 && <p style={{ color: C.soft, fontSize: 14 }}>No passkeys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.rule}` }}>
              <div>
                <div style={{ fontWeight: 650 }}>{k.friendly_name || 'Passkey'}</div>
                <div style={{ color: C.soft, fontSize: 12.5 }}>
                  Added {new Date(k.created_at).toLocaleDateString()}{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button style={btn('ghost')} disabled={busy} onClick={() => remove(k.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  )
}
