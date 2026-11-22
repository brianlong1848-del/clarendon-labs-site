'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { clearStudioCache, peek, stash } from '@/lib/clientCache'
import { AdminShell, AppTag, C, TILE, STUDIO_APPS, appAccent, btn, labelStyle } from '@/components/AdminNav'
import type { InsightAction } from '@/components/analytics/Insights'
import { AppleLogo, PlayLogo } from '@/components/StoreLogos'
import { PlatformGlyph } from '@/components/post/shared'

// ─── /admin — the studio console (redesign 2026-11-22) ───────────────────────
//
// One screen, three questions, top to bottom:
//   1. Pulse     — how is the studio doing this week? Four KPI tiles, each with
//                  a bar split by app colour so you see who drove the number.
//   2. Needs you — everything waiting on Brian, across apps, and it RUNS HERE:
//                  ad recommendations (pause, delete a dead campaign, budget…)
//                  post to /api/ads/actions with an inline confirm; several of
//                  the same kind get one "Delete all 3" button. Nothing sends
//                  him to TikTok Ads or Meta Ads Manager to do it by hand.
//   3. Apps      — one lane per app (accent edge, store split, ads, rating, its
//                  server's headline stat) + the live activity feed beside it.
// Then Gag Order's card suggestions and live community cards, unchanged in
// behaviour. Data: /api/console (src/lib/consoleSummary.ts), shown from the
// last copy at once and refreshed behind an "Updating…" pill.

type Suggestion = {
  id: string; message: string; audience: string | null; player_name: string | null; platform: string | null; created_at: string
  thank_you_draft?: string
  reachable?: boolean
}
type LiveCard = { id: string; text: string; pack_id: string; tier: string; format: string; active: boolean; credit_name?: string | null }
type Stat = { label: string; value: number | string; delta?: string; hint?: string; format?: 'usd' }
type Recent = { icon?: string; title: string; detail?: string; at: string }
type AppState = {
  id: string; name: string; accent: string; ok: boolean; ms: number; error?: string
  pending: Suggestion[]; live: LiveCard[]; stats?: Stat[]; recent?: Recent[]
}
type Missing = { id: string; name: string; accent: string }
type ServerState = { connected: boolean; ok?: boolean; ms?: number; error?: string; stats?: Stat[]; recent?: Recent[]; note?: string; connect?: string }
type Card = {
  id: string; name: string; accent: string
  store: { installs7: number; installs_prev7: number; proceeds7: number; proceeds_prev7: number; report_date?: string; rating: number | null; new_reviews7: number; on_store: boolean } | null
  play?: { installs7: number; installs_prev7: number; proceeds7?: number; proceeds_prev7?: number; other_currencies?: string[]; report_date?: string; connected: boolean; error?: string } | null
  ads: { spend7_cents: number; active_campaigns: number; campaigns: number } | null
  action: InsightAction | null
  /** All recommended actions, best first (older servers only send `action`). */
  actions?: InsightAction[]
  server: ServerState
}
type Summary = { apps: number; servers_connected: number; last_sync: string }
type Draft = { text: string; pack: string; tier: string; format: string; note: string; noteEdited: boolean; credit: boolean }

const PACKS = [['base', 'Everyone'], ['afterdark', 'After Dark'], ['gay', 'Gay'], ['lesbian', 'Lesbian'], ['transenby', 'Dolls']] as const
const TIERS = [['free', 'Free'], ['core', 'Core'], ['afterdark', 'After Dark']] as const
const FORMATS = [['vote', 'Vote'], ['action', 'Action']] as const
const ORDER = ['rolligan', 'gagorder', 'yulepick', 'borea', 'jinglewire']

const packPhrase = (pack: string) => pack === 'base'
  ? 'for every Gag Order table'
  : `in the ${PACKS.find(([v]) => v === pack)?.[1] ?? pack} pack for every Gag Order table`
const quoted = (t: string) => `“${t.trim().replace(/\{player\}/g, '___')}”`
function retarget(base: string, s: Suggestion, startPack: string, text: string, pack: string) {
  return base.replace(quoted(s.message), quoted(text)).replace(packPhrase(startPack), packPhrase(pack))
}
const firstName = (n: string | null) => {
  const f = (n ?? '').trim().split(/\s+/)[0] ?? ''
  return f ? f.charAt(0).toUpperCase() + f.slice(1, 24) : null
}
const startPack = (s: Suggestion) => s.audience && PACKS.some(([v]) => v === s.audience) ? s.audience : 'base'

const fmtNum = (v: number | string, format?: 'usd') =>
  typeof v !== 'number' ? v : format === 'usd' ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : v.toLocaleString('en-US')
const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v % 1 ? 2 : 0 })
const int = (v: number) => v.toLocaleString('en-US')
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const pctDelta = (now: number, prev: number) => prev > 0 ? Math.round(((now - prev) / prev) * 100) : null
function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }).format(new Date()))
  return h < 5 ? 'Up late, Brian' : h < 12 ? 'Good morning, Brian' : h < 17 ? 'Good afternoon, Brian' : 'Good evening, Brian'
}

// Actions Brian already ran stay hidden here for 3 days even if a cached
// campaigns read still lists them (TikTok/Meta can lag a few minutes).
const HANDLED_KEY = 'clarendon:console:handled'
const HANDLED_TTL = 3 * 86400000
function readHandled(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => Date.now() - t < HANDLED_TTL))
  } catch { return {} }
}
function writeHandled(h: Record<string, number>) { try { localStorage.setItem(HANDLED_KEY, JSON.stringify(h)) } catch { /* private mode */ } }

