'use client'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'

// Money → Settings: connect bank accounts through Plaid Link and see what's
// connected. Each connection is tagged business or personal up front; personal
// accounts' transactions are only ever shown in Triage.

type Account = { id: string; institution: string | null; name: string | null; mask: string | null; ownership: string; plaid_item_id: string | null }
type Item = { id: string; institution: string | null; status: string; updated_at: string }

declare global { interface Window { Plaid?: { create: (cfg: unknown) => { open: () => void } } } }

function loadPlaid(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve()
    const s = document.createElement('script')
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load Plaid Link'))
    document.head.appendChild(s)
  })
}

export default function MoneySettings() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [ownership, setOwnership] = useState<'business' | 'personal'>('business')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/money/accounts').catch(() => null)
    if (!res || !res.ok) return
    const d = await res.json(); setAccounts(d.accounts ?? []); setItems(d.items ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function post(path: string, body?: object) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return data
  }

  async function connect(itemId?: string) {
    setBusy(true); setMsg(null)
    try {
      const { link_token } = await post('/api/money/plaid/link-token', itemId ? { itemId } : {})
      await loadPlaid()
      window.Plaid!.create({
        token: link_token,
        onSuccess: async (public_token: string) => {
          try {
            if (!itemId) {
              const r = await post('/api/money/plaid/exchange', { public_token, ownership })
              setMsg({ text: `Connected ${r.institution ?? 'bank'} — ${r.accounts} account(s), ${r.sync?.added ?? 0} transactions pulled.` })
            } else setMsg({ text: 'Reconnected.' })
            await load()
          } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
          setBusy(false)
        },
        onExit: () => setBusy(false),
      }).open()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }); setBusy(false) }
  }

  async function run(path: string, body?: object, ok?: (d: any) => string) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(true); setMsg(null)
    try { const d = await post(path, body); setMsg({ text: ok ? ok(d) : 'Done.' }); await load() }
    catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 16 }
  return (
    <AdminShell title="Money · Settings" subtitle="Connected accounts and sync">
      <div style={{ maxWidth: 760, padding: 24 }}>
        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 6px' }}>Connect an account</h2>
          <p style={{ color: C.ink2, fontSize: 14, margin: '0 0 14px' }}>
            Tag it first: <b>business</b> accounts count as company money; <b>personal</b> cards are connected too so business charges on them can be found, but their transactions only appear in Triage.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={ownership} onChange={(e) => setOwnership(e.target.value as 'business' | 'personal')}
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14 }}>
              <option value="business">Business account</option>
              <option value="personal">Personal account</option>
            </select>
            <button style={btn('mint')} disabled={busy} onClick={() => connect()}>Connect with Plaid</button>
            <button style={btn('ghost')} disabled={busy} onClick={() => run('/api/money/plaid/sync', {}, (d) => `Synced ${d.results?.length ?? 0} connection(s).`)}>Sync now</button>
            <button style={btn('ghost')} disabled={busy} title="Sandbox only: adds a fake test bank"
              onClick={() => run('/api/money/plaid/sandbox-link', { ownership }, (d) => `Test bank added — ${d.sync?.added ?? 0} fake transactions.`)}>Add test bank (sandbox)</button>
          </div>
          {msg && <p style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5, marginTop: 12 }}>{msg.text}</p>}
        </div>

        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 10px' }}>Connected</h2>
          {items.length === 0 && <p style={{ color: C.soft, fontSize: 14 }}>Nothing connected yet.</p>}
          {items.map((it) => (
            <div key={it.id} style={{ padding: '10px 0', borderTop: `1px solid ${C.rule}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{it.institution ?? 'Bank'}</b>
                {it.status === 'ok'
                  ? <span style={{ color: C.mint, fontSize: 13 }}>Healthy</span>
                  : <button style={btn('ghost')} disabled={busy} onClick={() => connect(it.id)}>Needs re-login — reconnect</button>}
              </div>
              {accounts.filter((a) => a.plaid_item_id === it.id).map((a) => (
                <div key={a.id} style={{ color: C.ink2, fontSize: 13.5, marginTop: 4 }}>
                  {a.name ?? 'Account'}{a.mask ? ` ···${a.mask}` : ''} · <span style={{ color: a.ownership === 'personal' ? C.amber : C.mint }}>{a.ownership}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  )
}
