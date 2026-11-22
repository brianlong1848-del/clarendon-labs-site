'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { AdminShell, AppTag, C, TILE, btn, labelStyle } from '@/components/AdminNav'
import { GeoExplorer } from '@/components/GeoExplorer'
import { Campaigns } from '@/components/analytics/Campaigns'
import { ThisWeekView, useInsights, type InsightAction } from '@/components/analytics/Insights'
import { AppleLogo, PlayLogo } from '@/components/StoreLogos'
import { peek, stash } from '@/lib/clientCache'

// ─── /analytics/<app> — one app, end to end (redesign 2026-11-22) ────────────
//
// Top to bottom, each block answers one question:
//   Header + status   — is it live, are ads on, how is it rated?
//   One-click         — the automations: pause every running campaign, delete
//                       every dead one, repost the winning ad organically,
//                       fresh analyst write-up, refresh, copy / open the store
//                       link. All run here through /api/ads/actions; nothing
//                       sends Brian into TikTok Ads or Meta Ads Manager.
//   KPI tiles         — 30-day downloads / proceeds / ad spend / audience, with
//                       a 7-day trend and a sparkline.
//   Momentum          — downloads per day (App Store + Google Play, stacked)
//                       above ad spend per day, same days, two charts (never a
//                       dual axis), one hover reading both.
//   Funnel            — seen → tapped → downloaded → paid, with the rate at
//                       each step and cost per download.
//   This week         — the analyst + rules-engine actions (shared state).
//   Campaigns, World  — unchanged components.
// Reads /api/analytics, /api/analytics/campaigns and /api/ads/insights; shows
// the last copy at once and refreshes behind it.

