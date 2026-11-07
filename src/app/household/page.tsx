'use client'
import Link from 'next/link'
import { AdminShell, C, Label, TILE, btn } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, usd, pct, ago, moneyColor, useHousehold, Empty } from '@/components/household/shared'
import type { Picture, Bucket } from '@/lib/household/portfolio'

// Household → Overview: net worth with its deltas, allocation vs target, the
// cash buffer, and the latest advisor brief. Data: /api/household/overview.

type Brief = { id: string; kind: string; created_at: string; summary: string; model: string; actions: { id: string; kind: string; ticker: string | null; amount_cents: number | null; title: string; urgency: string | null; confidence: string | null }[] }
type Data = Picture & { brief: Brief | null }

const BUCKET_LABEL: Record<Bucket, string> = { equity_us: 'US stocks', equity_intl: 'International', bonds: 'Bonds', cash: 'Cash', other: 'Other' }
const BUCKET_COLOR: Record<Bucket, string> = { equity_us: '#0B7A83', equity_intl: '#4F46E5', bonds: '#B45309', cash: '#2BD4E0', other: '#8A919E' }
const BUCKETS: Bucket[] = ['equity_us', 'equity_intl', 'bonds', 'cash', 'other']

function Donut({ actual, target }: { actual: Record<Bucket, number>; target: Record<Bucket, number> }) {
  const stops = (m: Record<Bucket, number>) => { let acc = 0; return BUCKETS.map((b) => { const from = acc; acc += m[b] ?? 0; return `${BUCKET_COLOR[b]} ${from}% ${acc}%` }).join(', ') }
  return (
    <div style={{ position: 'relative', width: 150, height: 150, flex: 'none' }} aria-label="Allocation against target">
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${stops(actual)})` }} />
      <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', background: `conic-gradient(${stops(target)})`, opacity: 0.55 }} />
      <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: C.card, display: 'grid', placeItems: 'center', fontSize: 10.5, color: C.soft, textAlign: 'center', lineHeight: 1.3 }}>outer: now<br />inner: target</div>
    </div>
  )
}

export default function HouseholdOverview() {
  const { data: d, updating, error } = useHousehold<Data>('/api/household/overview')
  const delta = (v: number | null | undefined, label: string) => (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ fontWeight: 650, color: moneyColor(v), fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : usd(v, { sign: true })}</span>
      <span style={{ fontSize: 12.5, color: C.soft }}>{label}</span>
    </span>
  )
  const empty = d && d.accounts.length === 0

  return (
    <AdminShell title="Household" subtitle="Your accounts, investments and the advisor — kept apart from the Clarendon books"
      actions={updating ? <Pill>Updating…</Pill> : d ? <Pill tone="teal">{d.fmp.marketOpen ? 'Market open' : 'After close'}</Pill> : undefined}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}

      {empty && (
        <Empty title="Nothing connected yet">
          Connect a bank, card or brokerage in Settings and the picture fills in here.<br />
          <Link href="/household/settings" style={{ ...btn('mint'), display: 'inline-block', textDecoration: 'none', marginTop: 14 }}>Connect an account</Link>
        </Empty>
      )}

      {d && !empty && (<>
        {/* Hero: net worth */}
        <div data-card style={{ ...card, display: 'grid', gap: 12 }}>
          <Label>Net worth · assets − liabilities</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.02em', color: d.netWorth.total_cents < 0 ? C.loss : C.ink, fontVariantNumeric: 'tabular-nums' }}>{usd(d.netWorth.total_cents)}</span>
            {delta(d.deltas.d1_cents, '1 day')}{delta(d.deltas.d30_cents, '30 days')}{delta(d.deltas.ytd_cents, 'this year')}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: C.ink2 }}>
            <span>Assets <b style={{ color: C.ink }}>{usd(d.netWorth.assets_cents)}</b></span>
            <span>Liabilities <b style={{ color: d.netWorth.liabilities_cents ? C.loss : C.ink }}>{usd(d.netWorth.liabilities_cents)}</b></span>
            <span>Invested <b style={{ color: C.ink }}>{usd(d.netWorth.investments_cents)}</b></span>
            <span style={{ color: C.soft }}>{d.deltas.d1_cents == null ? 'Deltas appear after the first full day of snapshots' : `as of ${ago(d.asOf)}`}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {/* Allocation */}
          <div data-card style={{ ...card, display: 'grid', gap: 12 }}>
            <Label>Allocation vs target</Label>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut actual={d.allocation.actual_pct} target={d.allocation.target_pct} />
              <div style={{ display: 'grid', gap: 7, flex: 1, minWidth: 160 }}>
                {BUCKETS.filter((b) => d.allocation.actual_pct[b] > 0 || d.allocation.target_pct[b] > 0).map((b) => {
                  const drift = d.allocation.drift_pts[b]
                  const off = Math.abs(drift) > 5
                  return (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: BUCKET_COLOR[b], flex: 'none' }} />
                      <span style={{ flex: 1 }}>{BUCKET_LABEL[b]}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: C.ink2 }}>{pct(d.allocation.actual_pct[b], 0)} <span style={{ color: C.soft }}>/ {pct(d.allocation.target_pct[b], 0)}</span></span>
                      <Pill tone={off ? 'amber' : 'neutral'}>{drift > 0 ? '+' : ''}{drift.toFixed(0)} pts</Pill>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: C.soft }}>Drift over 5 points is where the advisor suggests rebalancing. <Link href="/household/settings" style={{ color: C.mint }}>Change the target</Link></div>
          </div>

          {/* Cash buffer */}
          <div data-card style={{ ...card, display: 'grid', gap: 10, alignContent: 'start' }}>
            <Label>Cash buffer</Label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{d.cash.months == null ? '—' : `${d.cash.months.toFixed(1)} mo`}</span>
              <span style={{ fontSize: 13, color: C.soft }}>of {d.cash.target_months} months covered</span>
            </div>
            {(() => { const full = d.cash.months == null ? 0 : Math.min(100, (d.cash.months / d.cash.target_months) * 100); return (
              <div style={{ height: 10, borderRadius: 99, background: C.card2, overflow: 'hidden' }}>
                <div style={{ width: `${full}%`, height: '100%', background: full >= 100 ? C.teal : full >= 50 ? C.indigo : C.amber, borderRadius: 99, transition: 'width .4s ease' }} />
              </div>
            ) })()}
            <div style={{ fontSize: 13, color: C.ink2 }}>
              {usd(d.cash.cents)} in cash · spending about <b style={{ color: C.ink }}>{usd(d.cash.avg_monthly_outflow_cents)}</b> a month
              {d.cash.avg_monthly_outflow_cents === 0 && <span style={{ color: C.soft }}> (no bank or card connected yet, so the run-rate is unknown)</span>}
            </div>
          </div>
        </div>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {[
            ['Accounts', String(d.accounts.length), C.ink],
            ['Positions', String(d.holdings.length), C.ink],
            ['Top name', d.concentration.names[0] ? `${d.concentration.names[0].ticker} ${pct(d.concentration.names[0].weight, 0)}` : '—', d.concentration.names[0] && d.concentration.names[0].weight > 10 ? C.amber : C.ink],
            ['Prices', `${d.fmp.callsToday}/${d.fmp.cap} FMP calls`, d.fmp.callsToday > d.fmp.cap * 0.8 ? C.amber : C.ink],
          ].map(([k, v, col], i) => (
            <div key={k} data-card style={{ background: TILE[i % 4].bg, border: `1px solid ${TILE[i % 4].line}`, borderRadius: 12, padding: '16px 18px' }}>
              <Label>{k}</Label>
              <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.02em', marginTop: 6, color: col as string, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Latest brief */}
        <div data-card style={{ ...card, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Label>Latest brief</Label>
            {d.brief && <span style={{ fontSize: 12.5, color: C.soft }}>{d.brief.kind === 'weekly' ? 'Weekly' : 'On demand'} · {ago(d.brief.created_at)}</span>}
          </div>
          {!d.brief ? (
            <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5 }}>
              No brief yet. The advisor reads this whole picture and says where to move money and what to buy, sell or trim — advice only, nothing is ever traded for you.
              <div style={{ marginTop: 10 }}><Link href="/household/advisor" style={{ ...btn('mint'), display: 'inline-block', textDecoration: 'none' }}>Brief me now</Link></div>
            </div>
          ) : (<>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: C.ink, whiteSpace: 'pre-wrap' }}>{d.brief.summary}</p>
            {d.brief.actions.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {d.brief.actions.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 12, background: C.card2, fontSize: 13.5 }}>
                    <Pill tone={a.urgency === 'now' ? 'loss' : a.urgency === 'this_week' ? 'amber' : 'neutral'}>{a.kind.replace('_', ' ')}</Pill>
                    <span style={{ flex: 1 }}>{a.title}</span>
                    {a.ticker && <span style={{ fontFamily: C.mono, fontSize: 12, color: C.ink2 }}>{a.ticker}</span>}
                    {a.amount_cents != null && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{usd(a.amount_cents)}</span>}
                  </div>
                ))}
              </div>
            )}
            <Link href="/household/advisor" style={{ color: C.mint, fontWeight: 600, fontSize: 13.5, textDecoration: 'none', justifySelf: 'start' }}>Open the advisor</Link>
          </>)}
        </div>
      </>)}
    </AdminShell>
  )
}
