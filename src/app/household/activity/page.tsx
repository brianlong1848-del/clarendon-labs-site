'use client'
import { useMemo, useState } from 'react'
import { AdminShell, C, Label } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, th, td, usd, price, qty, day, useHousehold, Empty, input } from '@/components/household/shared'

// Household → Activity: investment transactions and household cash flow, with
// filters by account and type, and the last 90 days rolled up by category.

type Inv = { id: string; account_id: string; posted_on: string; type: string; subtype: string | null; quantity: number | null; price: number | null; amount_cents: number; fees_cents: number | null; name: string | null; security: { ticker: string | null; name: string | null } | null }
type Cash = { id: string; account_id: string | null; posted_on: string; amount_cents: number; merchant: string | null; raw_description: string | null; plaid_category: string | null }
type Acct = { id: string; institution: string | null; name: string | null; mask: string | null; account_type: string | null }
type Data = { since: string; days: number; investments: Inv[]; cash: Cash[]; accounts: Acct[]; cashflow: { income_cents: number; outflow_cents: number; categories: { category: string; out_cents: number; in_cents: number; n: number }[]; recurring: { merchant: string; charges: number; last_amount_cents: number; last_charge: string }[] } | null }

const cat = (c: string | null) => (c ?? 'Uncategorised').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase())

export default function HouseholdActivity() {
  const [account, setAccount] = useState('')
  const [type, setType] = useState('')
  const [days, setDays] = useState(90)
  const [view, setView] = useState<'investments' | 'cash'>('investments')
  const qs = new URLSearchParams({ days: String(days), ...(account ? { account } : {}), ...(type ? { type } : {}) }).toString()
  const { data: d, updating, error } = useHousehold<Data>(`/api/household/activity?${qs}`)
  const acctName = (id: string | null) => { const a = d?.accounts.find((x) => x.id === id); return a ? `${a.institution ?? ''} ${a.name ?? ''}${a.mask ? ` ···${a.mask}` : ''}`.trim() : '' }
  const types = useMemo(() => Array.from(new Set((d?.investments ?? []).map((i) => i.type))).sort(), [d])
  const select: React.CSSProperties = { ...input, width: 'auto', padding: '8px 12px' }

  return (
    <AdminShell title="Household · Activity" subtitle="Trades, dividends and fees in the brokerages; spending and income in the banks and cards"
      actions={updating ? <Pill>Updating…</Pill> : undefined}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.rule2}`, borderRadius: 10, overflow: 'hidden' }}>
          {(['investments', 'cash'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ border: 0, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: view === v ? C.ink : C.card, color: view === v ? '#fff' : C.ink2 }}>{v === 'investments' ? 'Investments' : 'Cash flow'}</button>
          ))}
        </div>
        <select style={select} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {(d?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{acctName(a.id)}</option>)}
        </select>
        {view === 'investments' && (
          <select style={select} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select style={select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 90, 180, 365, 730].map((n) => <option key={n} value={n}>Last {n} days</option>)}
        </select>
      </div>

      {view === 'investments' && d && (
        d.investments.length === 0 ? <Empty title="No investment transactions in this window">Trades, dividends and fees arrive with each brokerage sync (24 months of history on the first one).</Empty> : (
          <div style={{ ...card, padding: '6px 8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Date</th><th style={{ ...th, textAlign: 'left' }}>What</th><th style={{ ...th, textAlign: 'left' }}>Account</th><th style={th}>Qty</th><th style={th}>Price</th><th style={th}>Fees</th><th style={th}>Amount</th></tr></thead>
              <tbody>
                {d.investments.map((t) => (
                  <tr key={t.id}>
                    <td style={{ ...td, textAlign: 'left', color: C.ink2 }}>{day(t.posted_on)}</td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <span style={{ fontWeight: 650, textTransform: 'capitalize' }}>{t.subtype ?? t.type}</span>{t.security?.ticker && <span style={{ fontFamily: C.mono, fontSize: 12.5, marginLeft: 8, color: C.ink2 }}>{t.security.ticker}</span>}
                      <div style={{ fontSize: 12, color: C.soft, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.security?.name ?? t.name}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'left', color: C.ink2, fontSize: 13 }}>{acctName(t.account_id)}</td>
                    <td style={td}>{qty(t.quantity)}</td>
                    <td style={td}>{price(t.price)}</td>
                    <td style={{ ...td, color: C.soft }}>{t.fees_cents ? usd(t.fees_cents, { cents: true }) : '—'}</td>
                    <td style={{ ...td, fontWeight: 650, color: t.amount_cents > 0 ? C.ink : C.mint }}>{usd(-t.amount_cents, { sign: true, cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'cash' && d && (<>
        {d.cashflow && d.cashflow.categories.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <div style={card}>
              <Label>Spending by category · {d.days} days</Label>
              <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', margin: '8px 0 10px' }}>
                <span>Out <b style={{ fontSize: 20 }}>{usd(d.cashflow.outflow_cents)}</b></span>
                <span>In <b style={{ fontSize: 20, color: C.mint }}>{usd(d.cashflow.income_cents)}</b></span>
              </div>
              {d.cashflow.categories.filter((c) => c.out_cents > 0).slice(0, 10).map((c) => {
                const w = d.cashflow!.outflow_cents ? (c.out_cents / d.cashflow!.outflow_cents) * 100 : 0
                return (
                  <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
                    <span>{cat(c.category)}<div style={{ height: 4, borderRadius: 99, background: C.card2, marginTop: 4 }}><div style={{ width: `${w}%`, height: '100%', background: C.indigo, borderRadius: 99 }} /></div></span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{usd(c.out_cents)}</span>
                  </div>
                )
              })}
            </div>
            <div style={card}>
              <Label>Likely recurring bills</Label>
              {d.cashflow.recurring.length === 0 && <div style={{ fontSize: 13.5, color: C.soft, marginTop: 6 }}>Nothing monthly spotted yet (needs three charges from the same merchant).</div>}
              {d.cashflow.recurring.map((r) => (
                <div key={r.merchant} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                  <span style={{ textTransform: 'capitalize' }}>{r.merchant}<div style={{ fontSize: 12, color: C.soft }}>{r.charges} charges · last {day(r.last_charge)}</div></span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{usd(r.last_amount_cents, { cents: true })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {d.cash.length === 0 ? <Empty title="No bank or card activity in this window">Connect a household bank or card in Settings; transactions here never reach the Clarendon books.</Empty> : (
          <div style={{ ...card, padding: '6px 8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Date</th><th style={{ ...th, textAlign: 'left' }}>Merchant</th><th style={{ ...th, textAlign: 'left' }}>Category</th><th style={{ ...th, textAlign: 'left' }}>Account</th><th style={th}>Amount</th></tr></thead>
              <tbody>
                {d.cash.map((t) => (
                  <tr key={t.id}>
                    <td style={{ ...td, textAlign: 'left', color: C.ink2 }}>{day(t.posted_on)}</td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{t.merchant ?? t.raw_description}</td>
                    <td style={{ ...td, textAlign: 'left', color: C.ink2, fontSize: 13 }}>{cat(t.plaid_category)}</td>
                    <td style={{ ...td, textAlign: 'left', color: C.ink2, fontSize: 13 }}>{acctName(t.account_id)}</td>
                    <td style={{ ...td, fontWeight: 650, color: t.amount_cents < 0 ? C.mint : C.ink }}>{usd(-t.amount_cents, { sign: true, cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>)}
    </AdminShell>
  )
}
