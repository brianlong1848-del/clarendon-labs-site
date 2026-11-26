'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, AppTag, C, Label, TILE, appAccent, btn, labelStyle } from '@/components/AdminNav'
import { AppleLogo, PlayLogo, WebLogo } from '@/components/StoreLogos'
import { PlatformGlyph } from '@/components/post/shared'
import { AdThumb } from '@/components/analytics/AdThumb'
import { ActionItem, AnalystNote, Footnote, Ideas, VerdictPill, useInsights, type InsightsPayload } from '@/components/analytics/Insights'
import { WorldStrip, countryName, flagOf, type WorldTile } from '@/components/analytics/WorldStrip'
import { appName } from '@/lib/ads/labels'
import type { AdsApiResponse, AdsRange } from '@/lib/money/adsReport'
import type { CountryAdSpend } from '@/lib/ads/countries'
import type { AppStrategy, GateStep } from '@/lib/ads/strategy'

// ─── Money → Ads (redesign 2026-11-14) ───────────────────────────────────────
//
// One question: is ad money doing anything, and what should happen to it?
// Wide: left 60% = status band (the revenue strategy's paused state and each
// app's gate), money tiles, World strip, By app, Campaigns; right 40% (sticky)
// = the analyst note and ranked actions. Under 1280px: one column, analyst
// first. Reads /api/money/ads (+ /countries) and /api/ads/insights (cached
// write-up, Regenerate only on the button). Last data comes from localStorage
// first so the page never waits on a fetch.

type Data = AdsApiResponse
type Camp = Data['campaigns'][number]
type Platform = 'all' | 'tiktok' | 'meta'
type CountriesPayload = { countries: CountryAdSpend[]; errors: string[] }

const RANGES: { id: AdsRange; label: string }[] = [
  { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: '1y', label: '1 year' }, { id: 'lifetime', label: 'Lifetime' },
]
const SYNC_DAYS: Record<AdsRange, number> = { '7d': 30, '30d': 30, '90d': 90, '1y': 365, lifetime: 365 }
const insightsRange = (r: AdsRange): '7d' | '30d' | '90d' => (r === '7d' ? '7d' : r === '30d' ? '30d' : '90d')
/** The markets that have run (or are planned) — shown as "paused" when nothing spent in the window. */
const HOME_MARKETS = ['us', 'ca', 'gb', 'au', 'nz', 'za']

