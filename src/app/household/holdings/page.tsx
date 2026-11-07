'use client'
import { useEffect, useMemo, useState } from 'react'
import { AdminShell, C, Label, btn } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, th, td, usd, pct, price, qty, ago, day, moneyColor, useHousehold, Empty } from '@/components/household/shared'
import type { HoldingRow, Picture } from '@/lib/household/portfolio'
import type { TickerContext } from '@/lib/household/marketData'

// Household → Holdings: every position across every account, priced live (FMP)
// or at the last close (Plaid), sortable; a row opens the detail drawer with
// the FMP profile, 52-week range, dividends, news and every lot behind it.

type Data = { asOf: string; holdings: HoldingRow[]; investments_cents: number; fmp: Picture['fmp']; concentration: Picture['concentration'] }
type Detail = {
  ticker: string
  quote: { price: number | null; source: string; as_of: string | null; change_pct: number | null } | null
  range: { year_low?: number; year_high?: number; day_low?: number; day_high?: number; market_cap?: number; pe?: number } | null
  context: TickerContext
  positions: HoldingRow[]
  lots: { id: string; account_id: string; posted_on: string; type: string; subtype: string | null; quantity: number | null; price: number | null; amount_cents: number; fees_cents: number | null; name: string | null }[]
  accounts: { id: string; name: string | null; mask: string | null; institution: string | null }[]
}
type SortKey = 'value_cents' | 'gain_cents' | 'gain_pct' | 'weight' | 'ticker' | 'change_pct' | 'account_name'

const BUCKET_LABEL: Record<string, string> = { equity_us: 'US stocks', equity_intl: 'International', bonds: 'Bonds', cash: 'Cash', other: 'Other' }

