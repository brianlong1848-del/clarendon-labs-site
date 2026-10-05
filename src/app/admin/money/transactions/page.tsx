'use client'
import { useCallback, useEffect, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn } from '@/components/AdminNav'

// Money → Transactions: every transaction (bank, manual, recurring) in one list.
// Search, filter, edit status / app / category / notes inline, export CSV.
// Bank imports keep their bank date, amount and merchant; manual entries are fully editable.

type App = { slug: string; name: string }
type Opt = { value: string; label: string }
type Row = {
  id: string; posted_on: string; amount_cents: number; merchant: string | null; app_slug: string | null; split_apps: string[] | null
  schedule_c: string | null; paid_from: string | null; notes: string | null; source: string; status: string; possible_duplicate_of: string | null
  splits: { app_slug: string; share: number }[]; receipts: { id: string; file_name: string | null }[]
}
type Draft = { merchant: string; posted_on: string; amount: string; status: string; app_slug: string; schedule_c: string; notes: string }

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 13.5, background: C.card, color: C.ink, font: 'inherit', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 16 }
const lab: React.CSSProperties = { display: 'block', fontSize: 11.5, fontFamily: C.mono, letterSpacing: '.08em', textTransform: 'uppercase', color: C.soft, marginBottom: 4 }

export default function Transactions() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  const [apps, setApps] = useState<App[]>([])
  const [cats, setCats] = useState<Opt[]>([])
  const [filt, setFilt] = useState({ q: '', status: '', source: '', app: '', category: '', from: '', to: '' })
  const [offset, setOffset] = useState(0)
  const [edit, setEdit] = useState<string | null>(null)
  const [d, setD] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    Object.entries({ ...filt, ...extra }).forEach(([k, v]) => v && p.set(k, v))
    return p.toString()
  }, [filt])

  const load = useCallback(async () => {
    const res = await fetch(`/api/money/transactions?${qs({ offset: String(offset) })}`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: j.error ?? `HTTP ${res.status}`, bad: true }); return }
    setRows(j.rows); setTotal(j.total); setPageSize(j.pageSize); setApps(j.apps); setCats(j.categories)
  }, [qs, offset])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const setF = (k: keyof typeof filt, v: string) => { setOffset(0); setFilt((p) => ({ ...p, [k]: v })) }
  const appName = (r: Row) => r.splits.length ? r.splits.map((s) => `${apps.find((a) => a.slug === s.app_slug)?.name ?? s.app_slug} ${Math.round(s.share * 100)}%`).join(' / ')
    : r.split_apps?.length ? r.split_apps.join(' / ') : r.app_slug ? (apps.find((a) => a.slug === r.app_slug)?.name ?? r.app_slug) : 'Shared'
  const catName = (v: string | null) => cats.find((c) => c.value === v)?.label ?? '—'

  function start(r: Row) {
    setEdit(r.id); setMsg(null)
    setD({ merchant: r.merchant ?? '', posted_on: r.posted_on, amount: (r.amount_cents / 100).toFixed(2), status: r.status, app_slug: r.app_slug ?? '', schedule_c: r.schedule_c ?? '', notes: r.notes ?? '' })
  }

  async function save(r: Row) {
    if (!d) return
    setBusy(true); setMsg(null)
    const body: Record<string, unknown> = { id: r.id, status: d.status, schedule_c: d.schedule_c, notes: d.notes }
    // Only send app_slug when there's no split, so a split isn't wiped by a plain save.
    if (!r.splits.length && !r.split_apps?.length) body.app_slug = d.app_slug
    else if (d.app_slug !== (r.app_slug ?? '')) body.app_slug = d.app_slug
    if (r.source !== 'plaid') Object.assign(body, { merchant: d.merchant, posted_on: d.posted_on, amount: d.amount })
    const res = await fetch('/api/money/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ text: j.error ?? 'Save failed', bad: true }); return }
    setEdit(null); setMsg({ text: 'Saved.' }); load()
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.floor(offset / pageSize) + 1

  return (
    <AdminShell title="Money · Transactions" subtitle="Every transaction in one list: search, filter, edit, export">
      <MoneyTabs />
      <div style={{ maxWidth: 1100, padding: '24px 0' }}>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: 'span 2' }}><span style={lab}>Search</span><input style={{ ...input, width: '100%' }} placeholder="Merchant or note" value={filt.q} onChange={(e) => setF('q', e.target.value)} /></div>
            <div><span style={lab}>From</span><input type="date" style={{ ...input, width: '100%' }} value={filt.from} onChange={(e) => setF('from', e.target.value)} /></div>
            <div><span style={lab}>To</span><input type="date" style={{ ...input, width: '100%' }} value={filt.to} onChange={(e) => setF('to', e.target.value)} /></div>
            <div><span style={lab}>Status</span>
              <select style={{ ...input, width: '100%' }} value={filt.status} onChange={(e) => setF('status', e.target.value)}>
                <option value="">All</option><option value="business">Business</option><option value="personal">Personal</option><option value="unreviewed">Unreviewed</option><option value="ignored">Ignored</option>
              </select></div>
            <div><span style={lab}>Source</span>
              <select style={{ ...input, width: '100%' }} value={filt.source} onChange={(e) => setF('source', e.target.value)}>
                <option value="">All</option><option value="plaid">Bank</option><option value="manual">Manual</option><option value="recurring">Recurring</option>
              </select></div>
            <div><span style={lab}>App</span>
              <select style={{ ...input, width: '100%' }} value={filt.app} onChange={(e) => setF('app', e.target.value)}>
                <option value="">All</option><option value="__none">Shared / none</option>{apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select></div>
            <div><span style={lab}>Category</span>
              <select style={{ ...input, width: '100%' }} value={filt.category} onChange={(e) => setF('category', e.target.value)}>
                <option value="">All</option>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: C.ink2, fontSize: 13.5 }}>{total.toLocaleString()} transaction{total === 1 ? '' : 's'}</span>
            <a href={`/api/money/transactions?${qs({ format: 'csv' })}`} style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-block' }}>Export CSV</a>
            {msg && <span style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5 }}>{msg.text}</span>}
          </div>
        </div>

        <div style={card}>
          {rows.length === 0 && <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>No transactions match.</p>}
          {rows.map((r, i) => (
            <div key={r.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.rule}` : 'none', fontSize: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 100px auto', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.ink2 }}>{r.posted_on}</span>
                <span>
                  <b>{r.merchant ?? '—'}</b>
                  <span style={{ color: C.soft }}> · {r.source === 'plaid' ? 'bank' : r.source}{r.status === 'unreviewed' ? ' · unreviewed' : ''}{r.possible_duplicate_of ? ' · possible duplicate' : ''}{r.receipts.length ? ' · 🧾' : ''}</span>
                  <span style={{ display: 'block', color: C.soft, fontSize: 12.5 }}>{r.status} · {appName(r)} · {catName(r.schedule_c)}{r.notes ? ` · ${r.notes}` : ''}</span>
                </span>
                <span style={{ fontWeight: 650, textAlign: 'right', color: r.amount_cents < 0 ? C.mint : C.ink }}>{usd(r.amount_cents)}</span>
                <button style={{ ...btn('ghost'), padding: '6px 10px' }} onClick={() => (edit === r.id ? setEdit(null) : start(r))}>{edit === r.id ? 'Close' : 'Edit'}</button>
              </div>
              {edit === r.id && d && (
                <div style={{ marginTop: 10, padding: 12, background: C.card2, borderRadius: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                    {r.source !== 'plaid' && <>
                      <div><span style={lab}>Paid to</span><input style={{ ...input, width: '100%' }} value={d.merchant} onChange={(e) => setD({ ...d, merchant: e.target.value })} /></div>
                      <div><span style={lab}>Date</span><input type="date" style={{ ...input, width: '100%' }} value={d.posted_on} onChange={(e) => setD({ ...d, posted_on: e.target.value })} /></div>
                      <div><span style={lab}>Amount</span><input style={{ ...input, width: '100%' }} value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
                    </>}
                    <div><span style={lab}>Status</span>
                      <select style={{ ...input, width: '100%' }} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
                        <option value="business">Business</option><option value="personal">Personal</option><option value="unreviewed">Unreviewed</option><option value="ignored">Ignored</option>
                      </select></div>
                    <div><span style={lab}>App{r.splits.length ? ' (split kept unless changed)' : ''}</span>
                      <select style={{ ...input, width: '100%' }} value={d.app_slug} onChange={(e) => setD({ ...d, app_slug: e.target.value })}>
                        <option value="">Shared</option>{apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                      </select></div>
                    <div><span style={lab}>Category</span>
                      <select style={{ ...input, width: '100%' }} value={d.schedule_c} onChange={(e) => setD({ ...d, schedule_c: e.target.value })}>
                        <option value="">None</option>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select></div>
                  </div>
                  <div style={{ marginTop: 10 }}><span style={lab}>Notes</span><input style={{ ...input, width: '100%' }} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button style={btn('mint')} disabled={busy} onClick={() => save(r)}>{busy ? 'Saving…' : 'Save'}</button>
                    <button style={btn('ghost')} onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                  {r.source === 'plaid' && <p style={{ color: C.soft, fontSize: 12.5, margin: '10px 0 0' }}>Bank imports keep their bank date, amount and merchant. To split across apps or delete a manual entry, use Quick Add &amp; receipts.</p>}
                </div>
              )}
            </div>
          ))}
          {total > pageSize && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
              <button style={btn('ghost')} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
              <span style={{ fontSize: 13.5, color: C.ink2 }}>Page {page} of {pages}</span>
              <button style={btn('ghost')} disabled={page >= pages} onClick={() => setOffset(offset + pageSize)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
