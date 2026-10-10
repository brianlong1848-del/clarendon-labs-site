'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminShell, C } from '@/components/AdminNav'
import MoneyTabs from '@/components/money/MoneyTabs'
import PlaidSyncStatus from '@/components/money/PlaidSyncStatus'

type Row = { month: string; app_slug: string; revenue_cents: number; direct_cost_cents: number; allocated_cost_cents: number; ad_spend_cents: number; profit_cents: number; cumulative_profit_cents: number }
type App = { slug: string; name: string }
type Data = { pnl: Row[]; apps: App[]; roas30: Record<string, { spend: number; proceeds: number; installs: number }>; owedCents: number; unreviewed: number }

const usd = (c: number) => (c < 0 ? '−' : '') + Math.abs(c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const iconFor = (slug: string) => (slug === 'studio' ? '/brand/clarendon-apple-touch-icon.png' : `/icons/${slug}.png`)
const monthLabel = (m: string) => new Date(m + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function MoneyOverview() {
  const [d, setD] = useState<Data | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/money/overview').then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return }
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'Could not load'); return }
      setD(j)
      const months = Array.from(new Set((j.pnl as Row[]).map((x) => x.month))).sort().reverse()
      setMonth(months[0] ?? null)
    }).catch(() => setError('Could not load'))
  }, [])

  const months = useMemo(() => (d ? Array.from(new Set(d.pnl.map((x) => x.month))).sort().reverse() : []), [d])
  const rows = useMemo(() => (d && month ? d.pnl.filter((x) => x.month === month) : []), [d, month])
  const name = (slug: string) => d?.apps.find((a) => a.slug === slug)?.name.replace(/\s*\(.*\)/, '') ?? slug
  const tot = rows.reduce((t, r) => ({
    revenue: t.revenue + r.revenue_cents, cost: t.cost + r.direct_cost_cents + r.allocated_cost_cents,
    ads: t.ads + r.ad_spend_cents, profit: t.profit + r.profit_cents,
  }), { revenue: 0, cost: 0, ads: 0, profit: 0 })

  const th: React.CSSProperties = { textAlign: 'right', fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.soft, fontWeight: 500, padding: '8px 10px' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '12px 10px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.rule}`, whiteSpace: 'nowrap' }
  const pos = (n: number) => (n > 0 ? C.mint : n < 0 ? C.amber : C.ink2)

  return (
    <AdminShell title="Money & ROI" subtitle="What each app earns, what it costs, and what's left"
      actions={months.length > 0 ? (
        <select value={month ?? ''} onChange={(e) => setMonth(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14, background: C.card }}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      ) : undefined}>
      <MoneyTabs />
      <PlaidSyncStatus />
      {error && <p style={{ color: C.amber }}>{error}</p>}
      {!d && !error && <p style={{ color: C.soft }}>Loading…</p>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {[
              ['Revenue', usd(tot.revenue), C.ink],
              ['Costs', usd(tot.cost), C.ink],
              ['Ad spend', usd(tot.ads), C.ink],
              ['Profit', usd(tot.profit), pos(tot.profit)],
            ].map(([k, v, col]) => (
              <div key={k} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.soft }}>{k}</div>
                <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 800, marginTop: 6, color: col }}>{v}</div>
              </div>
            ))}
          </div>

          {(d.unreviewed > 0 || d.owedCents !== 0) && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {d.unreviewed > 0 && (
                <Link href="/admin/money/triage" style={{ background: C.mintTint, color: C.ink, padding: '10px 16px', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                  {d.unreviewed} transaction{d.unreviewed === 1 ? '' : 's'} waiting in Triage →
                </Link>
              )}
              {d.owedCents !== 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, padding: '10px 16px', borderRadius: 12, fontSize: 14 }}>
                  LLC owes Brian <b>{usd(d.owedCents)}</b>
                </div>
              )}
            </div>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '8px 10px', overflowX: 'auto' }}>
            {rows.length === 0 ? (
              <p style={{ color: C.soft, padding: 16 }}>No numbers for this month yet. Revenue arrives nightly and costs appear once transactions are sorted in Triage.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>App</th><th style={th}>Revenue</th><th style={th}>Costs</th>
                    <th style={th}>Ads</th><th style={th}>Profit</th><th style={th}>All-time</th><th style={th}>30-day ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.sort((a, b) => b.profit_cents - a.profit_cents).map((r) => {
                    const ro = d.roas30[r.app_slug]
                    return (
                      <tr key={r.app_slug}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 650 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={iconFor(r.app_slug)} alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: 'middle', marginRight: 10 }} />
                          {name(r.app_slug)}
                        </td>
                        <td style={td}>{usd(r.revenue_cents)}</td>
                        <td style={td}>{usd(r.direct_cost_cents + r.allocated_cost_cents)}</td>
                        <td style={td}>{usd(r.ad_spend_cents)}</td>
                        <td style={{ ...td, fontWeight: 700, color: pos(r.profit_cents) }}>{usd(r.profit_cents)}</td>
                        <td style={{ ...td, color: pos(r.cumulative_profit_cents) }}>{usd(r.cumulative_profit_cents)}</td>
                        <td style={td}>{ro && ro.spend > 0 ? `${(ro.proceeds / ro.spend).toFixed(2)}×` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ color: C.soft, fontSize: 12.5, margin: 0 }}>
            Revenue is what Apple pays out after its cut. Costs include each app&apos;s share of tools used by every app. ROAS is revenue earned per dollar of ads over the last 30 days.
          </p>
        </>
      )}
    </AdminShell>
  )
}