export default function HouseholdHoldings() {
  const { data: d, updating, error } = useHousehold<Data>('/api/household/holdings')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value_cents', dir: -1 })
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailErr, setDetailErr] = useState<string | null>(null)

  const rows = useMemo(() => {
    const list = [...(d?.holdings ?? [])]
    list.sort((a, b) => {
      const av = a[sort.key] as number | string | null, bv = b[sort.key] as number | string | null
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - (bv as number)) * sort.dir
    })
    return list
  }, [d, sort])

  useEffect(() => {
    if (!open) { setDetail(null); return }
    setDetail(null); setDetailErr(null)
    fetch(`/api/household/holdings?ticker=${encodeURIComponent(open)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'failed'); setDetail(j) }).catch((e) => setDetailErr((e as Error).message))
  }, [open])

  const header = (label: string, key: SortKey, left = false) => (
    <th style={{ ...th, textAlign: left ? 'left' : 'right', cursor: 'pointer', color: sort.key === key ? C.ink : C.soft }} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
  const live = (d?.holdings ?? []).filter((h) => h.price_source === 'fmp').length
  const totalGain = (d?.holdings ?? []).reduce((n, h) => n + (h.gain_cents ?? 0), 0)
  const totalCost = (d?.holdings ?? []).reduce((n, h) => n + (h.cost_basis_cents ?? 0), 0)

  return (
    <AdminShell title="Household · Holdings" subtitle="Every position, priced live where FMP covers it and at the last close where it doesn't"
      actions={updating ? <Pill>Updating…</Pill> : d ? <Pill tone={live ? 'teal' : 'neutral'}>{live}/{d.holdings.length} live prices</Pill> : undefined}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {d && d.holdings.length === 0 && <Empty title="No positions yet">Connect a brokerage or retirement account in Settings. Holdings arrive with the first sync.</Empty>}

      {d && d.holdings.length > 0 && (<>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span><Label as="span">Invested</Label> <b style={{ fontSize: 22, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{usd(d.investments_cents)}</b></span>
          <span><Label as="span">Unrealised</Label> <b style={{ fontSize: 22, marginLeft: 8, fontVariantNumeric: 'tabular-nums', color: moneyColor(totalGain) }}>{usd(totalGain, { sign: true })}</b>{totalCost > 0 && <span style={{ color: C.soft, marginLeft: 6 }}>{pct((totalGain / totalCost) * 100, 1, true)}</span>}</span>
          {d.concentration.names[0]?.weight > 10 && <Pill tone="amber">{d.concentration.names[0].ticker} is {pct(d.concentration.names[0].weight, 0)} of the portfolio</Pill>}
        </div>

        <div style={{ ...card, padding: '6px 8px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {header('Security', 'ticker', true)}{header('Account', 'account_name', true)}
              <th style={th}>Qty</th><th style={th}>Price</th>{header('Day', 'change_pct')}{header('Value', 'value_cents')}
              <th style={th}>Cost</th>{header('Gain', 'gain_cents')}{header('Gain %', 'gain_pct')}{header('Weight', 'weight')}
              <th style={{ ...th, textAlign: 'left' }}>Class · sector</th>
            </tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={`${h.account_id}|${h.security_id}`} onClick={() => h.ticker && setOpen(h.ticker)} style={{ cursor: h.ticker ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.card2)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700 }}>{h.ticker ?? <span style={{ color: C.soft, fontWeight: 500 }}>no ticker</span>}</div>
                    <div style={{ fontSize: 12, color: C.soft, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: C.ink2, fontSize: 13 }}>{h.institution ? `${h.institution} · ` : ''}{h.account_name}</td>
                  <td style={td}>{qty(h.quantity)}</td>
                  <td style={td}>
                    {price(h.price)}
                    <div style={{ fontSize: 10.5, color: h.price_source === 'fmp' ? C.teal : C.soft }}>{h.price_source === 'fmp' ? 'live' : h.price_source === 'plaid' ? 'close' : 'custodian'}</div>
                  </td>
                  <td style={{ ...td, color: moneyColor(h.change_pct) }}>{pct(h.change_pct, 2, true)}</td>
                  <td style={{ ...td, fontWeight: 650 }}>{usd(h.value_cents)}</td>
                  <td style={{ ...td, color: C.ink2 }}>{usd(h.cost_basis_cents)}</td>
                  <td style={{ ...td, color: moneyColor(h.gain_cents) }}>{h.gain_cents == null ? '—' : usd(h.gain_cents, { sign: true })}</td>
                  <td style={{ ...td, color: moneyColor(h.gain_pct) }}>{pct(h.gain_pct, 1, true)}</td>
                  <td style={td}>{pct(h.weight, 1)}</td>
                  <td style={{ ...td, textAlign: 'left', fontSize: 12.5, color: C.ink2 }}>{BUCKET_LABEL[h.bucket]}{h.sector ? ` · ${h.sector}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: C.soft, fontSize: 12.5, margin: 0 }}>
          &ldquo;live&rdquo; is FMP&apos;s latest quote; &ldquo;close&rdquo; is Plaid&apos;s last close (FMP&apos;s free tier doesn&apos;t quote ETFs or mutual funds). Gain is against the cost basis the custodian reports. Click a row for the detail.
        </p>
      </>)}

      {/* Detail drawer */}
      {open && (
        <div role="dialog" aria-modal="true" onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,21,.35)', zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
          <aside onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', background: C.paper, height: '100%', overflowY: 'auto', padding: 24, boxSizing: 'border-box', display: 'grid', gap: 14, alignContent: 'start', boxShadow: '-12px 0 40px rgba(15,17,21,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>{open}</h2>
              <button style={btn('ghost')} onClick={() => setOpen(null)}>Close</button>
            </div>
            {detailErr && <p style={{ color: C.red }}>{detailErr}</p>}
            {!detail && !detailErr && <div style={{ ...card }}><Pill>Loading detail…</Pill></div>}
            {detail && (<>
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>{detail.context.profile?.companyName ?? detail.positions[0]?.name ?? open}</div>
                <div style={{ fontSize: 12.5, color: C.soft, marginTop: 2 }}>{[detail.context.profile?.sector, detail.context.profile?.industry, detail.context.profile?.isEtf ? 'ETF' : detail.context.profile?.isFund ? 'Fund' : null].filter(Boolean).join(' · ') || 'No FMP profile on this plan'}</div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{price(detail.quote?.price)}</span>
                  <span style={{ color: moneyColor(detail.quote?.change_pct), fontWeight: 600 }}>{pct(detail.quote?.change_pct, 2, true)}</span>
                  <Pill tone={detail.quote?.source === 'fmp' ? 'teal' : 'neutral'}>{detail.quote?.source === 'fmp' ? `live · ${ago(detail.quote.as_of)}` : detail.quote?.source === 'plaid' ? 'last close (Plaid)' : 'custodian price'}</Pill>
                </div>
                {detail.range?.year_low != null && detail.range.year_high != null && detail.quote?.price != null && (() => {
                  const lo = detail.range!.year_low!, hi = detail.range!.year_high!, p = detail.quote!.price!
                  const at = Math.max(0, Math.min(100, ((p - lo) / Math.max(1e-9, hi - lo)) * 100))
                  return (
                    <div style={{ marginTop: 12 }}>
                      <Label>52-week range</Label>
                      <div style={{ position: 'relative', height: 8, borderRadius: 99, background: C.card2, marginTop: 6 }}>
                        <div style={{ position: 'absolute', left: `${at}%`, top: -3, width: 14, height: 14, borderRadius: 99, background: C.teal, transform: 'translateX(-7px)', boxShadow: `0 0 0 3px ${C.mintTint}` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.soft, marginTop: 4 }}><span>{price(lo)}</span><span>{price(hi)}</span></div>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: C.ink2 }}>
                  {detail.range?.pe != null && <span>P/E <b style={{ color: C.ink }}>{detail.range.pe.toFixed(1)}</b></span>}
                  {detail.range?.market_cap != null && <span>Mkt cap <b style={{ color: C.ink }}>{(detail.range.market_cap / 1e9).toFixed(1)}B</b></span>}
                  {detail.context.grades?.consensus && <span>Analysts <b style={{ color: C.ink }}>{detail.context.grades.consensus}</b></span>}
                  {detail.context.target?.targetConsensus != null && <span>Target <b style={{ color: C.ink }}>{price(detail.context.target.targetConsensus)}</b></span>}
                  {detail.context.profile?.beta != null && <span>Beta <b style={{ color: C.ink }}>{detail.context.profile.beta.toFixed(2)}</b></span>}
                </div>
              </div>

              <div style={card}>
                <Label>Positions</Label>
                {detail.positions.map((p) => (
                  <div key={p.account_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                    <span>{p.institution ? `${p.institution} · ` : ''}{p.account_name}<div style={{ color: C.soft, fontSize: 12 }}>{qty(p.quantity)} shares · cost {usd(p.cost_basis_cents)}</div></span>
                    <span style={{ textAlign: 'right' }}><b style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(p.value_cents)}</b><div style={{ color: moneyColor(p.gain_cents), fontSize: 12 }}>{p.gain_cents == null ? '' : `${usd(p.gain_cents, { sign: true })} (${pct(p.gain_pct, 1, true)})`}</div></span>
                  </div>
                ))}
              </div>

              {detail.context.dividends && detail.context.dividends.length > 0 && (
                <div style={card}>
                  <Label>Dividends</Label>
                  {detail.context.dividends.map((dv, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                      <span>{day(dv.date)}{dv.frequency ? <span style={{ color: C.soft }}> · {dv.frequency}</span> : null}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{price(dv.dividend)}{dv.yield != null ? <span style={{ color: C.soft }}> · {pct(dv.yield, 2)} yield</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={card}>
                <Label>News</Label>
                {!detail.context.news?.length
                  ? <div style={{ fontSize: 13.5, color: C.soft, marginTop: 6 }}>Headlines need FMP&apos;s Starter plan; the free tier doesn&apos;t include news.</div>
                  : detail.context.news.map((n, i) => (
                    <a key={i} href={n.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '8px 0', borderTop: `1px solid ${C.rule}`, textDecoration: 'none', color: C.ink, fontSize: 13.5 }}>
                      <div style={{ fontWeight: 600 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: C.soft }}>{n.site} · {n.publishedDate ? ago(n.publishedDate) : ''}</div>
                    </a>
                  ))}
              </div>

              <div style={card}>
                <Label>Lots and transactions</Label>
                {detail.lots.length === 0 && <div style={{ fontSize: 13.5, color: C.soft, marginTop: 6 }}>No transactions for this security in the synced history.</div>}
                {detail.lots.map((l) => {
                  const acct = detail.accounts.find((a) => a.id === l.account_id)
                  return (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.rule}`, fontSize: 13.5 }}>
                      <span><span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{l.subtype ?? l.type}</span> · {day(l.posted_on)}<div style={{ fontSize: 12, color: C.soft }}>{acct ? `${acct.institution ?? ''} ${acct.name ?? ''} ···${acct.mask ?? ''}` : ''}{l.quantity != null ? ` · ${qty(l.quantity)} @ ${price(l.price)}` : ''}</div></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: l.amount_cents > 0 ? C.ink : C.mint }}>{usd(-l.amount_cents, { sign: true, cents: true })}</span>
                    </div>
                  )
                })}
              </div>
            </>)}
          </aside>
        </div>
      )}
    </AdminShell>
  )
}
