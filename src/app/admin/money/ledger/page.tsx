'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { uploadReceipt, type UploadResult } from '@/lib/money/uploadReceipt'

// Money → Quick Add & receipts
//
// Business spending Plaid never sees (personal cards, cash) goes in here, and so
// do receipts: drop one on the page, Claude reads it, and it's either attached
// to the transaction it matches or turned into a pre-filled Quick Add. Nothing
// posts until you press Save. Same API as the Studio app's native Quick Add.

type App = { slug: string; name: string }
type PayFrom = { id: string; label: string; ownership: string }
type Cat = { value: string; label: string }
type Row = {
  id: string; posted_on: string; amount_cents: number; merchant: string | null; app_slug: string | null; split_apps: string[] | null
  schedule_c: string | null; paid_from: string | null; notes: string | null; source: string; status: string
  splits: { app_slug: string; share: number }[]; receipts: { id: string; file_name: string | null }[]
}
type Receipt = { id: string; file_name: string | null; mime_type: string | null; created_at: string; url: string | null; extracted: UploadResult['extracted'] }
type Form = { posted_on: string; amount: string; merchant: string; app_slug: string; split: boolean; shares: Record<string, string>; schedule_c: string; paid_from: string; notes: string }

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const blank = (): Form => ({ posted_on: today(), amount: '', merchant: '', app_slug: '', split: false, shares: {}, schedule_c: 'software', paid_from: '', notes: '' })
const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14, background: C.card, color: C.ink, font: 'inherit', width: '100%', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 16 }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontFamily: C.mono, letterSpacing: '.08em', textTransform: 'uppercase', color: C.soft, marginBottom: 6 }

