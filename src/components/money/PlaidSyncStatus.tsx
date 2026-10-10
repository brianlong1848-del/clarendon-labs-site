'use client'
import { useCallback, useEffect, useState } from 'react'
import { C, btn } from '@/components/AdminNav'

// Cash card for the Money tab: business cash on hand (sum of business accounts'
// available balance), one row per connected account, and sync health with a
// "Sync now" button. Same data as the Studio app's Money screen
// (GET/POST /api/money/plaid/sync).

type Account = {
  id: string; name: string | null; mask: string | null; ownership: string
  balance_current_cents: number | null; balance_available_cents: number | null
  balance_currency: string | null; balance_updated_at: string | null
}
export type PlaidItemStatus = {
  id: string; institution: string | null; status: string; updated_at: string
  last_synced_at: string | null; last_error: string | null; transactions: number
  accounts?: Account[]
}
type SyncResult = { itemId: string; added?: number; error?: string; pending?: boolean; more?: boolean }

const usd = (c: number, cur: string | null = 'USD') =>
  (c / 100).toLocaleString('en-US', { style: 'currency', currency: cur ?? 'USD' })
const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const shown = (a: Account) => a.balance_available_cents ?? a.balance_current_cents

export function describeSync(results: SyncResult[]) {
  const errors = results.filter((r) => r.error)
  if (errors.length) return { text: errors.map((r) => r.error).join(' · '), bad: true }
  const added = results.reduce((n, r) => n + (r.added ?? 0), 0)
  if (results.some((r) => r.pending)) return { text: `Plaid is still pulling history from the bank — try again in a few minutes.${added ? ` (${added} imported so far)` : ''}`, bad: true }
  if (results.some((r) => r.more)) return { text: `Imported ${added} so far — more to go. Press Sync now again.` }
  return { text: results.length ? `Synced. ${added} new transaction${added === 1 ? '' : 's'}.` : 'No banks connected.' }
}

export default function PlaidSyncStatus({ onSynced, refreshKey }: { onSynced?: () => void; refreshKey?: number }) {
  const [items, setItems] = useState<PlaidItemStatus[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/money/plaid/sync').catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) setItems(d.items ?? [])
    else setMsg({ text: d.error ?? 'Could not load bank status', bad: true })
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function syncNow() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/money/plaid/sync', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      if (d.items) setItems(d.items)
      setMsg(describeSync(d.results ?? []))
      onSynced?.()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  if (items && items.length === 0) return null

  const rows = (items ?? []).flatMap((it) => (it.accounts ?? []).map((a) => ({ it, a })))
  const business = rows.filter(({ a }) => a.ownership === 'business' && shown(a) != null)
  const cash = business.reduce((n, { a }) => n + shown(a)!, 0)
  const pendingDiff = business.reduce((n, { a }) =>
    n + (a.balance_current_cents != null && a.balance_available_cents != null ? a.balance_current_cents - a.balance_available_cents : 0), 0)
  const newest = rows.map(({ a }) => a.balance_updated_at).filter(Boolean).sort().pop() ?? null
  const problems = (items ?? []).filter((it) => it.last_error)

  const label: React.CSSProperties = { fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.soft }
  const dot = (color: string): React.CSSProperties => ({ width: 7, height: 7, borderRadius: 99, display: 'inline-block', flex: 'none', background: color })

  return (
    <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Headline: business cash on hand */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', padding: '18px 20px 16px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={label}>Business cash</div>
          {!items || business.length
            ? <div style={{ fontFamily: C.serif, fontSize: 38, fontWeight: 800, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: !items ? C.faint : cash < 0 ? C.amber : C.ink }}>
                {items ? usd(cash) : '—'}
              </div>
            : <div style={{ fontSize: 14, color: C.soft, marginTop: 8 }}>Fetching the balance from the bank…</div>}
          {business.length > 0 && (
            <div style={{ fontSize: 13, color: C.ink2, marginTop: 6 }}>
              Available now{pendingDiff > 0 ? ` · ${usd(pendingDiff)} pending` : ''}{newest ? ` · updated ${ago(newest)}` : ''}
            </div>
          )}
        </div>
        <button style={{ ...btn('ghost'), padding: '8px 14px' }} disabled={busy} onClick={syncNow}>{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>

      {/* One row per account */}
      {rows.map(({ it, a }) => {
        const ok = it.status === 'ok' && !it.last_error
        const bal = shown(a)
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: `1px solid ${C.rule}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.card2, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, color: C.ink2, flex: 'none' }}>
              {(it.institution ?? 'B').slice(0, 1)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.institution ?? 'Bank'}
                {a.name ? <span style={{ color: C.ink2, fontWeight: 500 }}> · {a.name}</span> : null}
                {a.mask ? <span style={{ color: C.soft, fontWeight: 500 }}> ···{a.mask}</span> : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.soft, marginTop: 3 }}>
                <span style={dot(ok ? C.mint : it.status === 'needs_reauth' ? C.red : C.amber)} />
                {it.status === 'needs_reauth' ? 'Needs re-login' : ok ? `Synced ${ago(it.last_synced_at)}` : 'Sync problem'}
                {' · '}{it.transactions.toLocaleString()} transactions{a.ownership === 'personal' ? ' · personal' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ fontWeight: 700, fontSize: 15.5, fontVariantNumeric: 'tabular-nums' }}>{bal != null ? usd(bal, a.balance_currency) : '—'}</div>
              {a.balance_current_cents != null && a.balance_available_cents != null && a.balance_current_cents !== a.balance_available_cents && (
                <div style={{ fontSize: 12, color: C.soft, fontVariantNumeric: 'tabular-nums' }}>{usd(a.balance_current_cents, a.balance_currency)} current</div>
              )}
            </div>
          </div>
        )
      })}

      {/* Problems and Sync now results */}
      {(problems.length > 0 || msg) && (
        <div style={{ padding: '10px 20px 14px', borderTop: `1px solid ${C.rule}`, display: 'grid', gap: 4 }}>
          {problems.map((it) => (
            <div key={it.id} style={{ fontSize: 12.5, color: C.amber, overflowWrap: 'anywhere' }}>{it.institution ?? 'Bank'}: {it.last_error}</div>
          ))}
          {msg && <div style={{ fontSize: 12.5, color: msg.bad ? C.amber : C.mint, overflowWrap: 'anywhere' }}>{msg.text}</div>}
        </div>
      )}
    </section>
  )
}
