'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppTag, C, TILE, labelStyle } from '@/components/AdminNav'
import { AppleLogo, PlayLogo } from '@/components/StoreLogos'
import { WorldStrip } from '@/components/analytics/WorldStrip'
import { PLATFORMS, type Platform } from '@/lib/publish/rules'
import type { CalendarDay, CalendarResponse } from '@/lib/publish/calendar'
import { CADENCE } from '@/lib/publish/cadence'
import { PlatformGlyph, Segmented, type PublishApp, type QueuedPost } from '../shared'
import { PostDrawer, statusOf } from '../PostDrawer'
import { marketOf } from '../country'
import {
  addDays, addMonths, cents, dayOf, daysInMonth, fmtDay, fmtHour, fmtTime, instantAt, minutesOf,
  money, monthGrid, startOfWeek, today, weekday,
} from './tz'

// ─── /post → Calendar ────────────────────────────────────────────────────────
//
// Day / Week / Month / Year, in America/Chicago. Post chips carry the app's
// colour, a thumbnail dot, the time and where they go; scheduled ones drag to
// a new slot (PATCH /api/publish?action=edit). Each day has a footer of what
// happened that day — installs per store, proceeds, ad spend, the app's
// scoreboard — and the World strip filters everything to one country.
// Last data shows instantly from this browser; fresh data swaps in.

type View = 'day' | 'week' | 'month' | 'year'
const VIEW_KEY = 'clarendon:post-cal-view'
const CACHE_KEY = 'clarendon:post-cal:'
const HOUR = 46 // px per hour in Week / Day
const accent = (apps: PublishApp[], id: string) => apps.find((a) => a.id === id)?.accent ?? C.mint
const isStory = (p: QueuedPost) => p.targets.some((t) => t.format === 'story')
const reach = (p: QueuedPost) => Object.values(p.stats ?? {}).reduce((t, s) => t + (s?.reach ?? 0), 0)
const engaged = (p: QueuedPost) => Object.values(p.stats ?? {}).reduce((t, s) => t + (s?.engagement ?? 0), 0)

function rangeFor(view: View, cursor: string): { from: string; to: string } {
  if (view === 'day') return { from: cursor, to: cursor }
  if (view === 'week') { const f = startOfWeek(cursor); return { from: f, to: addDays(f, 6) } }
  if (view === 'month') { const g = monthGrid(cursor); return { from: g[0], to: g[41] } }
  return { from: `${cursor.slice(0, 4)}-01-01`, to: `${cursor.slice(0, 4)}-12-31` }
}