const usd = (c: number | null | undefined, whole = false) => (c == null ? '—' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: whole && Math.abs(c) >= 10000 ? 0 : 2, minimumFractionDigits: whole && Math.abs(c) >= 10000 ? 0 : 2 }))
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US'))
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20 }
const th: React.CSSProperties = { ...labelStyle, textAlign: 'right', padding: '8px 10px', fontWeight: 500, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { textAlign: 'right', padding: '0 10px', height: 48, fontSize: 13.5, whiteSpace: 'nowrap', borderTop: `1px solid ${C.rule}`, fontVariantNumeric: 'tabular-nums' }
const chip = (on: boolean): React.CSSProperties => ({
  fontFamily: C.sans, fontSize: 12.5, fontWeight: 600, padding: '6px 12px', minHeight: 32, borderRadius: 99, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  background: on ? C.ink : C.card, color: on ? '#fff' : C.ink2, border: `1px solid ${on ? C.ink : C.rule2}`,
})

const PAGE_CSS = `
.ads-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}
.ads-left,.ads-right{display:grid;gap:16px;min-width:0}
.ads-right{order:-1}
.ads-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.ads-gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
@media (min-width:1280px){.ads-grid{grid-template-columns:minmax(0,1fr) clamp(340px,27vw,520px)}.ads-right{order:0;position:sticky;top:16px;max-height:calc(100dvh - 32px);overflow:auto}}
@media (max-width:700px){.ads-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ads-row:hover{background:#FAFBFC}
.ads-sort{border:0;background:transparent;padding:0;cursor:pointer;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit}
`

// ── Small parts ─────────────────────────────────────────────────────────────

function Roas({ v }: { v: number | null | undefined }) {
  if (v == null) return <span style={{ color: C.soft }}>—</span>
  return <span style={{ fontWeight: 700, color: v < 1 ? C.loss : C.teal }}>{v.toFixed(2)}×</span>
}

function Spark({ points, color = C.teal, w = 120, h = 28 }: { points: number[]; color?: string; w?: number; h?: number }) {
  if (points.length < 2 || points.every((p) => p === 0)) return <div style={{ height: h }} aria-hidden />
  const max = Math.max(...points, 1)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`).join(' ')
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ display: 'block' }}><path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" /></svg>
}

/** Counts up from 0 the first time a value arrives; later changes jump. Off under Reduce Motion. */
function useCountUp(target: number | null): number | null {
  const [v, setV] = useState<number | null>(target == null ? null : 0)
  const done = useRef(false)
  useEffect(() => {
    if (target == null) { setV(null); return }
    if (done.current || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    done.current = true
    const start = performance.now(), dur = 700
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      setV(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function Tile({ i, label, value, format, sub, spark, sparkColor }: { i: number; label: string; value: number | null; format: (v: number) => React.ReactNode; sub?: React.ReactNode; spark?: number[]; sparkColor?: string }) {
  const v = useCountUp(value)
  return (
    <div style={{ background: TILE[i % 4].bg, border: `1px solid ${TILE[i % 4].line}`, borderRadius: 16, padding: '14px 16px', display: 'grid', gap: 6, minWidth: 0 }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{v == null ? <span style={{ color: C.soft, fontSize: 18 }}>Not measured</span> : format(v)}</div>
      {sub && <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.45, display: 'grid', gap: 2 }}>{sub}</div>}
      {spark && <Spark points={spark} color={sparkColor} />}
    </div>
  )
}

function StoreLine({ logo, label, value, note }: { logo: React.ReactNode; label: string; value: React.ReactNode; note?: string }) {
  return (
    <span title={note} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {logo}<span style={{ color: C.ink2 }}>{label}</span><span style={{ flex: 1 }} /><b style={{ color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
    </span>
  )
}

const STEP_ICON: Record<GateStep['state'], { mark: string; color: string }> = {
  done: { mark: '✓', color: C.teal }, todo: { mark: '○', color: C.ink2 }, not_measured: { mark: '–', color: C.soft },
}

function GateCard({ s }: { s: AppStrategy }) {
  return (
    <div style={{ borderRadius: 12, background: C.card2, borderLeft: `4px solid ${appAccent(s.app_slug)}`, padding: '10px 12px', display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AppTag id={s.app_slug} name={s.name} size={16} style={{ fontWeight: 650, fontSize: 13 }} />
        <span style={{ flex: 1 }} />
        <StatePill state={s.ads_state} />
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {s.gate.map((g, k) => (
          <li key={k} title={g.note} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 6, fontSize: 12.5, lineHeight: 1.4, color: g.state === 'done' ? C.ink : C.ink2 }}>
            <span aria-hidden style={{ color: STEP_ICON[g.state].color, fontWeight: 700 }}>{STEP_ICON[g.state].mark}</span>
            <span>{g.label}{g.value ? <b style={{ color: C.ink }}> · {g.value}</b> : null}{g.state === 'not_measured' ? <span style={{ color: C.soft }}> · not measured yet</span> : null}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StatePill({ state }: { state: 'paused' | 'gated' | 'live' | undefined }) {
  if (!state) return null
  const s = state === 'live' ? { t: 'Live', c: C.teal, b: C.mintTint } : state === 'gated' ? { t: 'Gated', c: C.indigo, b: C.indigoTint } : { t: 'Paused', c: C.ink2, b: '#ECEEF2' }
  return <span style={{ fontSize: 11, fontWeight: 700, color: s.c, background: s.b, borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>{s.t}</span>
}

const LIVE: Record<string, { text: string; color: string; bg: string }> = {
  running: { text: 'Running', color: C.teal, bg: C.mintTint }, budget_spent: { text: 'Running', color: C.teal, bg: C.mintTint },
  paused: { text: 'Paused', color: C.ink2, bg: '#ECEEF2' }, ended: { text: 'Ended', color: C.ink2, bg: C.card2 }, deleted: { text: 'Deleted', color: C.ink2, bg: C.card2 },
  in_review: { text: 'In review', color: C.amber, bg: '#FBF0DD' }, scheduled: { text: 'Scheduled', color: C.ink2, bg: C.card2 },
  rejected: { text: 'Rejected', color: C.red, bg: '#FBE4E4' }, no_funds: { text: 'Needs payment', color: C.red, bg: '#FBE4E4' },
}
function LivePill({ status, lastDay }: { status?: string; lastDay: string }) {
  const s = status && LIVE[status]
  if (s) return <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>{s.text}</span>
  const quiet = Date.now() - Date.parse(`${lastDay}T00:00:00Z`) > 2 * 86400000
  return <span title="Status not readable from the platform; judged from spend" style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, background: C.card2, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>{quiet ? 'Not spending' : 'Spending'}</span>
}

// ── Page ────────────────────────────────────────────────────────────────────

type SortKey = 'label' | 'spend' | 'impressions' | 'ctr' | 'installs' | 'cpi' | 'roas' | 'last'

export default function Ads() {
  const [range, setRange] = useState<AdsRange>('30d')
  const [d, setD] = useState<Data | null>(null)
  const [updating, setUpdating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [countries, setCountries] = useState<CountriesPayload | null>(null)
  const [app, setApp] = useState<string>('all')
  const [platform, setPlatform] = useState<Platform>('all')
  const [country, setCountry] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const insights = useInsights('all', insightsRange(range))
  const ins: InsightsPayload | null = insights.data

  const cacheKey = `money-ads:${range}`
  const load = useCallback(async () => {
    setUpdating(true)
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 40000)
    const r = await fetch(`/api/money/ads?range=${range}`, { signal: ctl.signal }).catch(() => null)
    clearTimeout(t)
    if (r?.status === 401) { window.location.href = '/login'; return }
    if (r?.ok) {
      const j = await r.json()
      setD(j); try { localStorage.setItem(cacheKey, JSON.stringify(j)) } catch { /* private mode */ }
    } else setMsg({ text: r ? 'Could not load ad data.' : 'Ad data took too long to load — showing the last saved numbers.', bad: true })
    setUpdating(false)
  }, [range, cacheKey])
  useEffect(() => {
    try { const c = localStorage.getItem(cacheKey); setD(c ? JSON.parse(c) : null) } catch { /* ignore */ }
    load()
  }, [load, cacheKey])

  // Countries are live platform reads (slow): loaded separately, cached per range.
  useEffect(() => {
    const k = `money-ads-countries:${range}`
    try { const c = localStorage.getItem(k); setCountries(c ? JSON.parse(c) : null) } catch { /* ignore */ }
    let gone = false
    fetch(`/api/money/ads/countries?range=${range}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (gone || !j) return
      setCountries(j); try { localStorage.setItem(k, JSON.stringify(j)) } catch { /* ignore */ }
    }).catch(() => undefined)
    return () => { gone = true }
  }, [range])

  async function sync(quiet = false) {
    setBusy(true); if (!quiet) setMsg(null)
    const r = await fetch(`/api/cron/ad-spend?days=${SYNC_DAYS[range]}`).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (!r?.ok || !j) setMsg({ text: 'Sync failed.', bad: true })
    else {
      const entries = Object.entries(j.results as Record<string, { rows?: number; error?: string; skipped?: string }>)
      const errors = entries.filter(([, v]) => v.error).map(([k, v]) => `${k === 'meta' ? 'Meta' : appName(k)}: ${v.error}`)
      const notes = entries.filter(([, v]) => !v.error).map(([k, v]) => `${k === 'tiktok' ? 'TikTok' : k === 'meta' ? 'Meta' : appName(k)}: ${v.skipped ?? `${v.rows} campaign-days`}`)
      if (errors.length) setMsg({ text: `Sync problem — ${errors.join(' · ')}`, bad: true })
      else if (!quiet) setMsg({ text: `Synced ${j.window.start} → ${j.window.end}. ${notes.join(' · ')}` })
      else setMsg(null)
      await load()
    }
    setBusy(false)
  }
  // Quiet sync on arrival when the last pull is >10 minutes old, then every 10 minutes while visible.
  const lastSync = d?.last_sync ?? null
  const loaded = d !== null
  useEffect(() => {
    if (!loaded) return
    const STALE = 10 * 60 * 1000
    if (!lastSync || Date.now() - new Date(lastSync).getTime() > STALE) sync(true)
    const t = setInterval(() => { if (document.visibilityState === 'visible') sync(true) }, STALE)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // ── Derived ──
  const insFor = useCallback((c: { platform: string; campaign_id: string }) => ins?.campaigns.find((x) => x.platform === c.platform && x.campaign_id === c.campaign_id), [ins])
  const countriesOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of countries?.countries ?? []) for (const k of c.campaigns) m.set(k, [...(m.get(k) ?? []), c.country])
    return m
  }, [countries])
  const appsInData = useMemo(() => Array.from(new Set((d?.campaigns ?? []).map((c) => c.app_slug ?? 'shared'))).sort((a, b) => appName(a).localeCompare(appName(b))), [d])
  const camps = useMemo(() => (d?.campaigns ?? []).filter((c) =>
    (app === 'all' || (c.app_slug ?? 'shared') === app)
    && (platform === 'all' || c.platform === platform)
    && (!country || (countriesOf.get(`${c.platform}:${c.campaign_id}`) ?? []).includes(country))), [d, app, platform, country, countriesOf])
  const sorted = useMemo(() => {
    const val = (c: Camp): number | string => {
      switch (sort.key) {
        case 'label': return (c.label ?? c.name).toLowerCase()
        case 'spend': return c.spend_cents
        case 'impressions': return c.impressions
        case 'ctr': return c.ctr ?? -1
        case 'installs': return c.installs
        case 'cpi': return c.cpi_cents ?? Number.MAX_SAFE_INTEGER
        case 'roas': return c.est_roas ?? -1
        case 'last': return c.last_day
      }
    }
    return [...camps].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [camps, sort])

  const filtered = app !== 'all' || platform !== 'all' || !!country
  const spend = camps.reduce((t, c) => t + c.spend_cents, 0)
  const adInstalls = camps.reduce((t, c) => t + c.installs, 0)
  const storesFor = (pick: 'app_store' | 'google_play') => {
    if (!d?.stores) return null
    if (app === 'all') return d.stores[pick]
    return d.stores.apps.find((a) => a.app_slug === app)?.[pick] ?? null
  }
  const asc = storesFor('app_store'), play = storesFor('google_play')
  // proceeds_cents = App Store + Website (Stripe); split them for the tile, Play comes from its reports.
  const ownProceeds = app === 'all' ? d?.totals.proceeds_cents ?? 0 : d?.apps.find((a) => a.app_slug === app)?.proceeds_cents ?? 0
  const webProceeds = app === 'all' ? d?.totals.web_proceeds_cents ?? 0 : d?.apps.find((a) => a.app_slug === app)?.web_proceeds_cents ?? 0
  const ascProceeds = ownProceeds - webProceeds
  const playProceeds = play?.proceeds_cents ?? 0
  const proceedsAll = ownProceeds + playProceeds
  const daySeries = useMemo(() => {
    const by = new Map<string, { spend: number; installs: number }>()
    for (const c of camps) for (const p of c.daily_spend) { const x = by.get(p.day) ?? { spend: 0, installs: 0 }; x.spend += p.cents; x.installs += p.installs ?? 0; by.set(p.day, x) }
    const days = Array.from(by.keys()).sort()
    return { spend: days.map((k) => by.get(k)!.spend), installs: days.map((k) => by.get(k)!.installs) }
  }, [camps])
  const strategy = d?.strategy
  const scoreApps = (strategy?.apps ?? []).filter((s) => (app === 'all' || s.app_slug === app) && s.scoreboard.count != null)
  const scoreCount = scoreApps.reduce((t, s) => t + (s.scoreboard.count ?? 0), 0)
  const scoreSpend = (d?.campaigns ?? []).filter((c) => scoreApps.some((s) => s.app_slug === c.app_slug)).reduce((t, c) => t + c.spend_cents, 0)

  const actions = (ins?.actions ?? []).filter((a) => (app === 'all' || (a.app_id ?? 'shared') === app) && (platform === 'all' || a.platform === platform))

  const worldTiles: WorldTile[] = useMemo(() => {
    const list = countries?.countries ?? []
    const paused = strategy?.all_paused ?? true
    const byCc = new Map(list.map((c) => [c.country, c]))
    const ccs = Array.from(new Set([...list.map((c) => c.country), ...HOME_MARKETS]))
    return ccs.map((cc) => {
      const c = byCc.get(cc)
      const a = c && app !== 'all' ? c.by_app[app] : undefined
      const spendC = c ? (app === 'all' ? c.spend_cents : a?.spend_cents ?? 0) : 0
      return { country: cc, flag: flagOf(cc), spendCents: spendC, adInstalls: c ? (app === 'all' ? c.installs : a?.installs ?? 0) : undefined, paused }
    }).sort((x, y) => (y.spendCents ?? 0) - (x.spendCents ?? 0) || HOME_MARKETS.indexOf(x.country) - HOME_MARKETS.indexOf(y.country))
  }, [countries, app, strategy])

  const allPaused = strategy?.all_paused ?? false
  const sinceWord = strategy ? shortDay(strategy.paused_since) : ''
  const mainGates = (strategy?.apps ?? []).filter((s) => ['yulepick', 'rolligan', 'gagorder'].includes(s.app_slug) && (app === 'all' || s.app_slug === app))
  const otherGates = (strategy?.apps ?? []).filter((s) => !['yulepick', 'rolligan', 'gagorder'].includes(s.app_slug))

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'label' || key === 'cpi' ? 1 : -1 }))
  const SortTh = ({ k, children, left, title }: { k: SortKey; children: React.ReactNode; left?: boolean; title?: string }) => (
    <th style={{ ...th, ...(left ? { textAlign: 'left' } : {}) }} title={title} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="ads-sort" onClick={() => sortBy(k)}>{children}{sort.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div role="group" aria-label="Range" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {RANGES.map((r) => <button key={r.id} aria-pressed={r.id === range} onClick={() => setRange(r.id)} style={chip(r.id === range)}>{r.label}</button>)}
      </div>
      <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5, minHeight: 32 }} disabled={busy} onClick={() => sync()}>{busy ? 'Syncing…' : 'Sync now'}</button>
    </div>
  )

  return (
    <AdminShell title="Money · Ads" subtitle="What ad money bought, and what to do with it" actions={header}>
      <style>{PAGE_CSS}</style>
      <MoneyTabs />
      <div style={{ padding: '20px 0 40px', maxWidth: 1760, display: 'grid', gap: 16 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div role="group" aria-label="App" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button style={chip(app === 'all')} aria-pressed={app === 'all'} onClick={() => setApp('all')}>All apps</button>
            {appsInData.map((a) => (
              <button key={a} style={chip(app === a)} aria-pressed={app === a} onClick={() => setApp(app === a ? 'all' : a)}>
                {a === 'shared' ? 'Shared' : <AppTag id={a} name={appName(a)} size={14} />}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Platform" style={{ display: 'flex', gap: 4 }}>
            {(['all', 'tiktok', 'meta'] as Platform[]).map((p) => (
              <button key={p} style={chip(platform === p)} aria-pressed={platform === p} onClick={() => setPlatform(p)}>
                {p !== 'all' && <PlatformGlyph platform={p === 'tiktok' ? 'tiktok' : 'facebook'} size={12} />}{p === 'all' ? 'All platforms' : p === 'tiktok' ? 'TikTok' : 'Meta'}
              </button>
            ))}
          </div>
          {country && <button style={chip(true)} onClick={() => setCountry(null)}>{flagOf(country)} {countryName(country)} ✕</button>}
          {updating && d && <span style={{ fontSize: 11.5, color: C.soft, background: C.card2, borderRadius: 99, padding: '2px 8px' }}>Updating…</span>}
        </div>
        {msg && <p role="status" style={{ color: msg.bad ? C.red : C.teal, fontSize: 13, margin: 0 }}>{msg.text}</p>}

        <div className="ads-grid">
          {/* ── Left: status, money, world, apps, campaigns ── */}
          <div className="ads-left">
            {!d && <div style={{ ...card, display: 'grid', gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 56, borderRadius: 12, background: C.card2 }} />)}</div>}
            {d && (
              <>
                <section aria-label="Status" style={{ ...card, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{allPaused ? 'All paid ads are paused' : 'Paid ads by app'}</span>
                    {allPaused && <span style={{ fontSize: 13.5, color: C.ink2 }}>since {sinceWord} · <b style={{ color: (strategy?.spend_7d_cents ?? 0) > 0 ? C.loss : C.ink }}>{usd(strategy?.spend_7d_cents ?? 0)}</b> spent this week</span>}
                  </div>
                  {range === 'lifetime' && (
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: C.coralTint }}>
                      All-in so far: <b style={{ color: C.loss }}>{usd(d.totals.spend_cents)}</b> spent on ads vs <b style={{ color: proceedsAll > 0 ? C.teal : C.ink }}>{usd((d.totals.proceeds_cents ?? 0) + (d.totals.google_play_proceeds_cents ?? 0))}</b> in store proceeds
                      {d.totals.google_play_proceeds_cents != null ? ' (App Store + Google Play)' : ' (App Store)'}.
                      <span style={{ color: C.ink2, fontSize: 12.5 }}> Every app sells a one-time $1.99–$4.99 unlock, so paid installs can’t pay back on their own.</span>
                    </p>
                  )}
                  <div className="ads-gates">{mainGates.map((s) => <GateCard key={s.app_slug} s={s} />)}</div>
                  {app === 'all' && otherGates.length > 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: C.soft }}>{otherGates.map((s) => `${s.name}: ${s.note}`).join(' · ')}</p>
                  )}
                </section>

                <div className="ads-tiles">
                  <Tile i={0} label="Ad spend" value={spend} format={(v) => usd(Math.round(v), true)} spark={daySeries.spend}
                    sub={<span>{filtered ? 'Filtered view' : `${camps.length} campaign${camps.length === 1 ? '' : 's'} in range`}</span>} />
                  <Tile i={1} label="Installs" value={(asc?.installs ?? 0) + (play?.installs ?? 0)} format={(v) => num(Math.round(v))} spark={daySeries.installs} sparkColor={C.indigo}
                    sub={<>
                      <StoreLine logo={<AppleLogo size={11} />} label="App Store" value={num(asc?.installs)} note={asc?.covered_from ? `Covers ${asc.covered_from} → ${asc.covered_to}` : undefined} />
                      <StoreLine logo={<PlayLogo size={11} />} label="Google Play" value={play?.error ? '—' : num(play?.installs)} note={play?.error ?? (play?.covered_from ? `Covers ${play.covered_from} → ${play.covered_to}` : undefined)} />
                      <span style={{ color: C.soft }}>From ads (platform-counted): {num(adInstalls)}</span>
                    </>} />
                  <Tile i={2} label="Proceeds" value={proceedsAll} format={(v) => usd(Math.round(v))} spark={app === 'all' ? (d.daily ?? []).map((x) => x.proceeds_cents) : undefined} sparkColor={C.loss}
                    sub={<>
                      <StoreLine logo={<AppleLogo size={11} />} label="App Store" value={usd(ascProceeds)} />
                      <StoreLine logo={<PlayLogo size={11} />} label="Google Play" value={play ? (play.error ? '—' : usd(playProceeds)) : '—'} note={play?.error ?? (play?.covered_from ? `Play sales reports cover ${play.covered_from} → ${play.covered_to}` : undefined)} />
                      {webProceeds !== 0 && <StoreLine logo={<WebLogo size={11} />} label="Website" value={usd(webProceeds)} note="Stripe checkout, after fees and refunds" />}
                      <span style={{ display: 'flex', gap: 6 }}><span style={{ color: C.ink2 }}>{webProceeds !== 0 ? 'Blended ROAS, all sales' : 'Blended ROAS, both stores'}</span><span style={{ flex: 1 }} /><Roas v={ratio(proceedsAll, spend)} /></span>
                    </>} />
                  <Tile i={3} label="Cost per scoreboard count" value={scoreApps.length && scoreCount > 0 ? scoreSpend : null} format={(v) => usd(Math.round(v / Math.max(scoreCount, 1)))}
                    sub={scoreApps.length
                      ? <>{scoreApps.map((s) => <span key={s.app_slug}>{s.name}: {num(s.scoreboard.count)} {s.scoreboard.label.toLowerCase()}</span>)}
                          {scoreCount === 0 && <span style={{ color: C.soft }}>None in range, so no cost per count yet.</span>}
                          {scoreCount > 0 && scoreSpend === 0 && <span style={{ color: C.soft }}>No ad spend in range: every one came without paid ads.</span>}
                          <span style={{ color: C.soft }}>Relaunch ceiling: $10 per YulePick exchange.</span></>
                      : <span style={{ color: C.soft }}>No app records its scoreboard count yet (exchanges with 3+ members, games to round 3, games finished).</span>}
                  />
                </div>

                <section aria-label="Countries" style={{ ...card, display: 'grid', gap: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>World</h2>
                    <span style={{ fontSize: 12, color: C.soft }}>Ad spend and ad installs per country · tap to filter</span>
                  </div>
                  <WorldStrip tiles={worldTiles} selected={country} onSelect={setCountry} />
                  {countries?.errors?.length ? <p style={{ margin: 0, fontSize: 11.5, color: C.soft }}>{countries.errors.join(' · ')}</p> : null}
                  {!countries && <p style={{ margin: 0, fontSize: 12, color: C.soft }}>Reading countries from Meta and TikTok…</p>}
                </section>

                <section aria-label="By app" style={{ ...card, overflowX: 'auto' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>By app</h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...th, textAlign: 'left' }}>App</th><th style={th}>Spend</th><th style={th}>Ad installs</th><th style={th}>CPI</th>
                      <th style={th}><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><AppleLogo size={10} />Proceeds</span></th>
                      <th style={th}><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><PlayLogo size={10} />Proceeds</span></th>
                      <th style={th} title="(App Store + Google Play proceeds) ÷ ad spend">Blended ROAS</th>
                    </tr></thead>
                    <tbody>
                      {d.apps.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'left', color: C.soft }}>No ad spend in this window — nothing has been bought.</td></tr>}
                      {d.apps.filter((a) => app === 'all' || a.app_slug === app).map((a) => (
                        <tr key={a.app_slug} className="ads-row">
                          <td style={{ ...td, textAlign: 'left', fontWeight: 650, boxShadow: `inset 4px 0 0 ${appAccent(a.app_slug)}`, paddingLeft: 14 }}>
                            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                              {a.app_slug === 'shared' ? 'Shared' : <AppTag id={a.app_slug} name={a.app_name ?? appName(a.app_slug)} size={18} />}<StatePill state={a.ads_state} />
                            </span>
                          </td>
                          <td style={td}>{usd(a.spend_cents)}</td><td style={td}>{num(a.installs)}</td><td style={td}>{usd(a.cpi_cents)}</td>
                          <td style={td}>{usd(a.proceeds_cents)}</td><td style={td}>{a.google_play_proceeds_cents == null ? '—' : usd(a.google_play_proceeds_cents)}</td>
                          <td style={td}><Roas v={a.blended_roas_all ?? a.blended_roas} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section aria-label="Campaigns" style={{ ...card, overflowX: 'auto', padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 8px 6px' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Campaigns</h2>
                    <span style={{ fontSize: 12, color: C.soft }}>{sorted.length} shown · tap a row for its ads and the why</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead><tr>
                      <SortTh k="label" left>Campaign</SortTh>
                      <th style={{ ...th, textAlign: 'left' }}>Status</th>
                      <SortTh k="spend">Spend</SortTh>
                      <SortTh k="impressions">Impr.</SortTh>
                      <SortTh k="ctr">CTR</SortTh>
                      <SortTh k="installs">Installs</SortTh>
                      <SortTh k="cpi">CPI</SortTh>
                      <SortTh k="roas" title="App Store proceeds credited by this campaign's share of the app's ad installs (an estimate)">Est. ROAS</SortTh>
                    </tr></thead>
                    <tbody>
                      {sorted.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'left', color: C.soft }}>{filtered ? 'No campaigns match these filters.' : 'No campaigns in this window.'}</td></tr>}
                      {sorted.map((c) => {
                        const k = `${c.platform}:${c.campaign_id}`
                        const isOpen = open.has(k)
                        const ci = insFor(c)
                        const flags = countriesOf.get(k) ?? []
                        const hasMedia = !!(c.thumbnail_url || c.video_url)
                        return (
                          <Fragment key={k}>
                            <tr className="ads-row" onClick={() => toggle(k)} style={{ cursor: 'pointer' }}>
                              <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', boxShadow: c.app_slug ? `inset 4px 0 0 ${appAccent(c.app_slug)}` : undefined, paddingLeft: 12, height: 'auto', padding: '8px 10px 8px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <button aria-expanded={isOpen} aria-label={isOpen ? 'Hide details' : 'Show details'} onClick={(e) => { e.stopPropagation(); toggle(k) }}
                                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: C.soft, width: 20, padding: 0, fontSize: 12 }}>{isOpen ? '▾' : '▸'}</button>
                                  {hasMedia && (c.platform === 'tiktok' || c.platform === 'meta') && (
                                    <span onClick={(e) => e.stopPropagation()}><AdThumb platform={c.platform} campaignId={c.campaign_id} appId={c.app_slug} media={c} size={36} badge={(c.ad_count ?? 0) > 1 ? `+${(c.ad_count ?? 0) - 1}` : undefined} /></span>
                                  )}
                                  <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                                    <span title={c.label && c.label !== c.name ? `Platform name: ${c.name}` : c.name} style={{ fontWeight: 650, fontSize: 13.5, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minWidth: 200, maxWidth: 380 }}>{c.label ?? c.name}</span>
                                    <span style={{ color: C.soft, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <PlatformGlyph platform={c.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={11} />
                                      {c.app_name ?? appName(c.app_slug)} · {shortDay(c.first_day)} → {shortDay(c.last_day)}
                                      {flags.length > 0 && <span title={flags.map(countryName).join(', ')} aria-label={flags.map(countryName).join(', ')}>{flags.slice(0, 5).map(flagOf).join(' ')}{flags.length > 5 ? ` +${flags.length - 5}` : ''}</span>}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td style={{ ...td, textAlign: 'left' }}>
                                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LivePill status={ci?.status} lastDay={c.last_day} />{ci?.insight && <VerdictPill insight={ci.insight} size={11} />}</span>
                              </td>
                              <td style={td}>{usd(c.spend_cents)}</td>
                              <td style={td}>{num(c.impressions)}</td>
                              <td style={td}>{c.ctr == null ? '—' : `${c.ctr}%`}</td>
                              <td style={td} title={c.installs_why}>{c.installs ? num(c.installs) : <span style={{ color: C.soft, borderBottom: c.installs_why ? `1px dotted ${C.soft}` : undefined, cursor: c.installs_why ? 'help' : undefined }}>{c.installs_why ? 'why?' : '—'}</span>}</td>
                              <td style={td}>{usd(c.cpi_cents)}</td>
                              <td style={td}><Roas v={c.est_roas} /></td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={8} style={{ padding: '0 10px 12px 44px', borderTop: 0 }}>
                                  <div style={{ background: C.card2, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                                    {c.installs_why && <p style={{ margin: 0 }}><b>Installs.</b> {c.installs_why}</p>}
                                    {ci?.insight && <p style={{ margin: 0 }}><b>Why.</b> {ci.narrative?.why || ci.insight.reason}</p>}
                                    {ci?.narrative?.try_next && <p style={{ margin: 0 }}><b>{(ci.ads_state ?? 'paused') === 'paused' ? 'For the relaunch.' : 'Try next.'}</b> {ci.narrative.try_next}</p>}
                                    {c.label && c.label !== c.name && <p style={{ margin: 0, color: C.soft, fontSize: 12 }}>Platform name: <span style={{ fontFamily: C.mono }}>{c.name}</span></p>}
                                    {ci?.ads.length ? (
                                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead><tr><th style={{ ...th, textAlign: 'left', padding: '4px 8px' }}>Ad</th><th style={{ ...th, padding: '4px 8px' }}>Spend</th><th style={{ ...th, padding: '4px 8px' }}>Impr.</th><th style={{ ...th, padding: '4px 8px' }}>CTR</th><th style={{ ...th, textAlign: 'left', padding: '4px 8px' }}>Verdict</th></tr></thead>
                                        <tbody>
                                          {ci.ads.map((a) => (
                                            <tr key={a.ad_id}>
                                              <td style={{ ...td, height: 40, textAlign: 'left', whiteSpace: 'normal', padding: '4px 8px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                  {(a.thumbnail_url || a.video_url) && <AdThumb platform={ci.platform} campaignId={c.campaign_id} adId={a.ad_id} appId={c.app_slug} media={a} size={28} />}
                                                  <span>{a.permalink ? <a href={a.permalink} target="_blank" rel="noreferrer" style={{ color: C.ink }}>{a.name}</a> : a.name}</span>
                                                  {a.status && LIVE[a.status] && <span style={{ fontSize: 11, color: LIVE[a.status].color }}>{LIVE[a.status].text}</span>}
                                                </span>
                                              </td>
                                              <td style={{ ...td, height: 40, padding: '4px 8px' }}>{a.spend_cents == null ? '—' : usd(a.spend_cents)}</td>
                                              <td style={{ ...td, height: 40, padding: '4px 8px' }}>{num(a.impressions)}</td>
                                              <td style={{ ...td, height: 40, padding: '4px 8px' }}>{a.ctr == null ? '—' : `${a.ctr}%`}</td>
                                              <td style={{ ...td, height: 40, textAlign: 'left', padding: '4px 8px' }}><VerdictPill insight={a.insight} size={11} /></td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : <p style={{ margin: 0, color: C.soft, fontSize: 12 }}>{ins ? 'No ads listed for this campaign in this range.' : 'Ads load with the analyst note.'}</p>}
                                    {c.permalink && <a href={c.permalink} target="_blank" rel="noreferrer" style={{ color: C.teal, fontSize: 12.5, fontWeight: 600 }}>Open the post ↗</a>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                  <p style={{ color: C.soft, fontSize: 12, margin: '12px 8px 0', lineHeight: 1.5 }}>
                    Installs are the platform’s own count (SDK or Apple’s SKAN); “why?” says what’s missing. Est. ROAS credits the app’s App Store proceeds to each campaign by its share of that app’s ad installs, so it’s an estimate; blended ROAS per app is exact.
                    {d.last_sync ? ` Last synced ${new Date(d.last_sync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${busy ? ' (syncing…)' : ''}; refreshes every 10 minutes while open.` : ''}
                  </p>
                </section>
              </>
            )}
          </div>

          {/* ── Right: analyst + actions (sticky on wide screens; first on narrow) ── */}
          <aside className="ads-right" aria-label="Analyst">
            <section style={{ ...card, display: 'grid', gap: 14 }}>
              <AnalystNote s={insights} compact />
              {ins && (
                <>
                  {actions.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Label as="span">What to do · ranked</Label>
                      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                        {actions.map((a, i) => { const c = insFor(a); return <li key={a.id}><ActionItem a={a} n={i + 1} insight={c?.insight} media={c?.media} rail /></li> })}
                      </ol>
                    </div>
                  )}
                  {ins.campaigns.length > 0 && actions.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.ink2 }}>Nothing to do{filtered ? ' for this filter' : ''}: every campaign is off and none needs deleting.</p>}
                  <Ideas data={ins} />
                  <Footnote data={ins} />
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  )
}