export default function Ledger() {
  const [apps, setApps] = useState<App[]>([])
  const [payFrom, setPayFrom] = useState<PayFrom[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [recent, setRecent] = useState<Row[]>([])
  const [owed, setOwed] = useState(0)
  const [inbox, setInbox] = useState<Receipt[]>([])
  const [f, setF] = useState<Form>(blank)
  const [file, setFile] = useState<File | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null)
  const [found, setFound] = useState<(UploadResult & { name: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([
      fetch('/api/money/ledger').then((x) => (x.ok ? x.json() : null)).catch(() => null),
      fetch('/api/money/receipts?status=unmatched').then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ])
    if (l) {
      setApps(l.apps); setPayFrom(l.paidFrom); setCats(l.categories); setRecent(l.recent); setOwed(l.owedCents)
      setF((p) => (p.paid_from ? p : { ...p, paid_from: l.paidFrom.find((x: PayFrom) => x.ownership === 'personal')?.id ?? l.paidFrom[0]?.id ?? '' }))
    }
    if (r) setInbox(r.receipts)
  }, [])
  useEffect(() => { load() }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const appName = (slug: string | null) => apps.find((a) => a.slug === slug)?.name ?? (slug ? slug : 'Shared')
  const payLabel = (id: string | null) => payFrom.find((p) => p.id === id)?.label ?? id ?? '—'

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const splits = f.split
        ? Object.entries(f.shares).filter(([, v]) => v.trim()).map(([app_slug, v]) => ({ app_slug, share: Number(v) / 100 }))
        : undefined
      const res = await fetch('/api/money/ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, app_slug: f.split ? null : f.app_slug || null, splits, receipt_ids: pendingReceipt ? [pendingReceipt] : [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      if (file) await uploadReceipt(file, d.id)
      const personal = payFrom.find((p) => p.id === f.paid_from)?.ownership === 'personal'
      setMsg({ text: `Saved ${f.merchant} · ${usd(Math.round(Number(f.amount.replace(/[$,]/g, '')) * 100))}${personal ? ' — added to what the LLC owes you.' : '.'}` })
      setF((p) => ({ ...blank(), paid_from: p.paid_from })); setFile(null); setPendingReceipt(null); setFound(null)
      await load()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  async function onReceipt(fl: File | undefined | null) {
    if (!fl) return
    setBusy(true); setMsg(null); setFound(null)
    try {
      const r = await uploadReceipt(fl)
      setFound({ ...r, name: fl.name })
      await load()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  function prefill(receiptId: string, ex: UploadResult['extracted']) {
    setF((p) => ({
      ...p,
      posted_on: ex?.date ?? p.posted_on,
      amount: ex?.total != null ? ex.total.toFixed(2) : p.amount,
      merchant: ex?.vendor ?? p.merchant,
      app_slug: ex?.suggested_app ?? p.app_slug,
      schedule_c: ex?.suggested_category ?? p.schedule_c,
      split: false,
    }))
    setPendingReceipt(receiptId); setFile(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function receiptAction(id: string, action: 'attach' | 'dismiss', transaction_id?: string) {
    setBusy(true)
    const res = await fetch('/api/money/receipts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, transaction_id }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? { text: action === 'attach' ? 'Receipt attached.' : 'Receipt dismissed.' } : { text: d.error ?? 'Failed', bad: true })
    if (found?.receipt.id === id) setFound(null)
    await load(); setBusy(false)
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this manual entry? Any attached receipt is kept and goes back to "to review".')) return
    const res = await fetch(`/api/money/ledger?id=${id}`, { method: 'DELETE' })
    if (!res.ok) setMsg({ text: (await res.json().catch(() => ({}))).error ?? 'Delete failed', bad: true })
    await load()
  }

  const splitTotal = Object.values(f.shares).reduce((a, v) => a + (Number(v) || 0), 0)

  return (
    <AdminShell title="Money · Quick Add" subtitle="Spending Plaid never sees, and the receipts behind it">
      <MoneyTabs />
      <div style={{ maxWidth: 900, padding: '24px 0' }}>
        <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={label}>LLC owes Brian</div>
            <div style={{ fontFamily: C.serif, fontSize: 34, fontWeight: 900 }}>{usd(owed)}</div>
          </div>
          <div style={{ color: C.ink2, fontSize: 13.5, maxWidth: 380 }}>Business costs paid from a personal card, account or cash, not yet reimbursed by the LLC.</div>
        </div>

        {/* Receipt drop zone */}
        <div style={{ ...card, borderStyle: 'dashed', borderColor: drag ? C.mint : C.rule2, background: drag ? C.mintTint : C.card, textAlign: 'center' }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onReceipt(e.dataTransfer.files?.[0]) }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 6px' }}>Upload a receipt</h2>
          <p style={{ color: C.ink2, fontSize: 14, margin: '0 0 12px' }}>Drop a JPG, PNG or PDF here (10 MB max). It&rsquo;s read, then matched to a transaction or turned into a Quick Add. Nothing posts until you confirm.</p>
          <label style={{ ...btn('ghost'), display: 'inline-block' }}>
            {busy ? 'Working…' : 'Choose file'}
            <input type="file" accept="image/jpeg,image/png,application/pdf" hidden disabled={busy} onChange={(e) => { onReceipt(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>

        {found && (
          <div style={{ ...card, borderColor: C.mint }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{found.name}</h3>
            {found.extracted
              ? <p style={{ margin: '0 0 12px', color: C.ink2, fontSize: 14 }}>Read as <b>{found.extracted.vendor ?? 'unknown vendor'}</b>{found.extracted.total != null ? ` · ${usd(Math.round(found.extracted.total * 100))}` : ''}{found.extracted.date ? ` · ${found.extracted.date}` : ''}{found.extracted.suggested_app ? ` · looks like ${appName(found.extracted.suggested_app)}` : ''}</p>
              : <p style={{ margin: '0 0 12px', color: C.amber, fontSize: 14 }}>Saved, but it couldn&rsquo;t be read automatically. Fill in the Quick Add below.</p>}
            {found.matches.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.rule}`, gap: 10 }}>
                <span style={{ fontSize: 14 }}>{m.posted_on} · {m.merchant ?? '—'} · {usd(m.amount_cents)} <span style={{ color: C.soft }}>({m.source}, {m.status})</span></span>
                <button style={btn('mint')} disabled={busy} onClick={() => receiptAction(found.receipt.id, 'attach', m.id)}>Attach here</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button style={btn('solid')} onClick={() => prefill(found.receipt.id, found.extracted)}>{found.matches.length ? 'None of these — add as new expense' : 'Add as new expense'}</button>
              <button style={btn('ghost')} onClick={() => setFound(null)}>Leave it in “to review”</button>
            </div>
          </div>
        )}

        {/* Quick Add */}
        <div ref={formRef} style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 14px' }}>Quick Add expense {pendingReceipt && <span style={{ fontSize: 13, color: C.mint, fontFamily: C.sans }}>· receipt attached</span>}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <div><span style={label}>Date</span><input type="date" style={input} value={f.posted_on} onChange={(e) => set('posted_on', e.target.value)} /></div>
            <div><span style={label}>Amount (USD)</span><input inputMode="decimal" placeholder="0.00" style={input} value={f.amount} onChange={(e) => set('amount', e.target.value)} /></div>
            <div><span style={label}>Paid to</span><input placeholder="ElevenLabs" style={input} value={f.merchant} onChange={(e) => set('merchant', e.target.value)} /></div>
            <div><span style={label}>Category (Schedule C)</span>
              <select style={input} value={f.schedule_c} onChange={(e) => set('schedule_c', e.target.value)}>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><span style={label}>Paid from</span>
              <select style={input} value={f.paid_from} onChange={(e) => set('paid_from', e.target.value)}>
                <optgroup label="Personal (LLC owes you)">{payFrom.filter((p) => p.ownership === 'personal').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
                <optgroup label="Business">{payFrom.filter((p) => p.ownership === 'business').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
              </select></div>
            <div><span style={label}>App</span>
              <select style={input} value={f.split ? '__split' : f.app_slug} onChange={(e) => e.target.value === '__split' ? set('split', true) : setF((p) => ({ ...p, split: false, app_slug: e.target.value }))}>
                <option value="">Shared (allocated across apps)</option>
                {apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                <option value="__split">Split between apps…</option>
              </select></div>
          </div>
          {f.split && (
            <div style={{ marginTop: 12, padding: 12, background: C.card2, borderRadius: 10 }}>
              <span style={label}>Split by percent · {splitTotal}% of 100%</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                {apps.filter((a) => a.slug !== 'studio').map((a) => (
                  <label key={a.slug} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                    <input inputMode="decimal" placeholder="0" style={{ ...input, width: 70 }} value={f.shares[a.slug] ?? ''}
                      onChange={(e) => set('shares', { ...f.shares, [a.slug]: e.target.value })} />% {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}><span style={label}>Notes</span><input style={input} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button style={btn('mint')} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save expense'}</button>
            {!pendingReceipt && (
              <label style={{ ...btn('ghost'), display: 'inline-block' }}>
                {file ? `Receipt: ${file.name}` : 'Attach receipt (optional)'}
                <input type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            {(pendingReceipt || file) && <button style={btn('ghost')} onClick={() => { setFile(null); setPendingReceipt(null) }}>Remove receipt</button>}
          </div>
          {msg && <p style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5, marginTop: 12 }}>{msg.text}</p>}
        </div>

        {/* Receipts to review */}
        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 10px' }}>Receipts to review <span style={{ fontSize: 14, color: C.soft }}>{inbox.length}</span></h2>
          {inbox.length === 0 && <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>Nothing waiting.</p>}
          {inbox.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.rule}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14 }}>
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: C.ink }}>{r.file_name ?? 'receipt'}</a> : r.file_name}
                <span style={{ color: C.soft }}> · {r.extracted ? `${r.extracted.vendor ?? '?'}${r.extracted.total != null ? ` · ${usd(Math.round(r.extracted.total * 100))}` : ''}${r.extracted.date ? ` · ${r.extracted.date}` : ''}` : 'not read'}</span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button style={btn('ghost')} onClick={() => prefill(r.id, r.extracted)}>Add as expense</button>
                <button style={btn('ghost')} disabled={busy} onClick={() => receiptAction(r.id, 'dismiss')}>Dismiss</button>
              </span>
            </div>
          ))}
        </div>

        {/* Recent manual + recurring entries */}
        <div style={card}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 10px' }}>Recent manual entries</h2>
          {recent.length === 0 && <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>None yet.</p>}
          {recent.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${C.rule}`, fontSize: 14 }}>
              <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.ink2 }}>{r.posted_on}</span>
              <span>
                <b>{r.merchant}</b>{r.source === 'recurring' && <span style={{ color: C.soft }}> · auto</span>}{r.status === 'unreviewed' && <span style={{ color: C.amber }}> · held (possible duplicate)</span>}
                <span style={{ display: 'block', color: C.soft, fontSize: 12.5 }}>
                  {r.splits.length ? r.splits.map((s) => `${appName(s.app_slug)} ${Math.round(s.share * 100)}%`).join(' / ') : r.split_apps ? r.split_apps.map(appName).join(' / ') : appName(r.app_slug)}
                  {' · '}{payLabel(r.paid_from)}{r.receipts.length ? ' · 🧾' : ''}
                </span>
              </span>
              <span style={{ fontWeight: 650 }}>{usd(r.amount_cents)}</span>
              {r.source === 'manual' ? <button style={{ ...btn('ghost'), padding: '6px 10px' }} onClick={() => remove(r.id)}>Delete</button> : <span />}
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  )
}
