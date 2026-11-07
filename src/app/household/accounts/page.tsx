'use client'
import Link from 'next/link'
import { useState } from 'react'
import { AdminShell, C, Label, btn } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, usd, ago, useHousehold, post, Empty } from '@/components/household/shared'
import type { Picture } from '@/lib/household/portfolio'

// Household → Accounts: grouped by institution — balance, type, last synced,
// and a re-login banner when Plaid says ITEM_LOGIN_REQUIRED. Sync now runs
// every household item (banks via transactions, brokerages via holdings).

type Data = Picture
const TYPE_LABEL: Record<string, string> = { depository: 'Bank', credit: 'Card', investment: 'Investment', loan: 'Loan', brokerage: 'Brokerage' }
const sub = (a: Picture['accounts'][number]) => [TYPE_LABEL[a.account_type ?? ''] ?? a.account_type ?? 'Account', a.account_subtype?.replace(/_/g, ' ')].filter(Boolean).join(' · ')

export default function HouseholdAccounts() {
  const { data: d, updating, error, reload } = useHousehold<Data>('/api/household/overview')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  async function syncNow() {
    setBusy(true); setMsg(null)
    try {
      const r = await post('/api/household/sync')
      const bad = (r.results ?? []).filter((x: { transactions?: { error?: string }; investments?: { error?: string } }) => x.transactions?.error || (x.investments?.error && x.investments.error !== 'pending'))
      setMsg(bad.length ? { text: bad.map((x: { institution: string | null; transactions?: { error?: string }; investments?: { error?: string } }) => `${x.institution ?? 'Account'}: ${x.transactions?.error ?? x.investments?.error}`).join(' · '), bad: true } : { text: 'Synced.' })
      await reload()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  const groups = new Map<string, Picture['accounts']>()
  for (const a of d?.accounts ?? []) { const k = a.institution ?? 'Other'; groups.set(k, [...(groups.get(k) ?? []), a]) }
  const needsLogin = (d?.accounts ?? []).filter((a) => a.item_status === 'needs_reauth')

  return (
    <AdminShell title="Household · Accounts" subtitle="Every connected bank, card, brokerage and retirement account"
      actions={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{updating && <Pill>Updating…</Pill>}<button style={btn('ghost')} disabled={busy} onClick={syncNow}>{busy ? 'Syncing…' : 'Sync now'}</button></span>}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {msg && <p style={{ color: msg.bad ? C.amber : C.mint, margin: 0, fontSize: 13.5 }}>{msg.text}</p>}

      {needsLogin.length > 0 && (
        <div style={{ ...card, borderColor: '#F3C9A8', background: '#FFF7F0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 14 }}>{Array.from(new Set(needsLogin.map((a) => a.institution ?? 'A bank'))).join(', ')} needs you to log in again before Plaid can keep syncing.</span>
          <Link href="/household/settings" style={{ ...btn('solid'), textDecoration: 'none' }}>Reconnect in Settings</Link>
        </div>
      )}

      {d && d.accounts.length === 0 && (
        <Empty title="No household accounts yet">
          <Link href="/household/settings" style={{ ...btn('mint'), display: 'inline-block', textDecoration: 'none', marginTop: 6 }}>Connect an account</Link>
        </Empty>
      )}

      {Array.from(groups).map(([institution, accounts]) => {
        const total = accounts.reduce((n, a) => n + (a.is_liability ? -Math.abs(a.value_cents) : a.value_cents), 0)
        const synced = accounts.map((a) => a.last_synced_at).filter(Boolean).sort().pop() ?? null
        const err = accounts.find((a) => a.last_error)?.last_error ?? null
        return (
          <section key={institution} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.card2, display: 'grid', placeItems: 'center', fontWeight: 800, color: C.ink2 }}>{institution.slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{institution}</div>
                <div style={{ fontSize: 12.5, color: C.soft }}>{accounts.length} account{accounts.length === 1 ? '' : 's'} · synced {ago(synced)}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: total < 0 ? C.loss : C.ink }}>{usd(total)}</div>
            </div>
            {err && <div style={{ padding: '0 20px 12px', fontSize: 12.5, color: C.amber }}>{err}</div>}
            {accounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: `1px solid ${C.rule}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{a.name ?? 'Account'}{a.mask && <span style={{ color: C.soft, fontWeight: 500 }}> ···{a.mask}</span>}</div>
                  <div style={{ fontSize: 12.5, color: C.soft, display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    {sub(a)}
                    {a.holdings_count > 0 && <Pill>{a.holdings_count} position{a.holdings_count === 1 ? '' : 's'}</Pill>}
                    {a.item_status === 'needs_reauth' && <Pill tone="loss">Needs re-login</Pill>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 650, fontSize: 15.5, fontVariantNumeric: 'tabular-nums', color: a.is_liability ? C.loss : C.ink }}>{a.is_liability ? '−' : ''}{usd(Math.abs(a.value_cents))}</div>
                  {a.balance_available_cents != null && a.balance_current_cents != null && a.balance_available_cents !== a.balance_current_cents && !a.is_liability && a.holdings_count === 0 && (
                    <div style={{ fontSize: 12, color: C.soft }}>{usd(a.balance_available_cents)} available</div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )
      })}
      {d && d.accounts.length > 0 && <div><Label>Liabilities are shown negative and subtracted from net worth. Brokerage values use live prices when FMP has them, otherwise the custodian&apos;s last value.</Label></div>}
    </AdminShell>
  )
}