export function Calendar({ apps, refreshKey, onCompose, onDuplicate, onChanged }: {
  apps: PublishApp[]; refreshKey: number
  /** Compose at this time (empty slot clicked). */
  onCompose: (p: { at: string; appId?: string }) => void
  onDuplicate: (p: QueuedPost) => void
  /** A post was moved / edited / canceled here (the Queue reloads). */
  onChanged: () => void
}) {
  const [view, setViewState] = useState<View>('month')
  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v === 'day' || v === 'week' || v === 'month' || v === 'year') setViewState(v) } catch { /* private mode */ } }, [])
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }
  const [cursor, setCursor] = useState(today)
  const [app, setApp] = useState<string>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [country, setCountry] = useState<string | null>(null)
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<QueuedPost | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const { from, to } = rangeFor(view, cursor)
  const key = `${from}|${to}|${app}|${country ?? ''}`
  const load = useCallback(async () => {
    const [f, t, a, c] = key.split('|')
    setLoading(true); setError(null)
    try { const hit = JSON.parse(localStorage.getItem(CACHE_KEY + key) ?? 'null'); if (hit) setData((d) => d && `${d.from}|${d.to}|${d.app}|${d.country ?? ''}` === key ? d : hit) } catch { /* ignore */ }
    const res = await fetch(`/api/publish/calendar?from=${f}&to=${t}&app=${a}${c ? `&country=${c}` : ''}`).catch(() => null)
    const body = await res?.json().catch(() => null)
    setLoading(false)
    if (!res?.ok || !body) { setError(body?.error ?? 'Couldn’t load the calendar.'); return }
    setData(body)
    try { localStorage.setItem(CACHE_KEY + key, JSON.stringify(body)) } catch { /* full or private */ }
  }, [key])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(t) }, [notice])

  // Only show data that belongs to this range (the cache can briefly hold the last one).
  const fresh = data && data.from === from && data.to === to && data.app === app && (data.country ?? null) === country ? data : null
  const posts = useMemo(() => ((fresh?.posts ?? []) as unknown as QueuedPost[])
    .filter((p) => platform === 'all' || p.targets.some((t) => t.platform === platform)), [fresh, platform])
  const byDay = useMemo(() => {
    const m = new Map<string, QueuedPost[]>()
    for (const p of posts) { const d = dayOf(p.scheduled_at ?? p.created_at); m.set(d, [...(m.get(d) ?? []), p]) }
    for (const l of m.values()) l.sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at))
    return m
  }, [posts])
  const days = useMemo(() => new Map((fresh?.days ?? []).map((d) => [d.date, d])), [fresh])

  // Drag a scheduled post to a new day/time.
  const move = async (id: string, at: Date) => {
    const p = posts.find((x) => x.id === id)
    if (!p || p.status !== 'scheduled') return
    if (at.getTime() < Date.now() + 60_000) { setNotice({ ok: false, text: 'That time has passed — drop it later than now.' }); return }
    setData((d) => d ? { ...d, posts: d.posts.map((x) => x.id === id ? { ...x, scheduled_at: at.toISOString() } : x) } : d)
    const res = await fetch(`/api/publish?id=${id}&action=edit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: at.toISOString() }) }).catch(() => null)
    const body = await res?.json().catch(() => ({})) ?? {}
    if (!res?.ok) setNotice({ ok: false, text: body.error ?? 'Couldn’t move it.' })
    else setNotice({ ok: true, text: `Moved to ${fmtDay(dayOf(at), { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(at.toISOString())}.` })
    load(); onChanged()
  }
  /** Compose at an instant; a past slot does nothing, a slot about to pass moves to the next hour. */
  const composeAt = (d: Date) => {
    if (d.getTime() < Date.now() - 30 * 60_000) return
    const at = d.getTime() < Date.now() + 10 * 60_000 ? new Date(Math.ceil((Date.now() + 10 * 60_000) / 3600_000) * 3600_000) : d
    onCompose({ at: at.toISOString(), appId: app === 'all' ? undefined : app })
  }

  const step = (n: number) => setCursor((c) => view === 'day' ? addDays(c, n) : view === 'week' ? addDays(c, 7 * n) : view === 'month' ? addMonths(c, n) : addMonths(c, 12 * n))
  const title = view === 'day' ? fmtDay(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week' ? `${fmtDay(from, { month: 'short', day: 'numeric' })} – ${from.slice(5, 7) === to.slice(5, 7) ? Number(to.slice(8)) : fmtDay(to, { month: 'short', day: 'numeric' })}, ${to.slice(0, 4)}`
    : view === 'month' ? fmtDay(cursor, { month: 'long', year: 'numeric' }) : cursor.slice(0, 4)
  // Totals for what's on screen (month view: the month itself, not the 6-week grid).
  const inView = (d: string) => view !== 'month' || d.slice(0, 7) === cursor.slice(0, 7)
  const viewDays = (fresh?.days ?? []).filter((d) => inView(d.date))
  const total = (f: (d: CalendarDay) => number | undefined) => Math.round(viewDays.reduce((t, d) => t + (f(d) ?? 0), 0) * 100) / 100
  const shownPosts = posts.filter((p) => inView(dayOf(p.scheduled_at ?? p.created_at)))

  const chip = (p: QueuedPost, o: { wide?: boolean; draggable?: boolean } = {}) => {
    const s = statusOf(p.status)
    const a = accent(apps, p.app_id)
    const thumb = p.media[0]
    const posted = p.status === 'done' || p.status === 'partial'
    const bad = p.status === 'failed'
    const mk = marketOf(p)
    const st = p.stats && Object.keys(p.stats).length ? p.stats : null
    const canDrag = p.status === 'scheduled' && o.draggable !== false
    return (
      <button key={p.id} className="cal-chip" draggable={canDrag} onDragStart={(e) => { setDragId(p.id); e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDragId(null)}
        onClick={(e) => { e.stopPropagation(); setDrawer(p) }}
        aria-label={`${apps.find((x) => x.id === p.app_id)?.name ?? p.app_id} · ${fmtTime(p.scheduled_at ?? p.created_at)} · ${s.text}`}
        style={{ all: 'unset', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'center', gap: 5, width: '100%', minWidth: 0, cursor: canDrag ? 'grab' : 'pointer',
                 padding: o.wide ? '5px 8px' : '3px 6px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.25, color: bad ? C.red : C.ink,
                 background: bad ? '#FBE7E5' : posted ? C.card : `${a}14`, borderLeft: `3px solid ${a}`, opacity: dragId === p.id ? 0.4 : 1,
                 boxShadow: posted ? `inset 0 0 0 1px ${C.rule}` : undefined }}>
        {thumb ? <span aria-hidden style={{ width: o.wide ? 26 : 14, height: o.wide ? 26 : 14, borderRadius: o.wide ? 6 : 99, overflow: 'hidden', flexShrink: 0, background: C.card2 }}>
          {thumb.kind === 'video' ? <video src={`${thumb.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            : <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </span> : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: a, flexShrink: 0 }} />}
        <b style={{ fontWeight: 750, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtTime(p.scheduled_at ?? p.created_at).replace(':00', '').replace(' ', '').toLowerCase()}</b>
        <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>{p.targets.map((t) => <PlatformGlyph key={t.platform} platform={t.platform} size={11} color={t.status === 'failed' ? C.red : t.status === 'published' ? C.mint : C.soft} />)}</span>
        {isStory(p) && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.soft }}>STORY</span>}
        {mk && <span aria-hidden title={mk.name} style={{ fontSize: 11 }}>{mk.flag}</span>}
        {o.wide && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.ink2 }}>{p.caption}</span>}
        {posted && <span aria-hidden style={{ marginLeft: 'auto', color: C.mint, fontWeight: 800 }}>✓</span>}
        {/* Hover: the post's own numbers. */}
        <span className="cal-pop" role="tooltip" style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 30, width: 220, padding: '9px 11px', borderRadius: 10, background: C.ink, color: '#fff', fontSize: 12, lineHeight: 1.45, whiteSpace: 'normal', boxShadow: '0 10px 30px rgba(15,17,21,.25)', pointerEvents: 'none' }}>
          <b>{s.text}</b> · {fmtTime(p.scheduled_at ?? p.created_at)} Chicago<br />
          {st ? <>{reach(p).toLocaleString()} reached · {engaged(p).toLocaleString()} engaged<br />
            {Object.entries(st).map(([pf, v]) => `${PLATFORMS.find((x) => x.id === pf)?.name}: ${v?.reach.toLocaleString()}`).join(' · ')}</>
            : posted ? 'Stats arrive ~48 h after posting.' : <span style={{ opacity: 0.8 }}>{(p.caption || 'No caption').slice(0, 90)}</span>}
        </span>
      </button>
    )
  }

  const footer = (d: CalendarDay | undefined, compact = true) => {
    if (!d) return null
    const as = d.installs?.appStore, gp = d.installs?.googlePlay
    const proceeds = (d.proceeds?.appStore ?? 0) + (d.proceeds?.googlePlay ?? 0)
    const parts: React.ReactNode[] = []
    if (as != null || gp != null) parts.push(
      <span key="i" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {as != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><AppleLogo size={9} />{as}</span>}
        {gp != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><PlayLogo size={9} />{gp}</span>}
      </span>)
    if (proceeds > 0) parts.push(<span key="p" style={{ color: C.teal, fontWeight: 700 }}>{money(proceeds)}</span>)
    if (d.adSpendCents) parts.push(<span key="a" title="Ad spend" style={{ color: C.loss }}>ads {cents(d.adSpendCents)}</span>)
    if (d.scoreboard) parts.push(<span key="s" title={fresh?.scoreboard?.label} style={{ color: C.indigo, fontWeight: 800 }}>★{d.scoreboard}</span>)
    else if (!compact && d.scoreboard === 0 && fresh?.scoreboard) parts.push(<span key="s" title={fresh.scoreboard.label} style={{ color: C.faint }}>★0</span>)
    if (!parts.length) return null
    return <div className="cal-foot" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 10.5, color: C.ink2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{parts}</div>
  }

  const dropOnDay = (day: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain') || dragId; setDragId(null)
      const p = posts.find((x) => x.id === id); if (!id || !p) return
      move(id, instantAt(day, minutesOf(p.scheduled_at ?? p.created_at)))
    },
  })

  // ── Month ──
  const month = () => {
    const grid = monthGrid(cursor), t = today()
    return (
      <div className="cal-month" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', border: `1px solid ${C.rule}`, borderRadius: 18, overflow: 'hidden', background: C.rule, gap: 1 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <div key={w} style={{ ...labelStyle, background: C.card2, padding: '8px 10px' }}>{w}</div>)}
        {grid.map((d) => {
          const list = byDay.get(d) ?? []
          const out = d.slice(0, 7) !== cursor.slice(0, 7)
          const past = d < t
          const MAX = 4
          return (
            <div key={d} {...dropOnDay(d)} onClick={() => composeAt(instantAt(d, 19 * 60))}
              title={past ? undefined : 'Click an empty spot to compose for this day'}
              style={{ background: d === t ? '#F4FBFC' : out ? '#FAFBFC' : C.card, minHeight: 128, padding: 6, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 4, cursor: past ? 'default' : 'copy', minWidth: 0 }}>
              <button onClick={(e) => { e.stopPropagation(); setCursor(d); setView('day') }}
                style={{ all: 'unset', cursor: 'pointer', justifySelf: 'start', fontSize: 12, fontWeight: 800, color: out ? C.faint : C.ink, width: 24, height: 24, borderRadius: 99, display: 'grid', placeItems: 'center',
                         background: d === t ? C.teal : 'transparent', ...(d === t ? { color: '#fff', boxShadow: `0 0 12px ${C.glow}` } : {}) }}>{Number(d.slice(8))}</button>
              <div style={{ display: 'grid', gap: 3, alignContent: 'start', minWidth: 0 }}>
                {list.slice(0, MAX).map((p) => chip(p))}
                {list.length > MAX && <button onClick={(e) => { e.stopPropagation(); setCursor(d); setView('day') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: C.teal, padding: '0 4px' }}>+{list.length - MAX} more</button>}
              </div>
              {!out && footer(days.get(d))}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Week / Day: a time grid ──
  const scroller = useRef<HTMLDivElement>(null)
  const gridReady = !!fresh
  useEffect(() => { if ((view === 'week' || view === 'day') && scroller.current) scroller.current.scrollTop = HOUR * 7 }, [view, gridReady])
  const timeGrid = (cols: string[]) => {
    const wide = cols.length === 1
    const t = today(), nowMin = minutesOf(new Date())
    return (
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 18, overflow: 'hidden', background: C.card }}>
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${cols.length}, minmax(0,1fr))`, borderBottom: `1px solid ${C.rule}`, background: C.card2 }}>
          <span />
          {cols.map((d) => (
            <div key={d} style={{ padding: '8px 8px 6px', borderLeft: `1px solid ${C.rule}`, display: 'grid', gap: 3, minWidth: 0 }}>
              <button onClick={() => { setCursor(d); setView('day') }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ ...labelStyle, fontSize: 10 }}>{fmtDay(d, { weekday: 'short' })}</span>
                <b style={{ fontSize: 17, color: d === t ? C.teal : C.ink }}>{Number(d.slice(8))}</b>
                <span style={{ fontSize: 11, color: C.soft }}>{(byDay.get(d) ?? []).length || ''}</span>
              </button>
              {footer(days.get(d), !wide)}
            </div>
          ))}
        </div>
        <div ref={scroller} style={{ maxHeight: 'min(70dvh, 760px)', overflowY: 'auto', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${cols.length}, minmax(0,1fr))`, position: 'relative', height: HOUR * 24 }}>
            <div>{Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HOUR, fontSize: 10.5, color: C.faint, textAlign: 'right', paddingRight: 8, transform: 'translateY(-6px)', fontFamily: C.mono }}>{h ? fmtHour(h) : ''}</div>)}</div>
            {cols.map((d) => {
              const list = byDay.get(d) ?? []
              // Posts in the same half hour sit side by side.
              const slots = new Map<number, QueuedPost[]>()
              for (const p of list) { const k = Math.floor(minutesOf(p.scheduled_at ?? p.created_at) / 30); slots.set(k, [...(slots.get(k) ?? []), p]) }
              return (
                <div key={d} className="cal-col"
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain') || dragId; setDragId(null)
                    const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top
                    if (id) move(id, instantAt(d, Math.max(0, Math.min(24 * 60 - 15, Math.round((y / HOUR) * 4) * 15))))
                  }}
                  onClick={(e) => {
                    const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top
                    composeAt(instantAt(d, Math.max(0, Math.min(24 * 60 - 30, Math.floor((y / HOUR) * 2) * 30))))
                  }}
                  style={{ position: 'relative', borderLeft: `1px solid ${C.rule}`, cursor: d < t ? 'default' : 'copy',
                           backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, ${C.rule} ${HOUR - 1}px, ${C.rule} ${HOUR}px)` }}>
                  {d === t && <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: (nowMin / 60) * HOUR, height: 2, background: C.red, zIndex: 3, boxShadow: '0 0 6px rgba(194,74,74,.5)' }} />}
                  {Array.from(slots.values()).map((group) => group.map((p, i) => (
                    <div key={p.id} style={{ position: 'absolute', top: (minutesOf(p.scheduled_at ?? p.created_at) / 60) * HOUR + 1, left: `calc(${(i / group.length) * 100}% + 3px)`, width: `calc(${100 / group.length}% - 6px)`, zIndex: 2 }}>
                      {chip(p, { wide })}
                    </div>
                  )))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Year: twelve mini months, a heat map of posts per day ──
  const year = () => {
    const y = cursor.slice(0, 4)
    const max = Math.max(1, ...Array.from(byDay.values()).map((l) => l.length))
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 14 }}>
        {Array.from({ length: 12 }, (_, m) => {
          const first = `${y}-${String(m + 1).padStart(2, '0')}-01`
          const n = daysInMonth(first), lead = weekday(first)
          const monthPosts = Array.from({ length: n }, (_, i) => byDay.get(addDays(first, i))?.length ?? 0).reduce((a, b) => a + b, 0)
          const md = (fresh?.days ?? []).filter((d) => d.date.startsWith(first.slice(0, 7)))
          const inst = md.reduce((t, d) => t + (d.installs?.appStore ?? 0) + (d.installs?.googlePlay ?? 0), 0)
          const sb = md.reduce((t, d) => t + (d.scoreboard ?? 0), 0)
          return (
            <section key={m} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 14, display: 'grid', gap: 8 }}>
              <button onClick={() => { setCursor(first); setView('month') }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: 14.5 }}>{fmtDay(first, { month: 'long' })}</b>
                <span style={{ fontSize: 11.5, color: C.soft }}>{monthPosts} post{monthPosts === 1 ? '' : 's'}{inst ? ` · ${inst} installs` : ''}{sb ? ` · ★${sb}` : ''}</span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
                {Array.from({ length: n }, (_, i) => {
                  const d = addDays(first, i), c = byDay.get(d)?.length ?? 0
                  return (
                    <button key={d} onClick={() => { setCursor(d); setView('day') }} title={`${fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })}: ${c} post${c === 1 ? '' : 's'}`}
                      style={{ all: 'unset', cursor: 'pointer', aspectRatio: '1', borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 9.5, fontVariantNumeric: 'tabular-nums',
                               background: c ? `rgba(11,122,131,${0.18 + 0.82 * (c / max)})` : C.card2, color: c / max > 0.5 ? '#fff' : d === today() ? C.teal : C.soft,
                               outline: d === today() ? `1.5px solid ${C.teal}` : 'none' }}>{i + 1}</button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  const kpis = [
    { label: 'Installs', value: <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppleLogo size={14} />{fresh?.sources.appStore === 'ok' ? total((d) => d.installs?.appStore) : '—'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlayLogo size={14} />{fresh?.sources.googlePlay === 'ok' ? total((d) => d.installs?.googlePlay) : '—'}</span></span>,
      note: fresh?.sources.googlePlay === 'not_connected' ? 'Google Play not connected yet' : fresh?.reportDates?.appStore ? `App Store to ${fmtDay(fresh.reportDates.appStore, { month: 'short', day: 'numeric' })}` : undefined },
    { label: 'Proceeds', value: money(total((d) => (d.proceeds?.appStore ?? 0) + (d.proceeds?.googlePlay ?? 0))), note: country ? 'App Store only under a country' : 'USD, both stores' },
    { label: 'Ad spend', value: country ? cents(fresh?.totals.adSpendCents ?? 0) : cents(total((d) => d.adSpendCents)),
      note: (country ? fresh?.totals.adSpendCents : total((d) => d.adSpendCents)) ? undefined : 'Paid ads paused (revenue strategy)' },
    fresh?.scoreboard
      ? { label: fresh.scoreboard.short, value: String(total((d) => d.scoreboard)), note: fresh.scoreboard.label }
      : { label: 'Posts', value: String(shownPosts.length), note: `${shownPosts.filter((p) => p.status === 'scheduled').length} still to go out` },
  ]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button aria-label="Previous" onClick={() => step(-1)} style={navBtn}>‹</button>
          <button onClick={() => setCursor(today())} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 13 }}>Today</button>
          <button aria-label="Next" onClick={() => step(1)} style={navBtn}>›</button>
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 750, letterSpacing: '-.02em', minWidth: 0 }}>{title}</h2>
        {loading && fresh && <span role="status" style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, background: C.card, border: `1px solid ${C.rule}`, borderRadius: 99, padding: '3px 10px' }}>Updating…</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.soft }}>Chicago time</span>
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
      </div>

      {/* Filters: app · platform · country */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'all', name: 'All apps' }, ...apps].map((a) => {
          const on = app === a.id
          return (
            <button key={a.id} onClick={() => setApp(a.id)} aria-pressed={on}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: C.sans,
                       border: `1px solid ${on ? C.ink : C.rule2}`, background: on ? C.ink : C.card, color: on ? '#fff' : C.ink }}>
              {a.id === 'all' ? a.name : <AppTag id={a.id} name={a.name} size={15} />}
            </button>
          )
        })}
        <span style={{ width: 1, height: 22, background: C.rule2, margin: '0 4px' }} />
        {PLATFORMS.map((p) => {
          const on = platform === p.id
          return (
            <button key={p.id} onClick={() => setPlatform(on ? 'all' : p.id)} aria-pressed={on} title={on ? `Showing ${p.name} only` : `Only ${p.name}`}
              style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', border: `1px solid ${on ? C.ink : C.rule2}`, background: on ? C.card : C.card2 }}>
              <PlatformGlyph platform={p.id} size={16} color={platform === 'all' || on ? undefined : C.faint} />
            </button>
          )
        })}
        {country && <button onClick={() => setCountry(null)} style={{ borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans, border: `1px solid ${C.teal}`, background: C.mintTint, color: C.teal }}>
          {country.toUpperCase()} only ×</button>}
      </div>

      {/* KPI tiles for the range */}
      <div className="cal-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        {kpis.map((k, i) => (
          <div key={k.label} style={{ background: TILE[i].bg, border: `1px solid ${TILE[i].line}`, borderRadius: 18, padding: '12px 16px', display: 'grid', gap: 4 }}>
            <span style={labelStyle}>{k.label}{view !== 'day' ? ` · ${view === 'week' ? 'week' : view === 'month' ? 'month' : 'year'}` : ' · day'}</span>
            <span style={{ fontSize: 22, fontWeight: 750, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{fresh ? k.value : '…'}</span>
            {k.note && <span style={{ fontSize: 11.5, color: C.ink2 }}>{k.note}</span>}
          </div>
        ))}
      </div>

      <Cadence apps={apps} app={app} refreshKey={refreshKey} />

      {fresh && fresh.world.length > 0 && <WorldStrip tiles={fresh.world} selected={country} onSelect={setCountry} />}

      {error && !fresh && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {notice && <div role="status" style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, background: notice.ok ? C.mintTint : '#FBE7E5', color: notice.ok ? C.mint : C.red }}>{notice.text}</div>}
      {!fresh && !error ? <div aria-busy="true" style={{ height: 520, borderRadius: 18, background: C.card, border: `1px solid ${C.rule}`, animation: 'cal-skel 1.4s ease-in-out infinite' }} />
        : view === 'month' ? month() : view === 'week' ? timeGrid(Array.from({ length: 7 }, (_, i) => addDays(from, i))) : view === 'day' ? timeGrid([cursor]) : year()}

      {fresh?.errors?.length ? <p style={{ margin: 0, fontSize: 12, color: C.soft }}>Some numbers are missing: {fresh.errors.join(' · ')}</p> : null}
      <p style={{ margin: 0, fontSize: 12, color: C.soft }}>
        Click an empty slot to compose for that time · drag a scheduled post to move it · days show App Store / Google Play installs, proceeds, ad spend{fresh?.scoreboard ? ` and ★ ${fresh.scoreboard.label.toLowerCase()}` : ''}. Stores report a day or two late.
      </p>

      {drawer && <PostDrawer post={drawer} apps={apps} onClose={() => setDrawer(null)}
        onChanged={(np) => { if (np) setDrawer(np); load(); onChanged() }}
        onDuplicate={(p) => { setDrawer(null); onDuplicate(p) }} />}
      <style>{`
        .cal-chip .cal-pop{display:none}
        .cal-chip:hover .cal-pop,.cal-chip:focus-visible .cal-pop{display:block}
        .cal-chip:hover{filter:brightness(.97)}
        @keyframes cal-skel{50%{opacity:.55}}
        @media (max-width: 900px){.cal-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        @media (max-width: 700px){.cal-cad{grid-template-columns:minmax(0,1fr)!important}.cal-month>div{min-height:86px!important}.cal-month .cal-chip b{display:none}.cal-month .cal-foot{display:none!important}}
        @media (prefers-reduced-motion: reduce){[aria-busy]{animation:none!important}}
      `}</style>
    </div>
  )
}

const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.rule2}`, background: C.card, cursor: 'pointer', fontSize: 17, fontWeight: 700, fontFamily: C.sans, color: C.ink }

// ── Cadence meter: is each app with a target posting enough? ────────────────
function Cadence({ apps, app, refreshKey }: { apps: PublishApp[]; app: string; refreshKey: number }) {
  const ids = Object.keys(CADENCE).filter((id) => (app === 'all' || app === id) && apps.some((a) => a.id === id))
  const t = today()
  const ends = ids.map((id) => CADENCE[id].until ?? addDays(t, 13)).filter((d) => d >= t)
  const to = ends.length ? ends.sort().at(-1)! : t
  const [posts, setPosts] = useState<QueuedPost[] | null>(null)
  useEffect(() => {
    if (!ids.length || to < t) return
    let live = true
    fetch(`/api/publish/calendar?from=${t}&to=${to}&app=${ids.length === 1 ? ids[0] : 'all'}&only=posts`).then((r) => r.ok ? r.json() : null)
      .then((b) => { if (live && b) setPosts(b.posts) }).catch(() => {})
    return () => { live = false }
  }, [ids.join(), t, to, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ids.length || !posts) return null
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {ids.map((id) => {
        const c = CADENCE[id], end = c.until ?? addDays(t, 13)
        if (end < t) return null
        const a = apps.find((x) => x.id === id)!
        const mine = posts.filter((p) => p.app_id === id && p.status !== 'failed')
        const dates: string[] = []; for (let d = t; d <= end; d = addDays(d, 1)) dates.push(d)
        const per = dates.map((d) => {
          const list = mine.filter((p) => dayOf(p.scheduled_at ?? p.created_at) === d)
          return { d, posts: list.filter((p) => p.targets.some((x) => x.format !== 'story')).length, stories: list.filter(isStory).length }
        })
        const gaps = per.filter((x) => x.posts < c.posts || x.stories < c.stories)
        const ok = !gaps.length
        const gapText = gaps.slice(0, 4).map((g) => fmtDay(g.d, gaps.length > 6 ? { month: 'short', day: 'numeric' } : { weekday: 'short' })).join(', ')
        return (
          <div key={id} className="cal-cad" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 14, alignItems: 'center', padding: '10px 14px', borderRadius: 14, background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${a.accent}` }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 13.5 }}><AppTag id={id} name={a.name} size={16} style={{ fontWeight: 800 }} /></span>
              <span style={{ fontSize: 12.5, color: C.ink2 }}>{c.posts} post{c.posts === 1 ? '' : 's'}{c.stories ? ` + ${c.stories} stor${c.stories === 1 ? 'y' : 'ies'}` : ''} a day{c.until ? ` through ${fmtDay(c.until, { month: 'short', day: 'numeric' })}` : ''}{' '}
                {ok ? <b style={{ color: C.teal }}>✓ covered</b> : <b style={{ color: C.amber }}>gap{gaps.length > 1 ? 's' : ''} on {gapText}{gaps.length > 4 ? ` +${gaps.length - 4}` : ''}</b>}</span>
            </div>
            <div role="img" aria-label={`${per.length - gaps.length} of ${per.length} days covered`} style={{ display: 'grid', gridTemplateColumns: `repeat(${per.length}, minmax(6px, 1fr))`, gap: 3, alignItems: 'end', height: 30 }}>
              {per.map((x) => {
                const fill = Math.min(1, (x.posts / Math.max(1, c.posts) + (c.stories ? x.stories / c.stories : 1)) / 2)
                const full = x.posts >= c.posts && x.stories >= c.stories
                return <span key={x.d} title={`${fmtDay(x.d, { weekday: 'short', month: 'short', day: 'numeric' })}: ${x.posts} post${x.posts === 1 ? '' : 's'} · ${x.stories} stor${x.stories === 1 ? 'y' : 'ies'}`}
                  style={{ height: `${20 + 80 * fill}%`, borderRadius: 4, background: full ? C.teal : x.posts || x.stories ? '#E9B872' : C.rule2, boxShadow: full ? `0 0 8px ${C.glow}66` : undefined }} />
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