const VERB: Partial<Record<InsightAction['kind'], [string, string]>> = {
  delete_campaign: ['Delete', 'dead campaign'], pause: ['Pause', 'campaign'], resume: ['Resume', 'campaign'],
  raise_budget: ['Raise', 'budget'], lower_budget: ['Lower', 'budget'],
}
const DESTRUCTIVE = new Set<InsightAction['kind']>(['delete_campaign', 'pause'])

type RunState = { phase: 'confirm' | 'busy' | 'done' | 'error'; text?: string }

const CSS = `
.cx-pulse{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.cx-split{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr);gap:18px;align-items:start}
.cx-lane{display:grid;grid-template-columns:minmax(170px,1.2fr) repeat(3,minmax(0,1fr)) minmax(0,.8fr) minmax(0,1.25fr) 18px;gap:18px;align-items:center;
  padding:16px 18px 16px 20px;background:#fff;border:1px solid ${C.rule};border-radius:18px;cursor:pointer;position:relative;overflow:hidden}
.cx-lane::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--acc)}
.cx-lane::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s ease;background:radial-gradient(600px 120px at 0% 50%,color-mix(in srgb,var(--acc) 10%,transparent),transparent)}
.cx-lane:hover::after{opacity:1}
.cx-lane:hover{border-color:color-mix(in srgb,var(--acc) 40%,${C.rule})}
.cx-lane .cx-go{transition:transform .2s ease;color:${C.faint}}
.cx-lane:hover .cx-go{transform:translateX(3px);color:${C.ink}}
.cx-head{display:none}
.cx-q{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 14px;border-radius:12px;background:${C.card2};position:relative;overflow:hidden;
  transition:opacity .35s ease,transform .35s ease,background-color .25s ease}
.cx-q[data-done="1"]{background:${C.mintTint}}
.cx-q:hover{background:#EBEEF2}
.cx-q[data-done="1"]:hover{background:${C.mintTint}}
@keyframes cx-breathe{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,0)}50%{box-shadow:0 0 0 6px rgba(79,70,229,.10),0 0 28px rgba(79,70,229,.22)}}
.cx-hot{animation:cx-breathe 3.2s ease-in-out infinite}
@keyframes cx-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cx-bar>span{transform-origin:left;animation:cx-grow .9s cubic-bezier(.2,.7,.2,1) both}
@keyframes cx-spin{to{transform:rotate(360deg)}}
.cx-spin{width:10px;height:10px;border-radius:50%;border:2px solid rgba(11,122,131,.25);border-top-color:${C.teal};animation:cx-spin .8s linear infinite;display:inline-block}
@keyframes cx-live{0%{box-shadow:0 0 0 0 rgba(11,122,131,.5)}70%{box-shadow:0 0 0 7px rgba(11,122,131,0)}100%{box-shadow:0 0 0 0 rgba(11,122,131,0)}}
.cx-livedot{animation:cx-live 2.2s ease-out infinite}
@media (max-width:1180px){.cx-split{grid-template-columns:minmax(0,1fr)}}
@media (min-width:1101px){.cx-head{display:grid}}
@media (max-width:1100px){
  .cx-lane{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .cx-lane>.cx-id{grid-column:1/-1}.cx-lane>.cx-pulsecell{grid-column:1/-1}.cx-lane>.cx-go{display:none}
  .cx-cell-label{display:block!important}
}
@media (max-width:900px){.cx-pulse{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:600px){.cx-q{grid-template-columns:minmax(0,1fr)}.cx-q>.cx-qbtn{justify-self:start}.cx-q>.cx-qicon{display:none}}
`

