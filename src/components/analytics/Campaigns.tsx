'use client'
import { useCallback, useEffect, useState } from 'react'
import { AppTag, C, Label, btn, labelStyle } from '@/components/AdminNav'
import { PlatformGlyph } from '@/components/post/shared'

// ─── Campaigns card (FEAT-CLA-022) ───────────────────────────────────────────
//
// Every ad campaign across TikTok and Meta — status, spend, impressions, CTR,
// CPC, 15-second views, follows — one row per campaign, expand for its ads.
// Reads /api/analytics/campaigns. A figure the platform doesn't report shows
// "—", never 0. Installs / cost per install have their column now and fill in
// once App Store Connect campaign tokens are wired (/get/<app>?ct=).

export type CampaignAd = {
  ad_id: string; name: string; status?: string; status_detail?: string; review?: string; item_id?: string
  spend_cents: number; impressions?: number; clicks?: number; ctr?: number; cpc_cents?: number; views_15s?: number; follows?: number
}
export type CampaignRow = {
  platform: 'tiktok' | 'meta'; app_id: string | null; campaign_id: string; name: string; objective?: string
  status?: string; status_detail?: string; review?: string; budget_daily_cents?: number
  spend_cents: number; impressions?: number; reach?: number; clicks?: number; ctr?: number; cpc_cents?: number; cpm_cents?: number
  video_views?: number; views_2s?: number; views_6s?: number; views_15s?: number; views_100?: number
  follows?: number; profile_visits?: number; likes?: number; comments?: number; shares?: number
  installs?: number; cpi_cents?: number
  daily: { day: string; spend_cents: number; impressions?: number; views_15s?: number }[]
  ads: CampaignAd[]; promotion_id?: string; url?: string
}
type Payload = { range: { id: string; start: string; end: string; days: number }; apps: { id: string; name: string; accent: string }[]; campaigns: CampaignRow[]; errors: string[]; notes: { installs: string } }

type Range = '7d' | '30d' | '90d'
const RANGE_LABEL: Record<Range, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' }

const usd = (c?: number) => c == null ? '—' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 ? 2 : 0 })
const num = (v?: number) => v == null ? '—' : v.toLocaleString('en-US')
const pct = (v?: number) => v == null ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  running: { text: 'Running', color: C.mint, bg: C.mintTint }, paused: { text: 'Paused', color: C.amber, bg: '#FBF0DD' },
  in_review: { text: 'In review', color: C.amber, bg: '#FBF0DD' }, rejected: { text: 'Rejected', color: C.red, bg: '#FBE4E4' },
  scheduled: { text: 'Scheduled', color: C.ink2, bg: C.card2 }, ended: { text: 'Ended', color: C.ink2, bg: C.card2 },
  budget_spent: { text: 'Budget spent', color: C.ink2, bg: C.card2 }, no_funds: { text: 'Needs payment', color: C.red, bg: '#FBE4E4' },
  deleted: { text: 'Deleted', color: C.ink2, bg: C.card2 }, unknown: { text: '—', color: C.soft, bg: C.card2 },
}
const StatusChip = ({ s }: { s?: string }) => {
  const v = STATUS[s ?? 'unknown'] ?? STATUS.unknown
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: v.color, background: v.bg, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>{v.text}</span>
}
const PLATFORM_NAME = { tiktok: 'TikTok', meta: 'Meta' }

/** Tiny spend-per-day bars for a campaign row. */
function Bars({ daily, color }: { daily: CampaignRow['daily']; color: string }) {
  if (daily.length < 2) return null
  const max = Math.max(...daily.map((d) => d.spend_cents), 1)
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 22, width: Math.min(120, daily.length * 4) }}>
      {daily.slice(-30).map((d) => <span key={d.day} title={`${d.day}: ${usd(d.spend_cents)}`} style={{ flex: 1, minWidth: 2, height: Math.max(2, (d.spend_cents / max) * 22), background: color, opacity: 0.7, borderRadius: 1 }} />)}
    </div>
  )
}

