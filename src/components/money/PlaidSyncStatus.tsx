'use client'
import { useCallback, useEffect, useState } from 'react'
import { C, btn } from '@/components/AdminNav'

// Bank sync status for the Money tab: per connected bank, the last clean sync,
// the item's status and any error, plus a "Sync now" button. Same data as the
// Studio app's Money screen (GET/POST /api/money/plaid/sync).

export type PlaidItemStatus = {
  id: string; institution: string | null; status: string; updated_at: string
  last_synced_at: string | null; last_error: string | null; transactions: number
}
type SyncResult = { itemId: string; added?: number; error?: string; pending?: boolean; more?: boolean }

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'never')

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
    else setMsg({ text: d.error ?? 'Could not load sync status', bad: true })
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
  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          {!items && <span style={{ color: C.soft, fontSize: 13.5 }}>Checking bank sync…</span>}
          {items?.map((it) => {
            const healthy = it.status === 'ok' && !it.last_error
            return (
              <div key={it.id} style={{ fontSize: 13.5, color: C.ink2 }}>
                <b style={{ color: C.ink }}>{it.institution ?? 'Bank'}</b>
                {' · '}last synced {when(it.last_synced_at)}
                {' · '}<span style={{ color: healthy ? C.mint : it.status === 'needs_reauth' ? C.red : C.amber }}>
                  {it.status === 'needs_reauth' ? 'needs re-login' : it.status}
                </span>
                {' · '}{it.transactions.toLocaleString()} imported
                {it.last_error && <div style={{ color: C.amber, fontSize: 12.5, marginTop: 2, overflowWrap: 'anywhere' }}>{it.last_error}</div>}
              </div>
            )
          })}
        </div>
        <button style={{ ...btn('ghost'), padding: '8px 14px' }} disabled={busy} onClick={syncNow}>{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>
      {msg && <p style={{ color: msg.bad ? C.amber : C.mint, fontSize: 13, margin: '8px 0 0', overflowWrap: 'anywhere' }}>{msg.text}</p>}
    </div>
  )
}