export default function ConsolePage() {
  const router = useRouter()
  const [apps, setApps] = useState<AppState[]>([])
  const [, setMissing] = useState<Missing[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [handled, setHandled] = useState<Record<string, number>>({})
  const [batch, setBatch] = useState<{ kind: InsightAction['kind']; phase: 'confirm' | 'busy' } | null>(null)
  const [hello, setHello] = useState('Console')

  useEffect(() => { setHandled(readHandled()); setHello(greeting()) }, [])

  type Payload = { apps?: AppState[]; missing?: Missing[]; cards?: Card[]; summary?: Summary | null; cached_at?: string }
  const apply = useCallback((data: Payload) => {
    setApps(data.apps ?? []); setMissing(data.missing ?? []); setCards(data.cards ?? []); setSummary(data.summary ?? null); setLoaded(true)
    setDrafts((prev) => {
      const next: Record<string, Draft> = {}
      for (const app of (data.apps ?? []) as AppState[]) for (const s of app.pending) {
        const k = `${app.id}:${s.id}`
        next[k] = prev[k] ?? { text: s.message, pack: startPack(s), tier: 'free', format: /\{player\}/.test(s.message) ? 'action' : 'vote', note: s.thank_you_draft ?? '', noteEdited: false, credit: true }
      }
      return next
    })
  }, [])

  const load = useCallback(async (fresh = false, followUp = 0) => {
    if (!followUp) setLoading(true)
    setError(null)
    const res = await fetch(`/api/console${fresh ? '?fresh=1' : ''}`).catch(() => null)
    setLoading(false)
    if (!res) { setError('Could not reach the console API.'); return }
    if (res.status === 401) { window.location.href = '/login'; return }
    const data: Payload = await res.json()
    apply(data); stash('console', data)
    if (!fresh && followUp < 2 && data.cached_at && Date.now() - Date.parse(data.cached_at) > 75_000) setTimeout(() => load(false, followUp + 1), followUp ? 17_000 : 8_000)
  }, [apply])
  useEffect(() => { const seen = peek<Payload>('console'); if (seen?.cards) apply(seen) }, [apply])
  useEffect(() => { load() }, [load])

  // Gag Order suggestions / live cards
  const act = async (appId: string, key: string, payload: Record<string, unknown>) => {
    setBusy(key); setToast(null)
    const res = await fetch('/api/console', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, ...payload }) }).catch(() => null)
    const out = await res?.json().catch(() => ({})) ?? {}
    setBusy(null)
    if (!res?.ok) { setToast({ text: out.error ?? 'That didn’t go through.', tone: 'bad' }); return }
    if (payload.action === 'approve') {
      const base = out.voiced ? `Published ${out.id ?? 'card'} — voiced and live now.` : `Published ${out.id ?? 'card'} — live now, but the voice clip failed.`
      const who = typeof out.credit === 'string' ? out.credit : 'They'
      const thanks = out.thanked ? ` ${who} will see your thank-you next time they open the app.` : ' (Their app version can’t receive the thank-you.)'
      setToast({ text: base + thanks, tone: out.voiced ? 'ok' : 'bad' })
    }
    if (payload.action === 'reject') setToast({ text: 'Suggestion rejected.', tone: 'ok' })
    if (payload.action === 'retire') setToast({ text: 'Card retired.', tone: 'ok' })
    load(true)
  }

  // ── Ad actions, run in place ────────────────────────────────────────────
  const runAd = async (a: InsightAction): Promise<boolean> => {
    setRuns((r) => ({ ...r, [a.id]: { phase: 'busy' } }))
    try {
      const res = await fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id, promotion_id: a.promotion_id, amount_cents: a.amount_cents,
          source_ids: { advertiser_id: a.advertiser_id, adgroup_ids: a.adgroup_ids, ad_ids: a.ad_ids, item_id: a.item_id, post_id: a.post_id } }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setRuns((r) => ({ ...r, [a.id]: { phase: 'done', text: body.message ?? 'Done.' } }))
      setHandled((h) => { const n = { ...h, [a.id]: Date.now() }; writeHandled(n); return n })
      return true
    } catch (e) {
      setRuns((r) => ({ ...r, [a.id]: { phase: 'error', text: (e as Error).message } }))
      return false
    }
  }

  const pending = apps.flatMap((a) => a.pending.map((s) => ({ app: a, s })))
  const live = apps.flatMap((a) => a.live.filter((c) => c.active !== false).map((c) => ({ app: a, c })))
    .filter(({ c }) => !query || c.text.toLowerCase().includes(query.toLowerCase()))
  const sorted = useMemo(() => [...cards].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)), [cards])

  // Everything waiting on Brian. Ad actions that change something (button, no
  // link) run here; link actions (reuse an angle in /post) open in place.
  const adQueue = useMemo(() => {
    const all = sorted.flatMap((c) => (c.actions ?? (c.action ? [c.action] : [])))
    const seen = new Set<string>()
    return all.filter((a) => {
      if (seen.has(a.id)) return false; seen.add(a.id)
      if (!a.button || a.done) return false
      return !handled[a.id] || runs[a.id]?.phase === 'done'
    }).sort((x, y) => y.score - x.score)
  }, [sorted, handled, runs])
  const openAds = adQueue.filter((a) => runs[a.id]?.phase !== 'done')
  const serverIssues = sorted.filter((c) => c.server.connected && !c.server.ok)
  const needCount = openAds.length + (pending.length ? 1 : 0) + serverIssues.length
  const groups = useMemo(() => {
    const m = new Map<InsightAction['kind'], InsightAction[]>()
    for (const a of openAds) if (!a.href && VERB[a.kind]) m.set(a.kind, [...(m.get(a.kind) ?? []), a])
    return [...m.entries()].filter(([, v]) => v.length >= 2)
  }, [openAds])

  const runBatch = async (kind: InsightAction['kind']) => {
    const list = openAds.filter((a) => a.kind === kind && !a.href)
    setBatch({ kind, phase: 'busy' })
    let ok = 0
    for (const a of list) if (await runAd(a)) ok++
    setBatch(null)
    setToast({ text: ok === list.length ? `${VERB[kind]?.[0] ?? 'Ran'}: ${ok} of ${list.length} done.` : `${ok} of ${list.length} went through — the rest say why below.`, tone: ok === list.length ? 'ok' : 'bad' })
    setTimeout(() => load(true), 1500)
  }

  // ── Pulse totals ─────────────────────────────────────────────────────────
  const pulse = useMemo(() => {
    const playOk = (c: Card) => c.play && c.play.connected && !c.play.error ? c.play : null
    const per = sorted.map((c) => {
      const p = playOk(c)
      return {
        id: c.id, accent: c.accent ?? appAccent(c.id),
        dl: (c.store?.installs7 ?? 0) + (p?.installs7 ?? 0), dlPrev: (c.store?.installs_prev7 ?? 0) + (p?.installs_prev7 ?? 0),
        rev: (c.store?.proceeds7 ?? 0) + (p?.proceeds7 ?? 0), revPrev: (c.store?.proceeds_prev7 ?? 0) + (p?.proceeds_prev7 ?? 0),
        spend: (c.ads?.spend7_cents ?? 0) / 100, live: c.ads?.active_campaigns ?? 0,
      }
    })
    const sum = (k: 'dl' | 'dlPrev' | 'rev' | 'revPrev' | 'spend' | 'live') => per.reduce((t, x) => t + x[k], 0)
    return { per, dl: sum('dl'), dlPrev: sum('dlPrev'), rev: sum('rev'), revPrev: sum('revPrev'), spend: sum('spend'), live: sum('live') }
  }, [sorted])

  const feed = useMemo(() => sorted.flatMap((c) => (c.server.recent ?? []).map((r) => ({ ...r, app: c }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 9), [sorted])

  const label = labelStyle
  const synced = summary ? new Date(summary.last_sync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
  const subtitle = !loaded ? 'Pulling every app’s numbers…'
    : [needCount ? `${needCount} thing${needCount === 1 ? '' : 's'} need${needCount === 1 ? 's' : ''} you` : 'Nothing needs you right now', `${summary?.apps ?? sorted.length} apps`, synced && `synced ${synced}`].filter(Boolean).join(' · ')

  const sectionHead = (title: string, aside?: ReactNode, id?: string) => (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 12, scrollMarginTop: 24 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{title}</h2>
      <span style={{ flex: 1, height: 1, background: C.rule }} />{aside}
    </div>
  )
  const chips = (value: string, options: readonly (readonly [string, string])[], onChange: (v: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          style={{ border: `1px solid ${value === v ? C.ink : C.rule2}`, background: value === v ? C.ink : C.card, color: value === v ? C.paper : C.ink2,
                   borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>{l}</button>
      ))}
    </div>
  )

  // A bar split by app colour: who made this number.
  const shareBar = (parts: { id: string; accent: string; v: number }[]) => {
    const total = parts.reduce((t, p) => t + Math.max(0, p.v), 0)
    return (
      <div className="cx-bar" style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', background: 'rgba(15,17,21,.07)', gap: total ? 2 : 0 }}>
        {total > 0 && parts.filter((p) => p.v > 0).map((p, i) => (
          <span key={p.id} title={`${STUDIO_APPS.find((a) => a.id === p.id)?.name ?? p.id}: ${Math.round((p.v / total) * 100)}%`}
            style={{ width: `${(p.v / total) * 100}%`, background: p.accent, animationDelay: `${0.15 + i * 0.08}s` }} />
        ))}
      </div>
    )
  }
  const deltaChip = (now: number, prev: number) => {
    const d = pctDelta(now, prev)
    if (d == null) return <span style={{ fontSize: 12, color: C.soft, fontWeight: 600 }}>{now > 0 ? 'new this week' : 'no change'}</span>
    const up = d >= 0
    return <span style={{ fontSize: 12, fontWeight: 700, color: up ? C.teal : C.loss }}>{up ? '▲' : '▼'} {Math.abs(d)}% <span style={{ color: C.soft, fontWeight: 500 }}>vs prior 7d</span></span>
  }
  const tile = (i: number, l: string, value: string, foot: ReactNode, bar?: ReactNode, extra?: { className?: string; onClick?: () => void; style?: CSSProperties }) => (
    <div data-card className={extra?.className} onClick={extra?.onClick} role={extra?.onClick ? 'button' : undefined} tabIndex={extra?.onClick ? 0 : undefined}
      onKeyDown={(e) => { if (extra?.onClick && e.key === 'Enter') extra.onClick() }}
      style={{ background: TILE[i].bg, border: `1px solid ${TILE[i].line}`, borderRadius: 18, padding: '16px 18px', display: 'grid', gap: 10, alignContent: 'start', minWidth: 0, cursor: extra?.onClick ? 'pointer' : 'default', ...extra?.style }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {bar}
      <div style={{ minHeight: 18 }}>{foot}</div>
    </div>
  )

  return (
    <AdminShell
      title={hello}
      subtitle={subtitle}
      actions={<>
        {loading && loaded && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: C.teal, background: C.mintTint, borderRadius: 99, padding: '6px 12px' }}><span className="cx-spin" />Updating…</span>}
        <button style={btn('ghost')} disabled={loading} onClick={() => load(true)}>Refresh</button>
        <button style={btn('ghost')} onClick={() => { clearStudioCache(); fetch('/auth/signout', { method: 'POST' }).finally(() => { window.location.href = '/login' }) }}>Sign out</button>
      </>}
    >
      <style>{CSS}</style>

      {toast && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
                                    background: toast.tone === 'ok' ? C.mintTint : '#FBE7E5', color: toast.tone === 'ok' ? C.mint : C.red, fontWeight: 700, fontSize: 14 }}>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss" style={{ all: 'unset', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}

      {/* 1 · Pulse */}
      <div className="cx-pulse">
        {!loaded ? [0, 1, 2, 3].map((i) => <div key={i} style={{ height: 150, borderRadius: 18, background: TILE[i].bg, border: `1px solid ${TILE[i].line}`, opacity: .6 }} />) : <>
          {tile(0, 'Downloads · 7 days', int(pulse.dl), deltaChip(pulse.dl, pulse.dlPrev), shareBar(pulse.per.map((p) => ({ id: p.id, accent: p.accent, v: p.dl }))))}
          {tile(1, 'Proceeds · 7 days', usd(pulse.rev), deltaChip(pulse.rev, pulse.revPrev), shareBar(pulse.per.map((p) => ({ id: p.id, accent: p.accent, v: p.rev }))))}
          {tile(2, 'Ad spend · 7 days', usd(pulse.spend),
            <span style={{ fontSize: 12, color: C.ink2, fontWeight: 600 }}>{pulse.live ? `${pulse.live} campaign${pulse.live === 1 ? '' : 's'} live` : 'All campaigns off'}{pulse.rev - pulse.spend < 0 && pulse.spend > 0 ? <> · <span style={{ color: C.loss }}>{usd(pulse.rev - pulse.spend)} net</span></> : null}</span>,
            shareBar(pulse.per.map((p) => ({ id: p.id, accent: p.accent, v: p.spend }))))}
          {tile(3, 'Needs you', needCount ? String(needCount) : 'All clear',
            <span style={{ fontSize: 12, color: C.ink2, fontWeight: 600 }}>
              {needCount ? [openAds.length && `${openAds.length} ad fix${openAds.length === 1 ? '' : 'es'}`, pending.length && `${pending.length} card suggestion${pending.length === 1 ? '' : 's'}`, serverIssues.length && `${serverIssues.length} server down`].filter(Boolean).join(' · ') : 'Every app is quiet'}
            </span>, undefined,
            { className: needCount ? 'cx-hot' : undefined, onClick: needCount ? () => document.getElementById('needs')?.scrollIntoView({ behavior: 'smooth' }) : undefined })}
        </>}
      </div>

      {/* 2 · Needs you  +  Live feed */}
      <div className="cx-split">
        <section data-card id="needs" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 18, display: 'grid', gap: 12, scrollMarginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Needs you</h2>
            {needCount > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: C.grad, borderRadius: 99, padding: '2px 9px' }}>{needCount}</span>}
            <span style={{ flex: 1 }} />
            {groups.map(([kind, list]) => {
              const verb = VERB[kind]!
              const isBatch = batch?.kind === kind
              return isBatch && batch.phase === 'confirm' ? (
                <span key={kind} role="alertdialog" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#FBE7E5', padding: '6px 8px 6px 12px', borderRadius: 10 }}>
                  {verb[0]} all {list.length}? {kind === 'delete_campaign' ? 'Can’t be undone.' : ''}
                  <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5, color: C.red, borderColor: C.red }} onClick={() => runBatch(kind)}>{verb[0]} {list.length}</button>
                  <button style={{ ...btn('ghost'), padding: '6px 10px', fontSize: 12.5 }} onClick={() => setBatch(null)}>Cancel</button>
                </span>
              ) : (
                <button key={kind} style={{ ...btn('mint'), padding: '8px 14px', fontSize: 13 }} disabled={!!batch} onClick={() => setBatch({ kind, phase: 'confirm' })}>
                  {isBatch ? 'Working…' : `${verb[0]} all ${list.length} ${verb[1]}s`}
                </button>
              )
            })}
          </div>

          {!loaded ? [0, 1, 2].map((i) => <div key={i} style={{ height: 64, borderRadius: 12, background: C.card2 }} />) : null}

          {loaded && needCount === 0 && adQueue.length === 0 && (
            <div style={{ padding: '28px 12px', textAlign: 'center', display: 'grid', gap: 6, justifyItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 99, background: C.mintTint, color: C.teal, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>✓</div>
              <b style={{ fontSize: 15 }}>Inbox zero for the studio</b>
              <span style={{ fontSize: 13, color: C.soft }}>No ad fixes, suggestions or server problems. Plan the next post?</span>
              <a href="/post" style={{ ...btn('ghost'), textDecoration: 'none', marginTop: 6, fontSize: 13 }}>Open Post</a>
            </div>
          )}

          {loaded && pending.length > 0 && (
            <div className="cx-q" style={{ borderLeft: `4px solid ${appAccent('gagorder')}` }}>
              <img className="cx-qicon" src="/icons/gagorder.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{pending.length} card suggestion{pending.length === 1 ? '' : 's'} from players</b>
                <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{pending[0].s.message}”{pending.length > 1 ? ` and ${pending.length - 1} more` : ''}</div>
              </div>
              <a className="cx-qbtn" href="#review" style={{ ...btn('ghost'), padding: '7px 12px', fontSize: 12.5, textDecoration: 'none' }}>Review</a>
            </div>
          )}

          {loaded && serverIssues.map((c) => (
            <div key={`srv:${c.id}`} className="cx-q" style={{ borderLeft: `4px solid ${c.accent}` }}>
              <img className="cx-qicon" src={`/icons/${c.id}.png`} alt="" width={36} height={36} style={{ borderRadius: 8 }} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{c.name} server isn’t answering</b>
                <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>{c.server.error}</div>
              </div>
              <button className="cx-qbtn" style={{ ...btn('ghost'), padding: '7px 12px', fontSize: 12.5 }} disabled={loading} onClick={() => load(true)}>Retry</button>
            </div>
          ))}

          {loaded && adQueue.map((a) => {
            const st = runs[a.id]
            const done = st?.phase === 'done'
            const destructive = DESTRUCTIVE.has(a.kind)
            const name = a.app_id ? STUDIO_APPS.find((x) => x.id === a.app_id)?.name : undefined
            return (
              <div key={a.id} className="cx-q" data-done={done ? '1' : undefined} style={{ borderLeft: `4px solid ${a.app_id ? appAccent(a.app_id) : C.rule2}` }}>
                <span className="cx-qicon" style={{ position: 'relative', width: 36, height: 36 }}>
                  {a.app_id ? <img src={`/icons/${a.app_id}.png`} alt="" width={36} height={36} style={{ borderRadius: 8, display: 'block' }} /> : <span style={{ width: 36, height: 36, display: 'block', borderRadius: 8, background: C.rule }} />}
                  <span style={{ position: 'absolute', right: -5, bottom: -5, width: 19, height: 19, borderRadius: 99, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}>
                    <PlatformGlyph platform={a.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={11} />
                  </span>
                </span>
                <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                  <b style={{ fontSize: 14, ...(done ? { color: C.teal } : {}) }} title={a.campaign_name}>{done ? '✓ ' : ''}{a.title}</b>
                  {done
                    ? <span style={{ fontSize: 12.5, color: C.teal }}>{st.text}</span>
                    : <span style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {name ? <b style={{ fontWeight: 600, color: C.ink }}>{name} · {a.platform === 'tiktok' ? 'TikTok' : 'Meta'} · </b> : null}{a.say || a.detail}
                      </span>}
                  {st?.phase === 'confirm' && (
                    <div role="alertdialog" aria-label="Confirm" style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, background: C.card, border: `1px solid ${destructive ? '#EBC3BE' : C.rule2}`, display: 'grid', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>{a.confirm ?? `${a.button}?`}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={{ ...btn(destructive ? 'ghost' : 'mint'), padding: '6px 12px', fontSize: 12.5, ...(destructive ? { color: C.red, borderColor: C.red } : {}) }} onClick={async () => { if (await runAd(a)) setTimeout(() => load(true), 1500) }}>{a.button}</button>
                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5 }} onClick={() => setRuns((r) => { const n = { ...r }; delete n[a.id]; return n })}>Cancel</button>
                        {a.manager_url && <a href={a.manager_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.teal, fontWeight: 600, alignSelf: 'center' }}>Open in {a.platform === 'tiktok' ? 'TikTok Ads' : 'Ads Manager'} ↗</a>}
                      </div>
                    </div>
                  )}
                  {st?.phase === 'error' && <span style={{ fontSize: 12.5, color: C.red }}>{st.text}</span>}
                </div>
                <span className="cx-qbtn">
                  {done ? null
                    : a.href ? <a href={a.href} target={a.href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" style={{ ...btn('ghost'), padding: '7px 12px', fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-block' }}>{a.button}{a.href.startsWith('/') ? '' : ' ↗'}</a>
                    : st?.phase === 'busy' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.teal, fontWeight: 600 }}><span className="cx-spin" />Working…</span>
                    : <button style={{ ...btn('ghost'), padding: '7px 12px', fontSize: 12.5, whiteSpace: 'nowrap', ...(destructive ? { color: C.red } : {}) }} disabled={st?.phase === 'confirm' || !!batch}
                        onClick={() => setRuns((r) => ({ ...r, [a.id]: { phase: 'confirm' } }))}>{st?.phase === 'error' ? 'Try again' : a.button}</button>}
                </span>
              </div>
            )
          })}
        </section>

        <section data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="cx-livedot" style={{ width: 8, height: 8, borderRadius: 99, background: C.teal }} />
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Live</h2>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {sorted.filter((c) => c.server.connected).map((c) => (
                <span key={c.id} title={`${c.name} server · ${c.server.ok ? `${c.server.ms}ms` : c.server.error}`}
                  style={{ width: 9, height: 9, borderRadius: 99, background: c.server.ok ? c.accent : C.red, boxShadow: c.server.ok ? `0 0 8px ${c.accent}AA` : 'none' }} />
              ))}
            </span>
          </div>
          {loaded && feed.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.soft }}>No player activity reported yet. It shows here as soon as an app’s server logs something.</p>}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2, position: 'relative' }}>
            {feed.map((r, i) => (
              <li key={`${r.app.id}:${r.at}:${i}`} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 10, alignItems: 'start', padding: '8px 4px', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
                <img src={`/icons/${r.app.id}.png`} alt={r.app.name} title={r.app.name} width={22} height={22} style={{ borderRadius: 6, marginTop: 1 }} />
                <div style={{ minWidth: 0, fontSize: 13.5, lineHeight: 1.4 }}>
                  <b style={{ fontWeight: 600 }}>{r.title}</b>
                  {r.detail && <div style={{ fontSize: 12.5, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>}
                </div>
                <span style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{ago(r.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* 3 · Apps */}
      <div style={{ display: 'grid', gap: 10 }}>
        {sectionHead('Apps', <span style={{ fontSize: 12.5, color: C.soft }}>tap a lane for its analytics</span>)}
        <div className="cx-head" style={{ gridTemplateColumns: 'minmax(170px,1.2fr) repeat(3,minmax(0,1fr)) minmax(0,.8fr) minmax(0,1.25fr) 18px', gap: 18, padding: '0 18px 0 20px' }}>
          {['App', 'Downloads · 7d', 'Proceeds · 7d', 'Ad spend · 7d', 'Rating', 'Players', ''].map((h) => <span key={h} style={{ ...label, fontSize: 10 }}>{h}</span>)}
        </div>
        {!loaded ? [0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 84, borderRadius: 18, background: C.card, border: `1px solid ${C.rule}` }} />)
          : sorted.map((c, idx) => {
            const d = c.store
            const p = c.play && c.play.connected && !c.play.error ? c.play : null
            const dl = (d?.installs7 ?? 0) + (p?.installs7 ?? 0), dlPrev = (d?.installs_prev7 ?? 0) + (p?.installs_prev7 ?? 0)
            const rev = (d?.proceeds7 ?? 0) + (p?.proceeds7 ?? 0), revPrev = (d?.proceeds_prev7 ?? 0) + (p?.proceeds_prev7 ?? 0)
            const spend = (c.ads?.spend7_cents ?? 0) / 100
            const onStore = !!d?.on_store
            const adsLive = (c.ads?.active_campaigns ?? 0) > 0
            const cellLabel = (t: string) => <span className="cx-cell-label" style={{ ...label, fontSize: 10, display: 'none', marginBottom: 4 }}>{t}</span>
            const big = (v: string, muted = false) => <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: muted ? C.faint : C.ink, lineHeight: 1.1 }}>{v}</div>
            const twin = (now: number, prev: number) => {
              const max = Math.max(now, prev, 1)
              return (
                <div title={`This week ${int(now)} · prior week ${int(prev)}`} style={{ display: 'grid', gap: 3, marginTop: 7, width: 84 }}>
                  <span style={{ height: 4, borderRadius: 99, background: 'rgba(15,17,21,.12)', width: `${Math.max(4, (prev / max) * 100)}%` }} />
                  <span style={{ height: 4, borderRadius: 99, background: c.accent, width: `${Math.max(4, (now / max) * 100)}%`, boxShadow: `0 0 8px ${c.accent}66` }} />
                </div>
              )
            }
            const s = c.server
            const headline = s.connected && s.ok ? (s.stats?.[0] ?? (c.id === 'gagorder' ? { label: 'Live community cards', value: apps.find((a) => a.id === c.id)?.live.filter((x) => x.active !== false).length ?? 0 } : undefined)) : undefined
            const second = s.connected && s.ok ? s.stats?.[1] : undefined
            return (
              <div key={c.id} className="cx-lane" role="link" tabIndex={0} aria-label={`${c.name} analytics`}
                onClick={() => router.push(`/analytics/${c.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/analytics/${c.id}`) }}
                style={{ ['--acc' as string]: c.accent ?? appAccent(c.id), animation: `adm-rise .5s cubic-bezier(.2,.7,.2,1) ${0.05 * idx}s both` } as CSSProperties}>
                <div className="cx-id" style={{ minWidth: 0, display: 'grid', gap: 6 }}>
                  <AppTag id={c.id} name={c.name} size={34} style={{ fontSize: 16.5, fontWeight: 700 }} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: onStore ? C.ink2 : C.soft, background: C.card2, borderRadius: 99, padding: '2px 8px' }}>
                      {onStore ? <><AppleLogo size={10} />{c.play ? <PlayLogo size={9} /> : null} Live</> : 'Not on store yet'}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '2px 8px', color: adsLive ? C.teal : C.soft, background: adsLive ? C.mintTint : C.card2 }}>
                      {adsLive ? `Ads on · ${c.ads!.active_campaigns}` : 'Ads off'}
                    </span>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  {cellLabel('Downloads · 7d')}
                  {onStore ? <>{big(int(dl))}<div style={{ marginTop: 2 }}>{deltaChip(dl, dlPrev)}</div>{twin(dl, dlPrev)}</> : big('—', true)}
                </div>
                <div style={{ minWidth: 0 }}>
                  {cellLabel('Proceeds · 7d')}
                  {onStore ? <>{big(usd(rev), rev === 0)}<div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: C.soft, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><AppleLogo size={10} />{usd(d?.proceeds7 ?? 0)}</span>
                    {c.play && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PlayLogo size={9} />{p ? usd(p.proceeds7 ?? 0) : '—'}</span>}
                  </div></> : big('—', true)}
                </div>
                <div style={{ minWidth: 0 }}>
                  {cellLabel('Ad spend · 7d')}
                  {big(usd(spend), spend === 0)}
                  <div style={{ fontSize: 11.5, color: C.soft, marginTop: 4 }}>{c.ads?.campaigns ? `${c.ads.campaigns} campaign${c.ads.campaigns === 1 ? '' : 's'}` : 'No campaigns'}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  {cellLabel('Rating')}
                  {d?.rating != null ? <>{big(d.rating.toFixed(1))}<div style={{ color: '#E8A33D', fontSize: 12, letterSpacing: 1, marginTop: 2 }} aria-label={`${d.rating.toFixed(1)} stars`}>{'★★★★★'.slice(0, Math.round(d.rating))}<span style={{ color: C.rule2 }}>{'★★★★★'.slice(Math.round(d.rating))}</span></div></> : big('—', true)}
                  {onStore && <div style={{ fontSize: 11.5, color: C.soft, marginTop: 2 }}>{d!.new_reviews7} new review{d!.new_reviews7 === 1 ? '' : 's'}</div>}
                </div>
                <div className="cx-pulsecell" style={{ minWidth: 0 }}>
                  {cellLabel('Players')}
                  {headline ? (
                    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      {[headline, second].filter(Boolean).map((x) => (
                        <div key={x!.label} style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtNum(x!.value, x!.format)}</div>
                          <div style={{ fontSize: 11.5, color: C.soft }}>{x!.label.toLowerCase()}{x!.delta ? <span style={{ color: C.teal, fontWeight: 700 }}> {x!.delta.replace(/ this week$/, '')}</span> : null}</div>
                        </div>
                      ))}
                    </div>
                  ) : s.connected && !s.ok
                    ? <span style={{ fontSize: 12.5, color: C.loss, fontWeight: 600 }}>Server: {s.error}</span>
                    : <span style={{ fontSize: 12.5, color: C.soft }} onClick={(e) => e.stopPropagation()}>
                        {s.note ?? <>Server not connected{s.connect && <> · <details style={{ display: 'inline' }}><summary style={{ display: 'inline', cursor: 'pointer', color: C.teal, fontWeight: 700 }}>Connect</summary><span style={{ display: 'block', marginTop: 6, lineHeight: 1.5 }}>{s.connect}</span></details></>}</>}
                      </span>}
                </div>
                <span className="cx-go" aria-hidden="true" style={{ fontSize: 18 }}>›</span>
              </div>
            )
          })}
      </div>

      {/* 4 · Gag Order: suggestions and live cards */}
      {loaded && pending.length > 0 && (<>
        {sectionHead('Card suggestions', <span style={{ fontSize: 12.5, color: C.soft }}>{pending.length} waiting</span>, 'review')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(460px,100%),1fr))', gap: 16 }}>
          {pending.map(({ app, s }) => {
            const k = `${app.id}:${s.id}`
            const d = drafts[k]
            if (!d) return null
            const set = (patch: Partial<Draft>) => setDrafts((x) => {
              const nd = { ...d, ...patch }
              if (!nd.noteEdited && ('text' in patch || 'pack' in patch) && s.thank_you_draft) nd.note = retarget(s.thank_you_draft, s, startPack(s), nd.text, nd.pack)
              return { ...x, [k]: nd }
            })
            const who = firstName(s.player_name)
            const edited = d.text.trim() !== s.message.trim()
            return (
              <article key={k} data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderTop: `4px solid ${appAccent(app.id)}`, borderRadius: 18, padding: 18, display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.soft }}>
                  <AppTag id={app.id} name={app.name} size={18} style={{ color: C.ink2 }} />
                  <b style={{ color: C.ink }}>· {s.player_name || 'A player'}</b>
                  <span>· {s.platform ?? 'app'} · {ago(s.created_at)}</span>
                </div>
                <div style={{ borderRadius: 16, padding: 18, minHeight: 110, display: 'grid', alignContent: 'space-between', gap: 10,
                              background: 'linear-gradient(135deg,#2B1B3D 0%,#6B2A5E 55%,#C2436E 100%)', color: '#fff', boxShadow: '0 10px 24px rgba(107,42,94,.25)' }}>
                  <textarea value={d.text} onChange={(e) => set({ text: e.target.value })} rows={3} aria-label="Card text"
                    style={{ all: 'unset', fontSize: 19, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'pre-wrap', width: '100%' }} />
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .85 }}>
                    <span>{PACKS.find(([v]) => v === d.pack)?.[1]}</span>·<span>{d.format}</span>·<span>{TIERS.find(([v]) => v === d.tier)?.[1]}</span>
                    {edited && <span style={{ marginLeft: 'auto', opacity: .8 }}>edited</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Pack</span>{chips(d.pack, PACKS, (v) => set({ pack: v }))}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Tier</span>{chips(d.tier, TIERS, (v) => set({ tier: v }))}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Format</span>{chips(d.format, FORMATS, (v) => set({ format: v }))}</div>
                </div>
                <div style={{ display: 'grid', gap: 8, background: C.card2, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={label}>Thank-you to {who ?? 'the player'}</span>
                    <span style={{ flex: 1 }} />
                    {d.noteEdited && s.thank_you_draft && (
                      <button style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: C.soft, textDecoration: 'underline' }}
                        onClick={() => set({ noteEdited: false, note: retarget(s.thank_you_draft!, s, startPack(s), d.text, d.pack) })}>Reset</button>
                    )}
                  </div>
                  <textarea value={d.note} rows={4} aria-label="Thank-you note" onChange={(e) => set({ note: e.target.value, noteEdited: true })}
                    style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, fontFamily: C.sans, background: C.card, resize: 'vertical' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink2, cursor: who ? 'pointer' : 'default' }}>
                    <input type="checkbox" checked={!!who && d.credit} disabled={!who} onChange={(e) => set({ credit: e.target.checked })} />
                    {who ? <>Show “Suggested by {who}” on the card in game</> : <>No name on this suggestion — no credit line</>}
                  </label>
                  {s.reachable === false && <p style={{ margin: 0, fontSize: 12, color: C.soft }}>Sent from an older app version, so there’s no way to deliver the note to them. The credit line still shows.</p>}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  {edited && <button style={btn('ghost')} onClick={() => set({ text: s.message })}>Undo edits</button>}
                  <button style={btn('ghost')} disabled={busy === k} onClick={() => act(app.id, k, { action: 'reject', feedbackId: s.id })}>Reject</button>
                  <button style={{ ...btn('mint'), minWidth: 150 }} disabled={busy === k || !d.text.trim()}
                    onClick={() => act(app.id, k, { action: 'approve', feedbackId: s.id, text: d.text, pack: d.pack, tier: d.tier, format: d.format, thankYou: d.note, credit: d.credit })}>
                    {busy === k ? 'Publishing…' : edited ? 'Publish edited card' : 'Publish card'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </>)}

      {loaded && (live.length > 0 || query) && (<>
        {sectionHead('Live community cards', <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards…" aria-label="Search live cards"
          style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, width: 220, maxWidth: '50vw', background: C.card }} />)}
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${appAccent('gagorder')}`, borderRadius: 18, overflow: 'hidden' }}>
          {live.map(({ app, c }, i) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', padding: '12px 18px', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.text}</div>
                <div style={{ fontSize: 12.5, color: C.soft, marginTop: 3 }}>
                  {[PACKS.find(([v]) => v === c.pack_id)?.[1] ?? c.pack_id, FORMATS.find(([v]) => v === c.format)?.[1] ?? c.format].join(' · ')}{c.credit_name ? ` · by ${c.credit_name}` : ` · ${app.name}`}
                </div>
              </div>
              <button style={{ ...btn('ghost'), fontSize: 12.5, padding: '7px 12px' }} disabled={busy === c.id}
                onClick={() => { if (confirm('Retire this card for every player?')) act(app.id, c.id, { action: 'retire', cardId: c.id }) }}>
                {busy === c.id ? 'Retiring…' : 'Retire'}
              </button>
            </div>
          ))}
          {live.length === 0 && <p style={{ padding: 18, margin: 0, color: C.soft }}>No cards match “{query}”.</p>}
        </div>
      </>)}
    </AdminShell>
  )
}
