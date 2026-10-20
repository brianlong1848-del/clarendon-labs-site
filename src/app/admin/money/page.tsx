'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminShell, AppTag, C, Label, TILE, labelStyle } from '@/components/AdminNav'
import MoneyTabs from '@/components/money/MoneyTabs'
import PlaidSyncStatus from '@/components/money/PlaidSyncStatus'

type Row = { month: string; app_slug: string; revenue_cents: number; direct_cost_cents: number; allocated_cost_cents: number; ad_spend_cents: number; profit_cents: number; cumulative_profit_cents: number }
type App = { slug: string; name: string }
type Data = { pnl: Row[]; apps: App[]; roas30: Record<string, { spend: number; proceeds: number; installs: number }>; owedCents: number; unreviewed: number }

const usd = (c: number) => (c < 0 ? '−' : '') + Math.abs(c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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
  // A month, or "ytd" / "all": those roll every month in the period up per app.
  const rows = useMemo(() => {
    if (!d || !month) return []
    if (month !== 'ytd' && month !== 'all') return d.pnl.filter((x) => x.month === month)
    const year = String(new Date().getFullYear())
    const pick = d.pnl.filter((x) => month === 'all' || x.month.startsWith(year))
    const by = new Map<string, Row>()
    for (const r of [...pick].sort((a, b) => a.month.localeCompare(b.month))) {
      const x = by.get(r.app_slug)
      by.set(r.app_slug, x ? {
        ...x, month: r.month, revenue_cents: x.revenue_cents + r.revenue_cents, direct_cost_cents: x.direct_cost_cents + r.direct_cost_cents,
        allocated_cost_cents: x.allocated_cost_cents + r.allocated_cost_cents, ad_spend_cents: x.ad_spend_cents + r.ad_spend_cents,
        profit_cents: x.profit_cents + r.profit_cents, cumulative_profit_cents: r.cumulative_profit_cents,
      } : { ...r })
    }
    return Array.from(by.values())
  }, [d, month])
  const periodLabel = (m: string | null) => m === 'ytd' ? `Year to date (${new Date().getFullYear()})` : m === 'all' ? 'All time' : m ? monthLabel(m) : 'This month'
  const name = (slug: string) => d?.apps.find((a) => a.slug === slug)?.name.replace(/\s*\(.*\)/, '') ?? slug
  const tot = rows.reduce((t, r) => ({
    revenue: t.revenue + r.revenue_cents, cost: t.cost + r.direct_cost_cents + r.allocated_cost_cents,
    ads: t.ads + r.ad_spend_cents, profit: t.profit + r.profit_cents,
  }), { revenue: 0, cost: 0, ads: 0, profit: 0 })

  // All-time = every month on record, all apps (same view as the monthly tiles).
  const all = (d?.pnl ?? []).reduce((t, r) => ({
    revenue: t.revenue + r.revenue_cents, cost: t.cost + r.direct_cost_cents + r.allocated_cost_cents,
    ads: t.ads + r.ad_spend_cents, profit: t.profit + r.profit_cents,
  }), { revenue: 0, cost: 0, ads: 0, profit: 0 })
  const firstMonth = months[months.length - 1]

  const th: React.CSSProperties = { ...labelStyle, textAlign: 'right', padding: '8px 10px' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '0 10px', height: 48, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.rule}`, whiteSpace: 'nowrap' }
  const pos = (n: number) => (n > 0 ? C.mint : n < 0 ? C.loss : C.ink2)

  return (
    <AdminShell title="Money & ROI" subtitle="What each app earns, what it costs, and what's left"
      actions={months.length > 0 ? (
        <select value={month ?? ''} onChange={(e) => setMonth(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14, background: C.card }}>
          <option value="ytd">{periodLabel('ytd')}</option>
          <option value="all">All time</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      ) : undefined}>
      <MoneyTabs />
      <PlaidSyncStatus />
      {error && <p style={{ color: C.red }}>{error}</p>}
      {!d && !error && <p style={{ color: C.soft }}>Loading…</p>}

      {d && (
        <>
          <div data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '18px 20px', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <Label as="span">All-time profit / loss</Label>
              {firstMonth && <span style={{ fontSize: 12.5, color: C.soft }}>since {monthLabel(firstMonth)}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: C.sans, fontSize: 40, fontWeight: 700, letterSpacing: '-.02em', color: pos(all.profit) }}>{usd(all.profit)}</span>
              {[['Revenue', all.revenue], ['Costs', all.cost], ['Ad spend', all.ads]].map(([k, v]) => (
                <span key={k as string} style={{ display: 'grid', gap: 2 }}>
                  <Label as="span">{k}</Label>
                  <span style={{ fontSize: 18, fontWeight: 650 }}>{usd(v as number)}</span>
                </span>
              ))}
            </div>
            {/* Where the all-time revenue came from, so the total never needs guessing. */}
            {all.revenue > 0 && (() => {
              const by = new Map<string, number>()
              for (const r of d.pnl) if (r.revenue_cents) by.set(r.app_slug, (by.get(r.app_slug) ?? 0) + r.revenue_cents)
              return (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: C.ink2 }}>
                  <span style={{ color: C.soft }}>Revenue by app</span>
                  {Array.from(by).sort((a, b) => b[1] - a[1]).map(([slug, cents]) => (
                    <span key={slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <AppTag id={slug} name={name(slug)} size={16} /> <b style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</b>
                    </span>
                  ))}
                </div>
              )
            })()}
            {d.owedCents !== 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5, color: C.ink2, borderTop: `1px solid ${C.rule}`, paddingTop: 10 }}>
                LLC owes Brian <b style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{usd(d.owedCents)}</b>
                <Link href="/admin/money/ledger" style={{ color: C.mint, fontWeight: 600, textDecoration: 'none', marginLeft: 'auto' }}>Details</Link>
              </div>
            )}
          </div>

          <Label>{periodLabel(month)}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {[
              ['Revenue', usd(tot.revenue), C.ink],
              ['Costs', usd(tot.cost), C.ink],
              ['Ad spend', usd(tot.ads), C.ink],
              ['Profit', usd(tot.profit), pos(tot.profit)],
            ].map(([k, v, col], i) => (
              <div key={k} data-card style={{ background: TILE[i % 4].bg, border: `1px solid ${TILE[i % 4].line}`, borderRadius: 12, padding: '16px 18px' }}>
                <Label>{k}</Label>
                <div style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 650, letterSpacing: '-.02em', marginTop: 6, color: col }}>{v}</div>
              </div>
            ))}
          </div>

          {d.unreviewed > 0 && (
            <Link href="/admin/money/triage" style={{ justifySelf: 'start', alignSelf: 'start', background: C.mintTint, color: C.ink, padding: '10px 16px', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Sort {d.unreviewed} transaction{d.unreviewed === 1 ? '' : 's'} in Triage
            </Link>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '8px 10px', overflowX: 'auto' }}>
            {rows.length === 0 ? (
              <p style={{ color: C.soft, padding: 16 }}>No numbers for this period yet. Revenue arrives nightly and costs appear once transactions are sorted in Triage.</p>
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
                          <AppTag id={r.app_slug} name={name(r.app_slug)} />
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
