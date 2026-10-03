'use client'
import { useCallback, useEffect, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn } from '@/components/AdminNav'

// Money → Subscriptions
//
// Recurring business costs still billed to personal cards. Each one posts itself
// as a transaction on its due date (daily cron), so nothing is retyped. "Moved to
// business" stops that, because Plaid sees the charge on the business account
// from then on. The bar at the top tracks the move.

type App = { slug: string; name: string }
type PayFrom = { id: string; label: string; ownership: string }
type Cat = { value: string; label: string }
type Sub = {
  id: string; vendor: string; amount_cents: number; cadence: 'monthly' | 'annual'; next_date: string; app_slug: string | null
  split_apps: string[] | null; paid_from: string; schedule_c: string | null; active: boolean; moved_to_business_on: string | null; notes: string | null
}
type Progress = { total: number; moved: number; personal_monthly_cents: number }

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14, background: C.card, color: C.ink, font: 'inherit', width: '100%', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 16 }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontFamily: C.mono, letterSpacing: '.08em', textTransform: 'uppercase', color: C.soft, marginBottom: 6 }

export default function Subscriptions() {
  const [items, setItems] = useState<Sub[]>([])
  const [progress, setProgress] = useState<Progress>({ total: 0, moved: 0, personal_monthly_cents: 0 })
  const [apps, setApps] = useState<App[]>([])
  const [payFrom, setPayFrom] = useState<PayFrom[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [f, setF] = useState({ vendor: '', amount: '', cadence: 'monthly', next_date: today(), app: '', split: [] as string[], paid_from: '', schedule_c: 'software', notes: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      fetch('/api/money/recurring').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/money/ledger').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (s) { setItems(s.items); setProgress(s.progress) }
    if (l) {
      setApps(l.apps); setPayFrom(l.paidFrom); setCats(l.categories)
      setF((p) => (p.paid_from ? p : { ...p, paid_from: l.paidFrom.find((x: PayFrom) => x.ownership === 'personal')?.id ?? '' }))
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function call(method: 'POST' | 'PATCH', body: object, ok: string) {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/money/recurring', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? { text: ok } : { text: d.error ?? `HTTP ${res.status}`, bad: true })
    if (res.ok) await load()
    setBusy(false)
    return res.ok
  }

  async function add() {
    const isSplit = f.app === '__split'
    const ok = await call('POST', {
      vendor: f.vendor, amount: f.amount, cadence: f.cadence, next_date: f.next_date, paid_from: f.paid_from, schedule_c: f.schedule_c, notes: f.notes,
      app_slug: isSplit ? null : f.app || null, split_apps: isSplit ? f.split : null,
    }, `Added ${f.vendor}. It posts itself on ${f.next_date} and every ${f.cadence === 'monthly' ? 'month' : 'year'} after.`)
    if (ok) setF((p) => ({ ...p, vendor: '', amount: '', notes: '', app: '', split: [] }))
  }

  const appName = (s: string | null) => apps.find((a) => a.slug === s)?.name ?? (s ?? 'Shared')
  const payLabel = (id: string) => payFrom.find((p) => p.id === id)?.label ?? id
  const pct = progress.total ? Math.round((progress.moved / progress.total) * 100) : 0
  const left = items.filter((i) => i.active && !i.moved_to_business_on)
  const done = items.filter((i) => i.moved_to_business_on || !i.active)

  return (
    <AdminShell title="Money · Subscriptions" subtitle="Recurring costs on personal cards, and the move to the business account">
      <MoneyTabs />
      <div style={{ maxWidth: 900, padding: '24px 0' }}>
        <div style={card}>
          <div style={label}>Move to business</div>
          <div style={{ fontFamily: C.serif, fontSize: 26, fontWeight: 900, margin: '2px 0 10px' }}>
            {progress.moved} of {progress.total} subscriptions moved · {usd(progress.personal_monthly_cents)}/mo still on personal
          </div>
          <div style={{ height: 10, borderRadius: 99, background: C.card2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: C.mint, transition: 'width .3s' }} />
          </div>
        </div>

        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 14px' }}>Add a subscription</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div><span style={label}>Vendor</span><input style={input} placeholder="Apple Developer" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></div>
            <div><span style={label}>Amount (USD)</span><input style={input} inputMode="decimal" placeholder="0.00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><span style={label}>Every</span>
              <select style={input} value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })}><option value="monthly">Month</option><option value="annual">Year</option></select></div>
            <div><span style={label}>Next charge</span><input type="date" style={input} value={f.next_date} onChange={(e) => setF({ ...f, next_date: e.target.value })} /></div>
            <div><span style={label}>Paid from</span>
              <select style={input} value={f.paid_from} onChange={(e) => setF({ ...f, paid_from: e.target.value })}>
                {payFrom.map((p) => <option key={p.id} value={p.id}>{p.label}{p.ownership === 'business' ? ' (business)' : ''}</option>)}
              </select></div>
            <div><span style={label}>Category</span>
              <select style={input} value={f.schedule_c} onChange={(e) => setF({ ...f, schedule_c: e.target.value })}>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><span style={label}>App</span>
              <select style={input} value={f.app} onChange={(e) => setF({ ...f, app: e.target.value })}>
                <option value="">Shared</option>
                {apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                <option value="__split">Split evenly between…</option>
              </select></div>
          </div>
          {f.app === '__split' && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
              {apps.filter((a) => a.slug !== 'studio').map((a) => (
                <label key={a.slug} style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={f.split.includes(a.slug)}
                    onChange={(e) => setF({ ...f, split: e.target.checked ? [...f.split, a.slug] : f.split.filter((s) => s !== a.slug) })} />{a.name}
                </label>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}><span style={label}>Notes</span><input style={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <button style={{ ...btn('mint'), marginTop: 14 }} disabled={busy} onClick={add}>Add subscription</button>
          {msg && <p style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5, marginTop: 12 }}>{msg.text}</p>}
        </div>

        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 10px' }}>Still on personal <span style={{ fontSize: 14, color: C.soft }}>{left.length}</span></h2>
          {left.length === 0 && <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>None. Add the subscriptions you still pay personally above.</p>}
          {left.map((s) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${C.rule}`, fontSize: 14 }}>
              <span>
                <b>{s.vendor}</b> · {usd(s.amount_cents)}/{s.cadence === 'monthly' ? 'mo' : 'yr'}
                <span style={{ display: 'block', color: C.soft, fontSize: 12.5 }}>
                  next {s.next_date} · {s.split_apps ? s.split_apps.map(appName).join(' / ') : appName(s.app_slug)} · {payLabel(s.paid_from)}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button style={btn('mint')} disabled={busy} onClick={() => call('PATCH', { id: s.id, moved_to_business_on: today() }, `${s.vendor} marked as moved. Auto-posting stopped; Plaid picks it up from the business account.`)}>Moved to business</button>
                <button style={btn('ghost')} disabled={busy} onClick={() => call('PATCH', { id: s.id, active: false }, `${s.vendor} paused.`)}>Cancelled</button>
              </span>
            </div>
          ))}
        </div>

        {done.length > 0 && (
          <div style={card}>
            <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 10px' }}>Moved or cancelled</h2>
            {done.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${C.rule}`, fontSize: 14, gap: 10 }}>
                <span><b>{s.vendor}</b> · {usd(s.amount_cents)}/{s.cadence === 'monthly' ? 'mo' : 'yr'} · <span style={{ color: s.moved_to_business_on ? C.mint : C.soft }}>{s.moved_to_business_on ? `moved ${s.moved_to_business_on}` : 'cancelled'}</span></span>
                <button style={btn('ghost')} disabled={busy} onClick={() => call('PATCH', { id: s.id, moved_to_business_on: null, active: true }, `${s.vendor} is back on the personal list.`)}>Undo</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