type Day = { date: string; installs: number; proceeds: number }
type GooglePlay = { package: string; reportDate: string | null; last30: { installs: number; proceeds: number; days: number }; series?: Day[]; otherCurrencies: string[] } | { package: string; error: string } | null
type AppRow = {
  id: string; name: string; accent: string
  appStore: { last30: { installs: number; proceeds: number }; reportDate: string; series?: Day[] } | null
  googlePlay?: GooglePlay
  instagram: { followers: number; posts: number; reach30d: number | null } | null
  facebook: { name: string; followers: number; posts30d: number | null } | null
}
type Camp = {
  platform: 'tiktok' | 'meta'; app_id: string | null; campaign_id: string; name: string; status?: string; promotion_id?: string
  spend_cents: number; impressions?: number; clicks?: number
  daily: { day: string; spend_cents: number; impressions?: number; clicks?: number }[]
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 })
const num = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(n >= 1 ? 1 : 2)}%`
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

const CSS = `
.ax-auto{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:10px}
.ax-tile{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;align-items:start;padding:14px;border-radius:14px;background:#fff;border:1px solid ${C.rule};transition:border-color .2s ease,box-shadow .25s ease,transform .2s ease}
.ax-tile:hover{border-color:color-mix(in srgb,var(--acc) 45%,${C.rule});box-shadow:0 10px 26px color-mix(in srgb,var(--acc) 14%,transparent);transform:translateY(-1px)}
.ax-tile[data-off="1"]{opacity:.62}
.ax-tile[data-off="1"]:hover{transform:none;box-shadow:none;border-color:${C.rule}}
.ax-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.ax-two{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:18px;align-items:stretch}
.ax-col:hover rect.ax-hit{fill:rgba(15,17,21,.045)}
@keyframes ax-up{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.ax-bar{transform-box:fill-box;transform-origin:bottom;animation:ax-up .7s cubic-bezier(.2,.7,.2,1) both}
@keyframes ax-glow{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--acc) 0%,transparent)}50%{box-shadow:0 0 30px 2px color-mix(in srgb,var(--acc) 45%,transparent)}}
.ax-icon{animation:ax-glow 4s ease-in-out infinite}
@media (max-width:1100px){.ax-two{grid-template-columns:minmax(0,1fr)}}
@media (max-width:900px){.ax-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
`

type Run = { busy?: boolean; confirm?: boolean; text?: string; ok?: boolean }

export default function AppAnalyticsPage() {
  const { app: appId } = useParams<{ app: string }>()
  const [app, setApp] = useState<AppRow | null>(null)
  const [camps, setCamps] = useState<Camp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [runs, setRuns] = useState<Record<string, Run>>({})
  const [hover, setHover] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const insights = useInsights(appId, '30d')

  const get = useCallback(async (path: string) => {
    const res = await fetch(path)
    if (res.status === 401) { window.location.href = '/login'; throw new Error('signin') }
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
    return res.json()
  }, [])

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError(null)
    const q = fresh ? '&fresh=1' : ''
    await Promise.all([
      get(`/api/analytics${fresh ? '?fresh=1' : ''}`).then((d) => { const row = (d.apps ?? []).find((a: AppRow) => a.id === appId) ?? null; setApp(row); stash(`app:${appId}`, row) }).catch((e) => e.message !== 'signin' && setError(e.message)),
      get(`/api/analytics/campaigns?app=${appId}&range=30d${q}`).then((d) => { setCamps(d.campaigns ?? []); stash(`camps:${appId}`, d.campaigns ?? []) }).catch(() => setCamps((c) => c ?? [])),
    ])
    setLoading(false)
  }, [appId, get])

  useEffect(() => {
    const a = peek<AppRow>(`app:${appId}`); if (a) setApp(a)
    const c = peek<Camp[]>(`camps:${appId}`); if (c) setCamps(c)
    load()
  }, [appId, load])

  const accent = app?.accent ?? C.mint
  const play = app?.googlePlay && !('error' in app.googlePlay) && app.googlePlay.reportDate ? app.googlePlay : null

  // ── The last 30 days, one row per day ──────────────────────────────────
  const days = useMemo(() => {
    const as = app?.appStore?.series ?? [], gp = play?.series ?? []
    const end = [as.at(-1)?.date, gp.at(-1)?.date, app?.appStore?.reportDate].filter(Boolean).sort().at(-1)
    if (!end) return []
    const byA = new Map(as.map((d) => [d.date, d])), byP = new Map(gp.map((d) => [d.date, d]))
    const spend = new Map<string, number>()
    for (const c of camps ?? []) for (const d of c.daily) spend.set(d.day, (spend.get(d.day) ?? 0) + d.spend_cents)
    return Array.from({ length: 30 }, (_, i) => {
      const date = addDays(end, i - 29)
      return { date, apple: byA.get(date)?.installs ?? 0, play: byP.get(date)?.installs ?? 0,
        proceeds: (byA.get(date)?.proceeds ?? 0) + (byP.get(date)?.proceeds ?? 0), spend: (spend.get(date) ?? 0) / 100 }
    })
  }, [app, play, camps])

  const t = useMemo(() => {
    const sum = (k: 'apple' | 'play' | 'proceeds' | 'spend', from: number, to: number) => days.slice(from, to).reduce((s, d) => s + d[k], 0)
    const installs30 = (app?.appStore?.last30.installs ?? 0) + (play?.last30.installs ?? 0)
    const proceeds30 = (app?.appStore?.last30.proceeds ?? 0) + (play?.last30.proceeds ?? 0)
    const spend30 = (camps ?? []).reduce((s, c) => s + c.spend_cents, 0) / 100
    const impressions = (camps ?? []).reduce((s, c) => s + (c.impressions ?? 0), 0)
    const clicks = (camps ?? []).reduce((s, c) => s + (c.clicks ?? 0), 0)
    const last7 = sum('apple', 23, 30) + sum('play', 23, 30), prev7 = sum('apple', 16, 23) + sum('play', 16, 23)
    const rev7 = sum('proceeds', 23, 30), revPrev7 = sum('proceeds', 16, 23)
    const sp7 = sum('spend', 23, 30), spPrev7 = sum('spend', 16, 23)
    const best = days.reduce<null | (typeof days)[number]>((b, d) => (!b || d.apple + d.play > b.apple + b.play ? d : b), null)
    return { installs30, proceeds30, spend30, impressions, clicks, last7, prev7, rev7, revPrev7, sp7, spPrev7, best }
  }, [days, app, play, camps])

  // ── One-click automations ──────────────────────────────────────────────
  const running = (camps ?? []).filter((c) => c.status === 'running')
  const actions = insights.data?.actions ?? []
  const dead = actions.filter((a) => a.kind === 'delete_campaign' && !a.done && !runs[a.id]?.ok)
  const winner = actions.find((a) => a.kind === 'reuse_angle' && a.href)
  const post = (body: Record<string, unknown>) => fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`); return b })
  const many = async (key: string, jobs: (() => Promise<unknown>)[], done: (ok: number, n: number) => string) => {
    setRuns((r) => ({ ...r, [key]: { busy: true } }))
    let ok = 0; const errs: string[] = []
    for (const j of jobs) { try { await j(); ok++ } catch (e) { errs.push((e as Error).message) } }
    setRuns((r) => ({ ...r, [key]: { ok: ok === jobs.length, text: done(ok, jobs.length) + (errs.length ? ` ${errs[0]}` : '') } }))
    setTimeout(() => { load(true); insights.regenerate !== undefined && void 0 }, 1200)
  }
  const pauseAll = () => many('pause', running.map((c) => () => post({ kind: 'pause', platform: c.platform, campaign_id: c.campaign_id, app_id: appId, promotion_id: c.promotion_id })),
    (ok, n) => ok === n ? `Paused ${n} campaign${n === 1 ? '' : 's'}. Nothing for ${app?.name ?? 'this app'} is spending now.` : `Paused ${ok} of ${n}.`)
  const deleteDead = () => many('delete', dead.map((a: InsightAction) => async () => { await post({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id }); setRuns((r) => ({ ...r, [a.id]: { ok: true } })) }),
    (ok, n) => ok === n ? `Deleted ${n} dead campaign${n === 1 ? '' : 's'}.` : `Deleted ${ok} of ${n}.`)
  const copyLink = async () => { try { await navigator.clipboard.writeText(`https://clarendon.dev/get/${appId}`); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ } }

  const label = labelStyle
  const status = [
    app?.appStore || play ? `Live on ${[app?.appStore && 'the App Store', play && 'Google Play'].filter(Boolean).join(' + ')}` : 'Not on a store yet',
    running.length ? `${running.length} campaign${running.length === 1 ? '' : 's'} running` : camps ? 'ads off' : null,
  ].filter(Boolean).join(' · ')

  const delta = (now: number, prev: number, invert = false) => {
    if (!prev) return <span style={{ fontSize: 12, color: C.soft, fontWeight: 600 }}>{now ? 'new this week' : 'flat this week'}</span>
    const d = Math.round(((now - prev) / prev) * 100), good = invert ? d <= 0 : d >= 0
    return <span style={{ fontSize: 12, fontWeight: 700, color: good ? C.teal : C.loss }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}% <span style={{ color: C.soft, fontWeight: 500 }}>last 7d vs prior</span></span>
  }
  const spark = (vals: number[], color: string) => {
    const max = Math.max(...vals, 0)
    if (!vals.length || max === 0) return <div style={{ height: 26 }} />
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${24 - (v / max) * 22}`).join(' ')
    return <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: '100%', height: 26, display: 'block' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  }
  const kpi = (i: number, cap: string, v: string, foot: ReactNode, chart?: ReactNode) => (
    <div data-card style={{ background: TILE[i].bg, border: `1px solid ${TILE[i].line}`, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
      <div style={label}>{cap}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {chart}
      <div style={{ minHeight: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{foot}</div>
    </div>
  )
  const auto = (key: string, glyph: string, title: string, what: string, control: ReactNode, off = false) => (
    <div key={key} className="ax-tile" data-off={off ? '1' : undefined} style={{ ['--acc' as string]: accent } as CSSProperties}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 16, background: `${accent}1A`, color: C.ink }}>{glyph}</span>
      <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
        <div>
          <b style={{ fontSize: 13.5 }}>{title}</b>
          <div style={{ fontSize: 12, color: C.ink2, marginTop: 2, lineHeight: 1.4 }}>{runs[key]?.text ? <span style={{ color: runs[key].ok ? C.teal : C.red, fontWeight: 600 }}>{runs[key].text}</span> : what}</div>
        </div>
        <div>{control}</div>
      </div>
    </div>
  )
  const small: CSSProperties = { padding: '6px 12px', fontSize: 12.5 }
  const confirmRow = (key: string, verb: string, run: () => void, danger = true) => runs[key]?.confirm ? (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <button style={{ ...btn('ghost'), ...small, ...(danger ? { color: C.red, borderColor: C.red } : {}) }} onClick={() => { setRuns((r) => ({ ...r, [key]: {} })); run() }}>{verb}</button>
      <button style={{ ...btn('ghost'), ...small }} onClick={() => setRuns((r) => ({ ...r, [key]: {} }))}>Cancel</button>
    </span>
  ) : runs[key]?.busy ? <span style={{ fontSize: 12.5, color: C.teal, fontWeight: 600 }}>Working…</span> : null

  // ── Momentum chart geometry ─────────────────────────────────────────────
  const W = 720, H1 = 132, H2 = 56, GAP = 26, colW = W / 30
  const maxDl = Math.max(1, ...days.map((d) => d.apple + d.play))
  const maxSp = Math.max(1, ...days.map((d) => d.spend))
  const hd = hover != null ? days[hover] : null

  return (
    <AdminShell
      title={app?.name ?? 'App'}
      subtitle={app ? status : 'Loading…'}
      actions={<>
        {loading && app && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.teal, background: C.mintTint, borderRadius: 99, padding: '6px 12px' }}>Updating…</span>}
        <Link href="/analytics" style={{ ...btn('ghost'), textDecoration: 'none' }}>All apps</Link>
      </>}
    >
      <style>{CSS}</style>
      {error && <p style={{ color: C.red, fontSize: 14, margin: 0 }}>{error}</p>}

      {/* One-click */}
      <section aria-label="One-click actions" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ax-icon" style={{ ['--acc' as string]: accent, borderRadius: 10, display: 'inline-flex' } as CSSProperties}><AppTag id={appId} name="" size={26} /></span>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>One click</h2>
          <span style={{ fontSize: 12.5, color: C.soft }}>runs here — no Ads Manager, no TikTok Ads</span>
        </div>
        <div className="ax-auto">
          {auto('pause', '⏸', running.length ? `Pause all ${running.length} running` : 'Pause all ads', running.length ? 'Stops every campaign still switched on for this app, TikTok and Meta.' : 'Nothing is running — no spend going out.',
            confirmRow('pause', `Pause ${running.length}`, pauseAll) ?? <button style={{ ...btn('ghost'), ...small, ...(running.length ? { color: C.red } : {}) }} disabled={!running.length} onClick={() => setRuns((r) => ({ ...r, pause: { confirm: true } }))}>{running.length ? 'Pause all' : 'All off'}</button>, !running.length)}
          {auto('delete', '🗑', dead.length ? `Delete ${dead.length} dead campaign${dead.length === 1 ? '' : 's'}` : 'Clean up dead campaigns', dead.length ? 'Zero impressions for over a week. Gone for good, so they can’t switch back on.' : 'No dead campaigns — nothing to clean up.',
            confirmRow('delete', `Delete ${dead.length}`, deleteDead) ?? <button style={{ ...btn('ghost'), ...small, ...(dead.length ? { color: C.red } : {}) }} disabled={!dead.length} onClick={() => setRuns((r) => ({ ...r, delete: { confirm: true } }))}>{dead.length ? 'Delete' : 'Clean'}</button>, !dead.length)}
          {auto('winner', '★', 'Repost the winning ad', winner ? `${winner.campaign_label ?? winner.campaign_name} earned the most attention. Post it organically, no spend.` : 'No ad has earned a repost yet.',
            winner?.href ? <Link href={winner.href} style={{ ...btn('mint'), ...small, textDecoration: 'none', display: 'inline-block' }}>Open in Post</Link> : <button style={{ ...btn('ghost'), ...small }} disabled>Nothing yet</button>, !winner)}
          {auto('write', '✎', 'Fresh analyst write-up', 'Claude reads today’s numbers and rewrites This week (a minute or two).',
            <button style={{ ...btn('ghost'), ...small }} disabled={insights.regenerating} onClick={insights.regenerate}>{insights.regenerating ? 'Writing…' : 'Write it'}</button>)}
          {auto('refresh', '↻', 'Pull live numbers', 'Skips the caches: App Store, Google Play, Instagram, TikTok and Meta now.',
            <button style={{ ...btn('ghost'), ...small }} disabled={loading} onClick={() => load(true)}>{loading ? 'Pulling…' : 'Refresh'}</button>)}
          {auto('link', '🔗', 'Share the download link', 'One link that sends iPhone to the App Store and Android to Google Play.',
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button style={{ ...btn('ghost'), ...small }} onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
              <a href={`/get/${appId}`} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), ...small, textDecoration: 'none' }}>Open ↗</a>
            </span>)}
        </div>
      </section>

      {/* KPIs */}
      <div className="ax-kpis">
        {kpi(0, 'Downloads · 30 days', app ? num(t.installs30) : '—', <>{delta(t.last7, t.prev7)}{play && <span style={{ display: 'inline-flex', gap: 8, fontSize: 12, color: C.ink2 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><AppleLogo size={10} />{num(app?.appStore?.last30.installs ?? 0)}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PlayLogo size={9} />{num(play.last30.installs)}</span></span>}</>,
          spark(days.map((d) => d.apple + d.play), accent))}
        {kpi(1, 'Proceeds · 30 days', app ? money(t.proceeds30) : '—', t.proceeds30 || t.rev7 ? delta(t.rev7, t.revPrev7) : <span style={{ fontSize: 12, color: C.soft }}>After the stores’ cut</span>, spark(days.map((d) => d.proceeds), C.teal))}
        {kpi(2, 'Ad spend · 30 days', camps ? money(t.spend30) : '—',
          <>{t.spend30 > 0 && t.installs30 > 0 ? <span style={{ fontSize: 12, color: C.ink2, fontWeight: 600 }}>{money(t.spend30 / t.installs30)} per download</span> : <span style={{ fontSize: 12, color: C.soft }}>{running.length ? `${running.length} running` : 'All ads off'}</span>}
            {t.proceeds30 - t.spend30 < 0 && <span style={{ fontSize: 12, color: C.loss, fontWeight: 700 }}>{money(t.proceeds30 - t.spend30)} net</span>}</>,
          spark(days.map((d) => d.spend), C.indigo))}
        {kpi(3, 'Audience', app ? num((app.instagram?.followers ?? 0) + (app.facebook?.followers ?? 0)) : '—',
          <span style={{ fontSize: 12, color: C.ink2 }}>{app?.instagram ? `${num(app.instagram.followers)} IG` : 'IG not linked'} · {app?.facebook ? `${num(app.facebook.followers)} FB` : 'FB not linked'}{app?.instagram?.reach30d != null ? ` · ${num(app.instagram.reach30d)} reached` : ''}</span>)}
      </div>
      {app?.googlePlay && 'error' in app.googlePlay && (
        <p style={{ margin: 0, fontSize: 12.5, color: C.soft, display: 'flex', alignItems: 'center', gap: 6 }}><PlayLogo size={11} />Google Play: {app.googlePlay.error}</p>
      )}

      {/* Momentum + funnel */}
      <div className="ax-two">
        <section data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20, display: 'grid', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Momentum</h2>
            <span style={{ fontSize: 12.5, color: C.soft }}>
              {hd ? <><b style={{ color: C.ink }}>{shortDay(hd.date)}</b> · {num(hd.apple + hd.play)} download{hd.apple + hd.play === 1 ? '' : 's'}{play ? ` (${hd.apple} iOS, ${hd.play} Android)` : ''} · {money(hd.spend)} ad spend{hd.proceeds ? ` · ${money(hd.proceeds)} proceeds` : ''}</>
                : t.best && t.best.apple + t.best.play > 0 ? <>Best day {shortDay(t.best.date)}: {num(t.best.apple + t.best.play)} downloads · hover a day</> : 'Last 30 days · hover a day'}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', gap: 12, fontSize: 12, color: C.ink2 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: accent }} />App Store</span>
              {play && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: accent, opacity: .45 }} />Google Play</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: C.indigo }} />Ad spend</span>
            </span>
          </div>
          {days.length ? (
            <svg viewBox={`0 0 ${W} ${H1 + GAP + H2 + 18}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img"
              aria-label={`Downloads and ad spend per day, last 30 days. ${num(t.installs30)} downloads, ${money(t.spend30)} spent.`} onMouseLeave={() => setHover(null)}>
              <text x={0} y={-4} fontSize={10} fill={C.soft} fontFamily={C.mono}>DOWNLOADS · max {maxDl}</text>
              <line x1={0} x2={W} y1={H1} y2={H1} stroke={C.rule2} />
              <text x={0} y={H1 + GAP - 4} fontSize={10} fill={C.soft} fontFamily={C.mono}>AD SPEND · max {money(maxSp)}</text>
              <line x1={0} x2={W} y1={H1 + GAP + H2} y2={H1 + GAP + H2} stroke={C.rule2} />
              {days.map((d, i) => {
                const x = i * colW + 2, w = colW - 4
                const ha = (d.apple / maxDl) * (H1 - 6), hp = (d.play / maxDl) * (H1 - 6), hs = (d.spend / maxSp) * (H2 - 4)
                const on = hover === i
                return (
                  <g key={d.date} className="ax-col" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${shortDay(d.date)}: ${d.apple + d.play} downloads, ${money(d.spend)} spent`}>
                    <rect className="ax-hit" x={i * colW} y={0} width={colW} height={H1 + GAP + H2} fill={on ? 'rgba(15,17,21,.045)' : 'transparent'} rx={4} />
                    {ha > 0 && <rect className="ax-bar" x={x} y={H1 - ha} width={w} height={ha} rx={Math.min(4, w / 2)} fill={accent} style={{ animationDelay: `${i * 0.012}s` }} />}
                    {hp > 0 && <rect className="ax-bar" x={x} y={H1 - ha - hp - (ha > 0 ? 2 : 0)} width={w} height={hp} rx={Math.min(4, w / 2)} fill={accent} opacity={0.45} style={{ animationDelay: `${i * 0.012}s` }} />}
                    {hs > 0 && <rect className="ax-bar" x={x} y={H1 + GAP + H2 - hs} width={w} height={hs} rx={Math.min(4, w / 2)} fill={C.indigo} opacity={0.85} style={{ animationDelay: `${0.2 + i * 0.012}s` }} />}
                    {(i === 0 || i === 29 || i % 7 === 1) && <text x={i * colW + colW / 2} y={H1 + GAP + H2 + 14} fontSize={10} fill={C.soft} textAnchor="middle">{shortDay(d.date)}</text>}
                  </g>
                )
              })}
            </svg>
          ) : <div style={{ height: 200, borderRadius: 12, background: C.card2, display: 'grid', placeItems: 'center', color: C.soft, fontSize: 13 }}>{app ? 'No store data for this app yet.' : 'Loading…'}</div>}
        </section>

        <section data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20, display: 'grid', gap: 12, alignContent: 'start' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Funnel · 30 days</h2>
          {(() => {
            const steps: { k: string; v: string; rate?: string; why?: string }[] = [
              { k: 'Saw an ad', v: num(t.impressions) },
              { k: 'Tapped', v: num(t.clicks), rate: t.impressions ? pct((t.clicks / t.impressions) * 100) : undefined, why: 'tap rate' },
              { k: 'Downloaded', v: num(t.installs30), rate: t.clicks ? pct((t.installs30 / t.clicks) * 100) : undefined, why: 'per tap' },
              { k: 'Paid', v: money(t.proceeds30), rate: t.installs30 ? `${money(t.proceeds30 / t.installs30)}` : undefined, why: 'per download' },
            ]
            return (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
                {steps.map((s, i) => (
                  <li key={s.k} style={{ display: 'grid', gap: 2 }}>
                    {s.rate && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 15px', fontSize: 11.5, color: C.soft }}>
                      <span style={{ width: 1, height: 16, background: C.rule2 }} />↓ <b style={{ color: C.ink2, fontWeight: 700 }}>{s.rate}</b> {s.why}
                    </div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: i === 0 ? C.card2 : `color-mix(in srgb, ${accent} ${6 + i * 5}%, white)` }}>
                      <span style={{ fontSize: 13, color: C.ink2, flex: 1 }}>{s.k}</span>
                      <b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{s.v}</b>
                    </div>
                  </li>
                ))}
              </ol>
            )
          })()}
          <p style={{ margin: 0, fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>
            Downloads and proceeds count every source, not only ads, so “per tap” is a ceiling.{t.spend30 > 0 ? ` Ads cost ${money(t.spend30)}${t.installs30 ? ` — ${money(t.spend30 / t.installs30)} per download at best` : ''}.` : ''}
          </p>
        </section>
      </div>

      <section aria-label="This week" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
        <ThisWeekInner s={insights} onDone={() => load(true)} />
      </section>
      <Campaigns app={appId} title={`Campaigns · ${app?.name ?? appId}`} />
      <GeoExplorer pw="session" app={appId} accent={accent} title="World" />
    </AdminShell>
  )
}

/** This week without its own outer card (the page provides one). */
function ThisWeekInner({ s, onDone }: { s: ReturnType<typeof useInsights>; onDone: () => void }) {
  return <div style={{ margin: -22 }}><ThisWeekView s={s} onDone={onDone} /></div>
}