export function Campaigns({ app = 'all', title = 'Campaigns', compact = false }: { app?: string; title?: string; compact?: boolean }) {
  const [range, setRange] = useState<Range>('30d')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async (r: Range) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/analytics/campaigns?app=${encodeURIComponent(app)}&range=${r}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setData(body)
    } catch (e) { setError((e as Error).message) }
    setLoading(false)
  }, [app])
  useEffect(() => { load(range) }, [load, range])

  const rows = data?.campaigns ?? []
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const grid = compact
    ? 'minmax(0,1.6fr) 90px 80px 80px 70px 70px 70px 70px 90px'
    : 'minmax(0,1.6fr) 90px 80px 84px 70px 70px 76px 70px 96px 120px'
  const head = (t: string, right = true) => <span style={{ ...labelStyle, textAlign: right ? 'right' : 'left' }}>{t}</span>
  const cell = (v: string, strong = false) => <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: C.mono, fontSize: 12.5, fontWeight: strong ? 700 : 500, color: v === '—' ? C.faint : C.ink }}>{v}</span>
  const totals = rows.reduce((t, r) => ({ spend: t.spend + r.spend_cents, impressions: t.impressions + (r.impressions ?? 0), views15: t.views15 + (r.views_15s ?? 0), follows: t.follows + (r.follows ?? 0) }), { spend: 0, impressions: 0, views15: 0, follows: 0 })

  return (
    <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: C.serif, fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12.5, color: C.soft }}>{data ? `${data.range.start} → ${data.range.end}` : ''}{loading && data ? ' · Updating…' : ''}</span>
        <span style={{ flex: 1 }} />
        <div role="radiogroup" aria-label="Range" style={{ display: 'inline-flex', background: C.card2, borderRadius: 9, padding: 3 }}>
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)}
              style={{ border: 0, borderRadius: 7, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, fontFamily: C.sans, cursor: 'pointer',
                       background: range === r ? C.card : 'transparent', color: range === r ? C.ink : C.soft, boxShadow: range === r ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
        <button style={{ ...btn('ghost'), padding: '5px 11px', fontSize: 12.5 }} disabled={loading} onClick={() => load(range)}>Refresh</button>
      </div>
      {error && <p style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
      {data?.errors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: 12.5, color: C.amber }}>{e}</p>)}

      {!data && loading && <div style={{ display: 'grid', gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 40, borderRadius: 10, background: C.card2 }} />)}</div>}
      {data && rows.length === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: C.soft }}>No campaigns in this window. Boost a posted TikTok or Instagram post from Post → Queue to start one.</p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: compact ? 760 : 900, display: 'grid', gap: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, padding: '4px 10px', alignItems: 'end' }}>
              {head('Campaign', false)}{head('Status', false)}{head('Spend')}{head('Impressions')}{head('CTR')}{head('CPC')}{head('15-s views')}{head('Follows')}{head('Installs · CPI')}{!compact && head('Spend by day')}
            </div>
            {rows.map((r) => {
              const key = `${r.platform}:${r.campaign_id}`
              const app = data?.apps.find((a) => a.id === r.app_id)
              const isOpen = open.has(key)
              return (
                <div key={key} style={{ borderTop: `1px solid ${C.rule}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, padding: '10px 10px', alignItems: 'center', minHeight: 48 }}>
                    <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <PlatformGlyph platform={r.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={15} />
                        <button onClick={() => toggle(key)} title={r.name} aria-expanded={isOpen}
                          style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: C.sans, fontSize: 13.5, fontWeight: 650, color: C.ink, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.soft, flexWrap: 'wrap' }}>
                        {app && r.app_id ? <AppTag id={r.app_id} name={app.name} size={14} /> : <span>Shared</span>}
                        <span>{PLATFORM_NAME[r.platform]}{r.objective ? ` · ${r.objective.toLowerCase().replace(/_/g, ' ')}` : ''}{r.budget_daily_cents ? ` · ${usd(r.budget_daily_cents)}/day` : ''}</span>
                        {r.promotion_id && <span style={{ color: C.mint, fontWeight: 700 }}>Studio boost</span>}
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ color: C.ink2 }}>Ads Manager ↗</a>}
                      </div>
                    </div>
                    <div><StatusChip s={r.status} /></div>
                    {cell(usd(r.spend_cents), true)}{cell(num(r.impressions))}{cell(pct(r.ctr))}{cell(usd(r.cpc_cents))}{cell(num(r.views_15s))}{cell(num(r.follows))}
                    <span style={{ textAlign: 'right', fontFamily: C.mono, fontSize: 12, color: C.faint }} title={data?.notes.installs}>{r.installs != null ? `${num(r.installs)} · ${usd(r.cpi_cents)}` : 'soon'}</span>
                    {!compact && <Bars daily={r.daily} color={app?.accent ?? C.mint} />}
                  </div>
                  {r.review && <p style={{ margin: '0 10px 8px 33px', fontSize: 12.5, color: C.red }}>{PLATFORM_NAME[r.platform]}: {r.review}</p>}
                  {isOpen && (
                    <div style={{ margin: '0 10px 10px 33px', background: C.card2, borderRadius: 12, padding: '8px 12px', display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: C.ink2 }}>
                        {r.reach != null && <span>Reach <b>{num(r.reach)}</b></span>}
                        {r.cpm_cents != null && <span>CPM <b>{usd(r.cpm_cents)}</b></span>}
                        {r.clicks != null && <span>Clicks <b>{num(r.clicks)}</b></span>}
                        {r.video_views != null && <span>Video views <b>{num(r.video_views)}</b></span>}
                        {r.views_2s != null && <span>2-s <b>{num(r.views_2s)}</b></span>}
                        {r.views_6s != null && <span>6-s <b>{num(r.views_6s)}</b></span>}
                        {r.views_100 != null && <span>Watched to end <b>{num(r.views_100)}</b></span>}
                        {r.profile_visits != null && <span>Profile visits <b>{num(r.profile_visits)}</b></span>}
                        {r.likes != null && <span>Likes <b>{num(r.likes)}</b></span>}
                        {r.comments != null && <span>Comments <b>{num(r.comments)}</b></span>}
                        {r.shares != null && <span>Shares <b>{num(r.shares)}</b></span>}
                        {r.status_detail && <span style={{ color: C.soft }}>{r.status_detail.toLowerCase().replace(/_/g, ' ')}</span>}
                      </div>
                      {r.ads.length > 0 ? r.ads.map((a) => (
                        <div key={a.ad_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 80px 80px 70px 70px 76px 70px', gap: 10, alignItems: 'center', fontSize: 12.5, padding: '4px 0', borderTop: `1px solid ${C.rule}` }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>
                            {a.name}{a.item_id && r.platform === 'tiktok' && <span style={{ color: C.soft }}> · video {a.item_id}</span>}
                            {a.review && <span style={{ color: C.red }}> · {a.review}</span>}
                          </span>
                          <div><StatusChip s={a.status} /></div>
                          {cell(usd(a.spend_cents))}{cell(num(a.impressions))}{cell(pct(a.ctr))}{cell(usd(a.cpc_cents))}{cell(num(a.views_15s))}{cell(num(a.follows))}
                        </div>
                      )) : <span style={{ fontSize: 12.5, color: C.soft }}>{r.platform === 'meta' ? 'Ad-level figures for Meta campaigns live in Ads Manager.' : 'No ads reported in this window.'}</span>}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, padding: '10px 10px 2px', borderTop: `2px solid ${C.rule2}`, alignItems: 'center' }}>
              <Label as="span">Total · {rows.length} campaign{rows.length === 1 ? '' : 's'}</Label><span />
              {cell(usd(totals.spend), true)}{cell(num(totals.impressions))}<span /><span />{cell(num(totals.views15))}{cell(num(totals.follows))}<span /><span />
            </div>
          </div>
        </div>
      )}
      {data && <p style={{ margin: 0, fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>Installs · CPI: {data.notes.installs}</p>}
    </section>
  )
}
