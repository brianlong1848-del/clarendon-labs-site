'use client'
import { useCallback, useEffect, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn, labelStyle } from '@/components/AdminNav'

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
const lab: React.CSSProperties = { ...labelStyle, display: 'block', marginBottom: 4 }
const chip = (color: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 600, color, border: `1px solid ${C.rule2}`, borderRadius: 99, padding: '1px 8px' })

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
      <style>{`@media (max-width: 700px){ .tx-row{ grid-template-columns: minmax(0,1fr) auto !important } .tx-row > :first-child{ grid-column: 1 / -1 } .tx-row > :last-child{ grid-column: 1 / -1; justify-self: start } }`}</style>
      <div style={{ maxWidth: 1180, padding: '24px 0' }}>
        <div style={card}>
          {/* One row on desktop: search grows, the rest stay compact; wraps on a phone. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="Search" style={{ ...input, flex: '1 1 220px', minWidth: 0 }} placeholder="Search merchant or note" value={filt.q} onChange={(e) => setF('q', e.target.value)} />
            <input aria-label="From" title="From" type="date" style={input} value={filt.from} onChange={(e) => setF('from', e.target.value)} />
            <input aria-label="To" title="To" type="date" style={input} value={filt.to} onChange={(e) => setF('to', e.target.value)} />
            <select aria-label="Status" style={input} value={filt.status} onChange={(e) => setF('status', e.target.value)}>
              <option value="">Any status</option><option value="business">Business</option><option value="personal">Personal</option><option value="unreviewed">Unreviewed</option><option value="ignored">Ignored</option>
            </select>
            <select aria-label="Source" style={input} value={filt.source} onChange={(e) => setF('source', e.target.value)}>
              <option value="">Any source</option><option value="plaid">Bank</option><option value="manual">Manual</option><option value="recurring">Recurring</option>
            </select>
            <select aria-label="App" style={input} value={filt.app} onChange={(e) => setF('app', e.target.value)}>
              <option value="">All apps</option><option value="__none">Shared / none</option>{apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
            <select aria-label="Category" style={{ ...input, maxWidth: 200 }} value={filt.category} onChange={(e) => setF('category', e.target.value)}>
              <option value="">All categories</option>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
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
              <div className="tx-row" style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 100px auto', gap: 10, alignItems: 'start' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: C.ink2, paddingTop: 1 }}>{r.posted_on}</span>
                <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <b>{r.merchant ?? '—'}</b>
                    {r.status === 'unreviewed' && <span style={chip(C.amber)}>Unreviewed</span>}
                    {r.status === 'personal' && <span style={chip(C.ink2)}>Personal</span>}
                    {r.status === 'ignored' && <span style={chip(C.soft)}>Ignored</span>}
                    {r.possible_duplicate_of && <span style={chip(C.amber)}>Possible duplicate</span>}
                    {r.receipts.length > 0 && <span title="Receipt attached" aria-label="Receipt attached">🧾</span>}
                  </span>
                  <span style={{ color: C.soft, fontSize: 12.5 }}>{appName(r)} · {catName(r.schedule_c)}</span>
                  {r.notes && <span title={r.notes} style={{ color: C.ink2, fontSize: 12.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.notes}</span>}
                </span>
                <span title={r.source === 'plaid' ? 'From the bank' : r.source === 'recurring' ? 'Recurring' : 'Manual entry'}
                  style={{ fontWeight: 650, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.amount_cents < 0 ? C.mint : C.ink }}>{usd(r.amount_cents)}</span>
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
