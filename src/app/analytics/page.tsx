'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { clearStudioCache, peek, stash } from '@/lib/clientCache'
import { AdminShell, AppTag, C, Label, TILE, btn, labelStyle } from '@/components/AdminNav'
import { GeoExplorer } from '@/components/GeoExplorer'
import { Campaigns } from '@/components/analytics/Campaigns'
import { ActionItem, AnalystNote, Footnote, Ideas, useInsights, type InsightAction } from '@/components/analytics/Insights'
import { AppleLogo, PlayLogo } from '@/components/StoreLogos'

// ─── /analytics — every app, and the console does the work (redesign 2026-11-22)
//
// Top to bottom, each block answers one question:
//   This week     — what does the analyst say? The note rewrites itself once a
//                   day (useInsights), so it never sits on screen days old.
//   Do it for me  — the automations, across every app, run here through
//                   /api/ads/actions: pause what's still on while ads are off,
//                   delete dead campaigns, schedule winning ads as organic
//                   reposts (Post → Queue, editable), or all of it in one go.
//                   One confirm per run; nothing changes spend on its own.
//   KPI tiles     — revenue, new installs, ad spend, net, for the chosen range.
//   Apps          — one row per app: downloads + trend, proceeds, spend, ads
//                   state and what's waiting; the row opens the app's page.
//   The list      — the rest of the ranked actions, then what's done and what's
//                   simply left off (collapsed).
//   Campaigns, World — unchanged components.
// Reads /api/analytics and /api/ads/insights; shows the last copy at once and
// refreshes behind it.

type StoreTally = { installs: number; redownloads: number; updates: number; proceeds: number }
type History = {
  ytd: { installs: number; proceeds: number; from: string; to: string }
  prevYtd: { installs: number; proceeds: number; from: string; to: string }
  months: { month: string; installs: number; proceeds: number }[]
  allTime: { installs: number; proceeds: number }
}
type AppStoreMetrics = {
  reportDate: string; day: StoreTally; last30: StoreTally & { days: number }; otherCurrencies: string[]
  series: { date: string; installs: number; proceeds: number }[]
  countries?: { code: string; installs: number; proceeds: number }[]
  history?: History
} | null
type GooglePlayMetrics = {
  package: string; reportDate: string | null
  day: { installs: number; proceeds: number }; last30: { installs: number; proceeds: number; days: number }
  otherCurrencies: string[]; series: { date: string; installs: number; proceeds: number }[]
  countries: { code: string; installs: number }[]; history: History
} | { package: string; error: string } | null
type AppRow = {
  id: string; name: string; accent: string
  appStore: AppStoreMetrics; googlePlay?: GooglePlayMetrics
  instagram: { followers: number; posts: number; reach30d: number | null } | null
  facebook?: { name: string; followers: number; posts30d: number | null } | null
  tiktok: { spend: number; impressions: number; clicks: number } | null
}

type Range = '30d' | 'ytd' | 'yoy'
const RANGE_LABEL: Record<Range, string> = { '30d': '30 days', ytd: 'Year to date', yoy: 'Year over year' }
type Picked = { installs: number; proceeds: number; prev?: { installs: number; proceeds: number } }
const playOk = (p: GooglePlayMetrics | undefined) => (p && !('error' in p) ? p : null)
function pick(s: AppStoreMetrics, r: Range): Picked | null {
  if (!s) return null
  if (r === '30d' || !s.history) return { installs: s.last30.installs, proceeds: s.last30.proceeds }
  return r === 'ytd' ? s.history.ytd : { ...s.history.ytd, prev: s.history.prevYtd }
}
function pickPlay(p: GooglePlayMetrics | undefined, r: Range): Picked | null {
  const g = playOk(p)
  if (!g) return null
  if (r === '30d') return { installs: g.last30.installs, proceeds: g.last30.proceeds }
  return r === 'ytd' ? g.history.ytd : { ...g.history.ytd, prev: g.history.prevYtd }
}
function pickBoth(a: AppRow, r: Range): Picked {
  const s = pick(a.appStore, r), g = pickPlay(a.googlePlay, r)
  const prev = s?.prev || g?.prev ? { installs: (s?.prev?.installs ?? 0) + (g?.prev?.installs ?? 0), proceeds: (s?.prev?.proceeds ?? 0) + (g?.prev?.proceeds ?? 0) } : undefined
  return { installs: (s?.installs ?? 0) + (g?.installs ?? 0), proceeds: (s?.proceeds ?? 0) + (g?.proceeds ?? 0), prev }
}
const change = (now: number, before: number) =>
  before > 0 ? `${now >= before ? '+' : '−'}${Math.round(Math.abs(now - before) / before * 100)}% vs last year` : now > 0 ? 'new this year' : 'no sales either year'

const money = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2 })}`
const num = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const CSS = `
.an-auto{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:12px}
.an-tile{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;align-items:start;padding:16px;border-radius:16px;background:#fff;border:1px solid ${C.rule};transition:border-color .2s ease,box-shadow .25s ease,transform .2s ease}
.an-tile:hover{border-color:${C.rule2};box-shadow:0 12px 28px rgba(15,17,21,.07);transform:translateY(-1px)}
.an-tile[data-off="1"]{opacity:.6}
.an-tile[data-off="1"]:hover{transform:none;box-shadow:none;border-color:${C.rule}}
.an-go{background:linear-gradient(135deg,rgba(11,122,131,.09),rgba(79,70,229,.09));border-color:rgba(79,70,229,.25)}
.an-go:hover{box-shadow:0 14px 34px rgba(79,70,229,.16)}
@keyframes an-pulse{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,0)}50%{box-shadow:0 0 26px 2px rgba(79,70,229,.28)}}
.an-go[data-ready="1"]{animation:an-pulse 3.6s ease-in-out infinite}
.an-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.an-board{display:grid;gap:8px}
.an-row{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(130px,1fr) 100px 100px 140px 112px;gap:14px;align-items:center;padding:12px 16px;border-radius:12px;background:#fff;border:1px solid ${C.rule};border-left:4px solid var(--acc);color:${C.ink};text-decoration:none;transition:box-shadow .2s ease,transform .2s ease}
.an-row:hover{box-shadow:0 10px 26px color-mix(in srgb,var(--acc) 16%,transparent);transform:translateX(2px)}
.an-row:focus-visible{outline:2px solid ${C.teal};outline-offset:2px}
.an-head{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(130px,1fr) 100px 100px 140px 112px;gap:14px;padding:0 20px}
.an-dl{display:flex;align-items:center;gap:10px;min-width:0}
.an-num{font-variant-numeric:tabular-nums;text-align:right;font-weight:700;font-size:14.5px}
.an-sub{font-size:11.5px;color:${C.soft};font-weight:500}
details.an-more>summary{cursor:pointer;list-style:none;font-size:13px;font-weight:700;color:${C.teal};padding:6px 0}
details.an-more>summary::-webkit-details-marker{display:none}
@media (max-width:1000px){.an-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .an-row{grid-template-columns:minmax(0,1fr) auto auto;row-gap:6px}.an-head{display:none}
  .an-row .an-hide{display:none}}
@media (max-width:520px){.an-kpis{grid-template-columns:minmax(0,1fr)}.an-row{grid-template-columns:minmax(0,1fr) auto auto;gap:10px;padding:12px}.an-row .an-hide2{display:none}}
@media (prefers-reduced-motion:reduce){.an-go[data-ready="1"]{animation:none}.an-tile,.an-row{transition:none}.an-tile:hover,.an-row:hover{transform:none}}
`

/** Tiny trend line: daily over 30 days, or this year's months for YTD / YoY. */
function Spark({ values, color, w = 120, h = 30 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2 || Math.max(...values) <= 0) return <div style={{ width: w, height: h }} />
  const max = Math.max(...values)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <path d={`M0,${h} L${pts.join(' L')} L${w},${h} Z`} fill={color} opacity={0.12} />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

type Run = { phase: 'confirm' | 'busy' | 'done'; ok?: boolean; text?: string }
/** The automations the strip offers, in the order "Do everything" runs them. */
const AUTO = [
  { key: 'pause', kinds: ['pause'], glyph: '⏸', danger: true },
  { key: 'delete', kinds: ['delete_campaign'], glyph: '🗑', danger: true },
  { key: 'repost', kinds: ['reuse_angle'], glyph: '★', danger: false },
] as const
type AutoKey = (typeof AUTO)[number]['key']

export default function AnalyticsPage() {
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<Range>('30d')
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, Run>>({})
  const [ran, setRan] = useState<Record<string, { ok: boolean; text: string }>>({})
  const s = useInsights('all', '30d')

  const load = useCallback(async (fresh = false, followUp = 0) => {
    if (!followUp) setLoading(true)
    setError(null)
    let res: Response
    try { res = await fetch(`/api/analytics${fresh ? '?fresh=1' : ''}`) } catch { setLoading(false); setError('Could not reach the analytics API.'); return }
    setLoading(false)
    if (res.status === 401) { window.location.href = '/login'; return }
    const data = await res.json().catch(() => ({}))
    setApps(data.apps ?? []); stash('analytics', data.apps ?? [])
    // An older copy while the server rebuilds behind it: ask again at 8 s and 25 s.
    if (!fresh && followUp < 2 && data.cached_at && Date.now() - Date.parse(data.cached_at) > 150_000) setTimeout(() => load(false, followUp + 1), followUp ? 17_000 : 8_000)
  }, [])
  useEffect(() => {
    const seen = peek<AppRow[]>('analytics'); if (Array.isArray(seen) && seen.length) setApps(seen)
    load()
  }, [load])

  // ── What's waiting, from the rules engine ──────────────────────────────
  const data = s.data
  const actions = useMemo(() => (data?.actions ?? []), [data])
  const open = (a: InsightAction) => !a.done && !ran[a.id]?.ok
  const runnable = (a: InsightAction) => open(a) && !!a.button && !a.href
  const byKey = useMemo(() => Object.fromEntries(AUTO.map((t) => [t.key, actions.filter((a) => (t.kinds as readonly string[]).includes(a.kind) && runnable(a))])) as Record<AutoKey, InsightAction[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, ran])
  const everything = AUTO.flatMap((t) => byKey[t.key])

  const post = async (a: InsightAction) => {
    const res = await fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id, promotion_id: a.promotion_id, amount_cents: a.amount_cents,
        source_ids: { advertiser_id: a.advertiser_id, adgroup_ids: a.adgroup_ids, ad_ids: a.ad_ids, item_id: a.item_id, post_id: a.post_id } }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    return String(body.message ?? 'Done.')
  }
  /** Runs a list one by one (the platforms rate-limit bursts) and says what happened. */
  const runMany = async (key: string, list: InsightAction[], summary: (ok: number, n: number) => string) => {
    setRuns((r) => ({ ...r, [key]: { phase: 'busy' } }))
    let ok = 0; const errs: string[] = []
    for (const a of list) {
      try { const text = await post(a); ok++; setRan((m) => ({ ...m, [a.id]: { ok: true, text } })) }
      catch (e) { errs.push(`${a.campaign_label ?? a.campaign_name}: ${(e as Error).message}`); setRan((m) => ({ ...m, [a.id]: { ok: false, text: (e as Error).message } })) }
    }
    setRuns((r) => ({ ...r, [key]: { phase: 'done', ok: ok === list.length, text: summary(ok, list.length) + (errs.length ? ` ${errs[0]}` : '') } }))
    setTimeout(() => { s.reload(); load(true) }, 1500)
  }
  const verbs: Record<AutoKey, (n: number) => { title: string; what: string; idle: string; confirm: string; button: string; done: (ok: number, n: number) => string }> = {
    pause: (n) => ({ title: n ? `Pause ${plural(n, 'campaign')} still on` : 'Pause what’s still on', idle: 'Nothing is switched on while its app’s ads are off.',
      what: 'Ads are meant to be off for these apps, but these campaigns can still spend.', confirm: `Pause ${plural(n, 'campaign')} on TikTok and Meta? Spend to date stays; resume any time.`, button: `Pause ${n}`,
      done: (ok, k) => ok === k ? `Paused ${plural(k, 'campaign')}.` : `Paused ${ok} of ${k}.` }),
    delete: (n) => ({ title: n ? `Delete ${plural(n, 'dead campaign')}` : 'Clean up dead campaigns', idle: 'No dead campaigns.',
      what: 'Zero impressions for over a week. Gone for good, so they can’t switch back on.', confirm: `Delete ${plural(n, 'campaign')} that never delivered? Can’t be undone.`, button: `Delete ${n}`,
      done: (ok, k) => ok === k ? `Deleted ${plural(k, 'dead campaign')}.` : `Deleted ${ok} of ${k}.` }),
    repost: (n) => ({ title: n ? `Schedule ${plural(n, 'winning ad')} as organic posts` : 'Repost winning ads', idle: 'No winning ad with a Studio post to repost.',
      what: 'Same video, fresh Claude caption, Instagram + Facebook at the next best hour. No spend; edit or cancel in Post → Queue.', confirm: `Schedule ${plural(n, 'organic post')} (Instagram + Facebook, best hour, fresh caption)? Nothing goes out now; each waits in Post → Queue.`, button: `Schedule ${n}`,
      done: (ok, k) => ok === k ? `Scheduled ${plural(k, 'post')}. They’re in Post → Queue.` : `Scheduled ${ok} of ${k}.` }),
  }

  // ── Totals for the KPI tiles and the app rows ──────────────────────────
  const spendBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of data?.campaigns ?? []) if (c.app_id) m.set(c.app_id, (m.get(c.app_id) ?? 0) + (c.insight.metrics.spend_cents ?? 0) / 100)
    return m
  }, [data])
  const haveSpend = !!data?.campaigns?.length
  const spendOf = (a: AppRow) => haveSpend ? (spendBy.get(a.id) ?? 0) : (a.tiktok?.spend ?? 0)
  const anyPlay = apps.some((a) => playOk(a.googlePlay ?? null))
  const totals = apps.reduce((t, a) => {
    const st = pick(a.appStore, range), g = pickPlay(a.googlePlay, range), b = pickBoth(a, range)
    return { proceeds: t.proceeds + b.proceeds, installs: t.installs + b.installs, prevProceeds: t.prevProceeds + (b.prev?.proceeds ?? 0), prevInstalls: t.prevInstalls + (b.prev?.installs ?? 0),
      apple: t.apple + (st?.proceeds ?? 0), play: t.play + (g?.proceeds ?? 0), appleI: t.appleI + (st?.installs ?? 0), playI: t.playI + (g?.installs ?? 0), spend: t.spend + spendOf(a) }
  }, { proceeds: 0, installs: 0, prevProceeds: 0, prevInstalls: 0, apple: 0, play: 0, appleI: 0, playI: 0, spend: 0 })
  const series = (a: AppRow) => {
    const by = new Map<string, number>()
    for (const d of [...(a.appStore?.series ?? []), ...(playOk(a.googlePlay ?? null)?.series ?? [])]) by.set(d.date, (by.get(d.date) ?? 0) + d.installs)
    return Array.from(by).sort((x, y) => x[0].localeCompare(y[0])).slice(-30).map(([, v]) => v)
  }
  const trend = (key: 'installs' | 'proceeds') => {
    const by = new Map<string, number>()
    if (range === '30d') { for (const a of apps) for (const d of [...(a.appStore?.series ?? []), ...(playOk(a.googlePlay ?? null)?.series ?? [])]) by.set(d.date, (by.get(d.date) ?? 0) + d[key]) }
    else { const y = String(new Date().getFullYear()); for (const a of apps) for (const m of [...(a.appStore?.history?.months ?? []), ...(playOk(a.googlePlay ?? null)?.history.months ?? [])]) if (m.month.startsWith(y)) by.set(m.month, (by.get(m.month) ?? 0) + m[key]) }
    return Array.from(by).sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v)
  }
  const rangeWord = RANGE_LABEL[range === 'yoy' ? 'ytd' : range].toLowerCase()

  // Per app: is anything spending, what's waiting.
  const appState = (id: string) => {
    const cs = (data?.campaigns ?? []).filter((c) => c.app_id === id)
    const state = cs.find((c) => c.ads_state)?.ads_state
    const on = cs.filter((c) => (c.status === 'running' || c.status === 'active') && !ran[`pause:${c.platform}:${c.campaign_id}`]?.ok).length
    const todo = actions.filter((a) => a.app_id === id && open(a) && a.kind !== 'leave_off' && a.kind !== 'wait').length
    return { state, on, todo }
  }
  const stillOn = byKey.pause.length
  const status = [
    `${apps.length || 5} apps`,
    data ? (stillOn ? `${plural(stillOn, 'campaign')} still on while ads are off` : 'no ad spending that shouldn’t be') : null,
    data ? `${plural(actions.filter((a) => open(a) && a.kind !== 'leave_off' && a.kind !== 'wait').length, 'thing')} to do` : null,
  ].filter(Boolean).join(' · ')

  // ── The list below the strip ────────────────────────────────────────────
  const autoIds = new Set(everything.map((a) => a.id))
  const todo = actions.filter((a) => open(a) && !autoIds.has(a.id) && a.kind !== 'leave_off')
  const doneList = actions.filter((a) => !open(a))
  const leftOff = actions.filter((a) => open(a) && a.kind === 'leave_off')
  const campaign = (a: InsightAction) => data?.campaigns.find((c) => c.platform === a.platform && c.campaign_id === a.campaign_id)

  const label = labelStyle
  const small: CSSProperties = { padding: '6px 12px', fontSize: 12.5 }
  const tileStyle = (i: number): CSSProperties => ({ background: TILE[i].bg, border: `1px solid ${TILE[i].line}`, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 })
  const big: CSSProperties = { fontSize: 30, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }
  const appsIn = (list: InsightAction[]) => Array.from(new Set(list.map((a) => a.app_id).filter((x): x is string => !!x)))

  const autoTile = (key: AutoKey, glyph: string, danger: boolean) => {
    const list = byKey[key], n = list.length, v = verbs[key](n), r = runs[key]
    let control: ReactNode
    if (r?.phase === 'confirm') control = (
      <div role="alertdialog" aria-label="Confirm" style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{v.confirm}</span>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={{ ...btn(danger ? 'ghost' : 'mint'), ...small, ...(danger ? { color: C.red, borderColor: C.red } : {}) }} onClick={() => runMany(key, list, v.done)}>{v.button}</button>
          <button style={{ ...btn('ghost'), ...small }} onClick={() => setRuns((m) => { const x = { ...m }; delete x[key]; return x })}>Cancel</button>
        </span>
      </div>)
    else if (r?.phase === 'busy') control = <span style={{ fontSize: 12.5, color: C.teal, fontWeight: 600 }}>Working… {n > 1 ? 'one at a time' : ''}</span>
    else control = <button style={{ ...btn('ghost'), ...small, ...(danger && n ? { color: C.red } : {}) }} disabled={!n || !!Object.values(runs).find((x) => x.phase === 'busy')} onClick={() => setRuns((m) => ({ ...m, [key]: { phase: 'confirm' } }))}>{n ? v.button : 'Nothing to do'}</button>
    return (
      <div key={key} className="an-tile" data-off={!n && r?.phase !== 'done' ? '1' : undefined}>
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 17, background: danger ? '#FBEDE6' : C.mintTint }}>{glyph}</span>
        <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
          <div>
            <b style={{ fontSize: 14 }}>{v.title}</b>
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: 1.45 }}>
              {r?.phase === 'done' ? <span style={{ color: r.ok ? C.teal : C.red, fontWeight: 600 }}>{r.text}</span> : n ? v.what : v.idle}
            </div>
            {n > 0 && r?.phase !== 'done' && <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>{appsIn(list).map((id) => <AppTag key={id} id={id} name={apps.find((a) => a.id === id)?.name ?? id} size={14} style={{ fontSize: 12 }} />)}</div>}
          </div>
          <div>{control}</div>
        </div>
      </div>
    )
  }

  const busyAny = Object.values(runs).some((x) => x.phase === 'busy')
  const all = runs.all

  return (
    <AdminShell
      title="Analytics"
      subtitle={status}
      actions={<>
        {(loading || s.updating) && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.teal, background: C.mintTint, borderRadius: 99, padding: '6px 12px' }}>Updating…</span>}
        <button style={btn('ghost')} disabled={loading} onClick={() => { load(true); s.reload() }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        <button style={btn('ghost')} onClick={() => { clearStudioCache(); fetch('/auth/signout', { method: 'POST' }).finally(() => { window.location.href = '/login' }) }}>Sign out</button>
      </>}
    >
      <style>{CSS}</style>
      {error && <p style={{ color: C.red, fontSize: 14, margin: 0 }}>{error}</p>}

      {/* 1 · The analyst */}
      <section aria-label="This week" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>This week</h2>
          <span style={{ fontSize: 12.5, color: C.soft }}>rewrites itself the first time you open this page each day</span>
        </div>
        <AnalystNote s={s} />
      </section>

      {/* 2 · Do it for me */}
      <section aria-label="Do it for me" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Do it for me</h2>
          <span style={{ fontSize: 12.5, color: C.soft }}>every app at once · runs here, not in TikTok Ads or Ads Manager · one confirm each</span>
        </div>
        <div className="an-auto">
          {/* Everything at once: the one primary action on the page. */}
          <div className="an-tile an-go" data-ready={everything.length && !all ? '1' : undefined} data-off={!everything.length && !all ? '1' : undefined}>
            <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 17, color: '#fff', background: C.grad }}>✦</span>
            <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
              <div>
                <b style={{ fontSize: 14 }}>{everything.length ? `Do all ${everything.length}` : 'All caught up'}</b>
                <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: 1.45 }}>
                  {all?.phase === 'done' ? <span style={{ color: all.ok ? C.teal : C.red, fontWeight: 600 }}>{all.text}</span>
                    : everything.length ? AUTO.filter((t) => byKey[t.key].length).map((t) => `${byKey[t.key].length} ${t.key === 'pause' ? 'to pause' : t.key === 'delete' ? 'to delete' : 'to repost'}`).join(' · ')
                    : data ? 'Nothing the console can do for you right now.' : 'Reading the campaigns…'}
                </div>
              </div>
              <div>
                {all?.phase === 'confirm' ? (
                  <div role="alertdialog" aria-label="Confirm" style={{ display: 'grid', gap: 8 }}>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
                      {byKey.pause.length > 0 && <li>Pause {plural(byKey.pause.length, 'campaign')} (resume any time)</li>}
                      {byKey.delete.length > 0 && <li>Delete {plural(byKey.delete.length, 'dead campaign')} (can’t be undone)</li>}
                      {byKey.repost.length > 0 && <li>Schedule {plural(byKey.repost.length, 'organic post')} (waits in Post → Queue)</li>}
                    </ul>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      <button style={{ ...btn('mint'), ...small }} onClick={() => runMany('all', everything, (ok, n) => ok === n ? `Done: all ${n}.` : `${ok} of ${n} done.`)}>Do all {everything.length}</button>
                      <button style={{ ...btn('ghost'), ...small }} onClick={() => setRuns((m) => { const x = { ...m }; delete x.all; return x })}>Cancel</button>
                    </span>
                  </div>
                ) : all?.phase === 'busy' ? <span style={{ fontSize: 12.5, color: C.teal, fontWeight: 600 }}>Working through them…</span>
                  : <button style={{ ...btn('mint'), ...small }} disabled={!everything.length || busyAny} onClick={() => setRuns((m) => ({ ...m, all: { phase: 'confirm' } }))}>{everything.length ? `Do all ${everything.length}` : 'Nothing to do'}</button>}
              </div>
            </div>
          </div>
          {AUTO.map((t) => autoTile(t.key, t.glyph, t.danger))}
        </div>
      </section>

      {/* 3 · Headline numbers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div role="radiogroup" aria-label="Time range" style={{ display: 'inline-flex', background: C.card2, borderRadius: 10, padding: 3 }}>
          {(['30d', 'ytd', 'yoy'] as Range[]).map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)}
              style={{ border: 0, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: C.sans, cursor: 'pointer',
                       background: range === r ? C.card : 'transparent', color: range === r ? C.ink : C.soft, boxShadow: range === r ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: C.soft }}>App Store + Google Play · ad spend is always the last 30 days</span>
      </div>
      <div className="an-kpis">
        <div data-card style={tileStyle(0)}>
          <div style={label}>Revenue, {rangeWord}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}><div style={big}>{apps.length ? money(totals.proceeds) : '—'}</div><Spark values={trend('proceeds')} color={C.teal} w={92} /></div>
          {anyPlay && <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.ink2 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppleLogo size={10} />{money(totals.apple)}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlayLogo size={9} />{money(totals.play)}</span></div>}
          {range === 'yoy' && <div style={{ fontSize: 12, color: C.ink2 }}>{money(totals.prevProceeds)} last year · {change(totals.proceeds, totals.prevProceeds)}</div>}
        </div>
        <div data-card style={tileStyle(1)}>
          <div style={label}>New installs, {rangeWord}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}><div style={big}>{apps.length ? num(totals.installs) : '—'}</div><Spark values={trend('installs')} color={C.indigo} w={92} /></div>
          {anyPlay && <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.ink2 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppleLogo size={10} />{num(totals.appleI)}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlayLogo size={9} />{num(totals.playI)}</span></div>}
          {range === 'yoy' && <div style={{ fontSize: 12, color: C.ink2 }}>{num(totals.prevInstalls)} last year · {change(totals.installs, totals.prevInstalls)}</div>}
        </div>
        <div data-card style={tileStyle(2)}>
          <div style={label}>Ad spend, 30 days</div>
          <div style={big}>{apps.length || haveSpend ? money(totals.spend) : '—'}</div>
          <div style={{ fontSize: 12, color: C.ink2 }}>{haveSpend ? 'TikTok + Meta' : 'TikTok only until the campaigns load'}{totals.spend > 0 && totals.installs > 0 && range === '30d' ? ` · ${money(totals.spend / totals.installs)} per install at best` : ''}</div>
        </div>
        <div data-card style={tileStyle(3)}>
          <div style={label}>Net, 30 days</div>
          {(() => { const p = apps.reduce((t, a) => t + pickBoth(a, '30d').proceeds, 0), n = p - totals.spend; return <>
            <div style={{ ...big, color: n < 0 ? C.loss : C.ink }}>{apps.length ? money(n) : '—'}</div>
            <div style={{ fontSize: 12, color: C.ink2 }}>{money(p)} proceeds − {money(totals.spend)} ads</div>
          </> })()}
        </div>
      </div>

      {/* 4 · Apps board */}
      <section aria-label="Apps" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Label as="span">Apps</Label><span style={{ flex: 1, height: 1, background: C.rule }} />
        </div>
        <div className="an-head" aria-hidden="true">
          {['App', `Downloads, ${rangeWord}`, 'Proceeds', 'Ad spend', 'Ads', ''].map((h, i) => <span key={i} style={{ ...label, fontSize: 10.5, textAlign: i >= 2 && i <= 3 ? 'right' : 'left' }}>{h}</span>)}
        </div>
        <div className="an-board">
          {(apps.length ? apps : []).map((a) => {
            const b = pickBoth(a, range), st = appState(a.id), sp = spendOf(a)
            const ads = st.state === 'paused' || st.state === 'gated' ? (st.on ? { t: `${st.on} on while off`, c: C.red, bg: '#FBE7E5' } : { t: 'Ads off', c: C.ink2, bg: C.card2 })
              : st.on ? { t: `${plural(st.on, 'campaign')} live`, c: C.teal, bg: C.mintTint } : { t: haveSpend ? 'No campaigns' : '—', c: C.soft, bg: C.card2 }
            return (
              <Link key={a.id} href={`/analytics/${a.id}`} className="an-row" style={{ ['--acc' as string]: a.accent } as CSSProperties} aria-label={`${a.name}: ${num(b.installs)} downloads, ${money(b.proceeds)} proceeds`}>
                <span style={{ minWidth: 0 }}><AppTag id={a.id} name={a.name} size={26} style={{ fontWeight: 700, fontSize: 15 }} /></span>
                <span className="an-dl">
                  <span className="an-num" style={{ minWidth: 44 }}>{num(b.installs)}</span>
                  <span className="an-hide2">{range === '30d' ? <Spark values={series(a)} color={a.accent} w={84} h={24} /> : b.prev ? <span className="an-sub">{change(b.installs, b.prev.installs)}</span> : null}</span>
                </span>
                <span className="an-num an-hide">{money(b.proceeds)}</span>
                <span className="an-num an-hide" style={{ color: sp > 0 && sp > b.proceeds && range === '30d' ? C.loss : C.ink }}>{money(sp)}</span>
                <span className="an-hide"><span style={{ fontSize: 11.5, fontWeight: 700, color: ads.c, background: ads.bg, borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>{ads.t}</span></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  {st.todo > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: C.grad, borderRadius: 99, padding: '2px 9px' }}>{st.todo} to do</span>}
                  <span aria-hidden="true" style={{ color: C.soft, fontSize: 16 }}>›</span>
                </span>
              </Link>
            )
          })}
          {!apps.length && [0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 56, borderRadius: 12, background: C.card2 }} />)}
        </div>
      </section>

      {/* 5 · Everything else the analyst ranked */}
      {data && (
        <section aria-label="The list" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>The list</h2>
            <span style={{ fontSize: 12.5, color: C.soft }}>{todo.length ? `${plural(todo.length, 'more thing')} the strip above doesn’t cover` : everything.length ? 'Everything left is in Do it for me above.' : 'Nothing waiting.'}</span>
          </div>
          {todo.length > 0 && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {todo.map((a, i) => { const c = campaign(a); return <li key={a.id}><ActionItem a={a} n={i + 1} insight={c?.insight} media={c?.media} onDone={() => setTimeout(s.reload, 1500)} /></li> })}
            </ol>
          )}
          {everything.length > 0 && (
            <details className="an-more">
              <summary>See the {plural(everything.length, 'campaign')} behind Do it for me</summary>
              <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {everything.map((a) => { const c = campaign(a); return <li key={a.id}><ActionItem a={a} insight={c?.insight} media={c?.media} onDone={() => { setRan((m) => ({ ...m, [a.id]: { ok: true, text: 'Done.' } })); setTimeout(s.reload, 1500) }} /></li> })}
              </ol>
            </details>
          )}
          {(doneList.length > 0 || leftOff.length > 0) && (
            <details className="an-more">
              <summary>{[doneList.length ? `${doneList.length} done` : '', leftOff.length ? `${leftOff.length} left off, nothing to fix` : ''].filter(Boolean).join(' · ')}</summary>
              <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {[...doneList, ...leftOff].map((a) => <li key={a.id}><ActionItem a={ran[a.id] && !a.done ? { ...a, done: { note: ran[a.id].text, label: 'Done ✓' } } : a} compact /></li>)}
              </ol>
            </details>
          )}
          <Ideas data={data} />
          <Footnote data={data} />
        </section>
      )}

      <Campaigns app="all" title="Campaigns · every app" />
      {apps.some((a) => a.appStore || playOk(a.googlePlay ?? null)) && <GeoExplorer pw="session" app="all" title="All apps · world" />}
    </AdminShell>
  )
}
