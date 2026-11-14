'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react'
import { AppTag, C, btn } from '@/components/AdminNav'
import { PLATFORMS, FORMAT_LABEL, type Format } from '@/lib/publish/rules'
import { PlatformGlyph, allMediaOf, card, label, when, type PublishApp, type QueuedPost, type QueuedSeries } from './shared'
import { MediaViewer, Thumb } from './MediaViewer'
import { describeRule } from '@/lib/publish/recur'
import { PromoteSheet, Promotions, promotable, type AdsData, type PromotionRow } from './Promote'
import { TikTokVideoPicker, tiktokTarget, type AccountVideo, type TikTokAdsData } from './PromoteTikTok'
import { MARKETS, type Market, type MarketId } from '@/lib/publish/markets'
import { CountryTag, FlagStack, countryOf, marketOf } from './country'
import { PostDrawer, statusOf } from './PostDrawer'

// Repeating posts (pause / resume / stop), then everything scheduled, in
// flight, and recently sent — with the per-platform
// outcome, links to the live posts, and cancel / retry.

/** Queue items: a lone post, or the editions of one multi-country post kept together. */
type Item = { kind: 'post'; post: QueuedPost } | { kind: 'editions'; key: string; posts: QueuedPost[] }
function groupEditions(list: QueuedPost[]): Item[] {
  const out: Item[] = []
  const seen = new Map<string, Extract<Item, { kind: 'editions' }>>()
  for (const p of list) {
    if (!p.edition_group) { out.push({ kind: 'post', post: p }); continue }
    const g = seen.get(p.edition_group)
    if (g) g.posts.push(p)
    else { const n = { kind: 'editions' as const, key: p.edition_group, posts: [p] }; seen.set(p.edition_group, n); out.push(n) }
  }
  // A group of one is just a post.
  return out.map((i) => (i.kind === 'editions' && i.posts.length === 1 ? { kind: 'post', post: i.posts[0] } : i))
}

export function Queue({ pw, apps, refreshKey, onCount, onCompose, onDuplicate, onChanged }: {
  pw: string; apps: PublishApp[]; refreshKey: number; onCount: (n: number) => void; onCompose?: () => void
  /** Open the composer with this post's words and media. */
  onDuplicate?: (p: QueuedPost) => void
  /** Something in the queue changed here (the Calendar reloads). */
  onChanged?: () => void
}) {
  const [drawer, setDrawer] = useState<{ post: QueuedPost; start?: 'edit' | 'reschedule' } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const pick = (id: string) => setSelected((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [posts, setPosts] = useState<QueuedPost[] | null>(null)
  const [series, setSeries] = useState<QueuedSeries[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ads, setAds] = useState<AdsData | null>(null)
  const [promoting, setPromoting] = useState<QueuedPost | null>(null)
  const [tt, setTt] = useState<TikTokAdsData | null>(null)
  const [pickingVideo, setPickingVideo] = useState<PublishApp | null>(null)
  const [boostingVideo, setBoostingVideo] = useState<AccountVideo | null>(null)
  const [viewing, setViewing] = useState<{ media: QueuedPost['media']; index: number } | null>(null)
  const [appFilter, setAppFilter] = useState<string>('all')
  // All-apps view: lanes per app, or per country (remembered in this browser).
  const [view, setViewState] = useState<'app' | 'country'>('app')
  useEffect(() => { try { if (localStorage.getItem('clarendon:queue-view') === 'country') setViewState('country') } catch { /* private mode */ } }, [])
  const setView = (v: 'app' | 'country') => { setViewState(v); try { localStorage.setItem('clarendon:queue-view', v) } catch { /* ignore */ } }
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const loadAds = useCallback(async () => {
    const [r, t] = await Promise.all([
      fetch('/api/ads/meta').then((x) => (x.ok ? x.json() : null)).catch(() => null),
      fetch('/api/ads/tiktok').then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ])
    if (r) setAds(r)
    if (t) setTt(t)
  }, [])
  /** Meta and TikTok boosts in one list, newest first. */
  const allPromotions: PromotionRow[] = [
    ...(ads?.promotions ?? []).map((p) => ({ ...p, network: (p.network ?? 'meta') as 'meta' | 'tiktok' })),
    ...((tt?.promotions ?? []) as PromotionRow[]).map((p) => ({ ...p, network: 'tiktok' as const })),
  ].sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))
  const canPromote = (p: QueuedPost) => (ads ? promotable(p).length > 0 : false) || (!!tt && !!tiktokTarget(p))
  useEffect(() => { loadAds() }, [loadAds, refreshKey])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/publish', { headers: {} })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setPosts(body.posts); setSeries(body.series ?? []); onCount(body.posts.filter((p: QueuedPost) => p.status === 'scheduled').length); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [pw, onCount])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    if (!posts?.some((p) => p.status === 'publishing')) return
    const t = setInterval(() => { fetch('/api/publish/run', { method: 'POST' }).catch(() => {}); load() }, 10000)
    return () => clearInterval(t)
  }, [posts, load])

  // What the last retry / clear did, as a toast — a retry that fails again
  // otherwise looks like nothing happened (the card already said "failed").
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!notice?.ok) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])
  const pname = (id: string) => PLATFORMS.find((x) => x.id === id)?.name ?? id

  const act = async (id: string, method: 'DELETE' | 'PATCH', action?: string) => {
    setBusy(id); setNotice(null)
    const res = await fetch(`/api/publish?id=${id}${action ? `&action=${action}` : ''}`, { method, headers: {} })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Something went wrong.'); setNotice({ ok: false, text: `${method === 'PATCH' ? 'Retry' : 'Clear'} failed: ${body.error ?? `HTTP ${res.status}`}` }) }
    else if (method === 'PATCH' && !action && body.post) {
      const p = body.post as QueuedPost
      const bad = p.targets.filter((t) => t.status === 'failed')
      if (p.status === 'done') setNotice({ ok: true, text: 'Posted.' })
      else if (p.status === 'publishing') setNotice({ ok: true, text: 'Still publishing — the platforms are processing the media; this updates on its own.' })
      else if (bad.length) setNotice({ ok: false, text: `Retry failed — ${bad.map((t) => `${pname(t.platform)}: ${t.error ?? 'no reason given'}`).join(' · ')}` })
    }
    setBusy(null); load()
  }

  /** Clear every failed post (for one app), after a confirm. */
  const clearFailed = async (appId: string | undefined, n: number) => {
    if (!confirm(`Clear ${n} failed post${n === 1 ? '' : 's'}? Anything that did go out stays up — only the failures leave the queue.`)) return
    setBusy(`clear:${appId ?? 'all'}`)
    const res = await fetch(`/api/publish?failed=all${appId ? `&app=${appId}` : ''}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); load()
  }

  const control = async (id: string, action: 'pause' | 'resume' | 'end') => {
    if (action === 'end' && !confirm('Stop this repeating post? The copy waiting in the queue is skipped. Posts already out stay up.')) return
    setBusy(id)
    const res = await fetch(`/api/publish/series?id=${id}&action=${action}`, { method: 'PATCH' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); load()
  }

  if (error && !posts) return <p style={{ color: C.red }}>{error}</p>
  if (!posts) return <p style={{ color: C.soft }}>Loading the queue…</p>

  const inApp = <T extends { app_id: string }>(x: T) => appFilter === 'all' || x.app_id === appFilter
  const scheduled = posts.filter((p) => p.status === 'scheduled' && inApp(p)).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const rest = posts.filter((p) => p.status !== 'scheduled' && inApp(p))
  const shownSeries = series.filter(inApp)
  const shownAds = ads ? { ...ads, promotions: allPromotions.filter(inApp) } : null
  // Apps that have anything in the queue, in the sidebar's order, with what's coming up.
  const appIds = apps.map((a) => a.id).filter((id) => posts.some((p) => p.app_id === id) || series.some((r) => r.app_id === id))
  // Apps with nothing at all still get a slim lane, so every app is visible.
  const idleIds = apps.map((a) => a.id).filter((id) => !appIds.includes(id))
  const upcoming = (id: string) => posts.filter((p) => p.status === 'scheduled' && p.app_id === id).length
  const chip = (id: string, text: React.ReactNode, n: number) => {
    const on = appFilter === id
    return (
      <button key={id} onClick={() => setAppFilter(id)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 99, padding: '6px 13px', fontSize: 13, fontWeight: 650, cursor: 'pointer',
                 border: `1px solid ${on ? C.ink : C.rule2}`, background: on ? C.ink : C.card, color: on ? '#fff' : C.ink }}>
        {text}{n > 0 && <span style={{ fontSize: 11.5, opacity: 0.7 }}>{n}</span>}
      </button>
    )
  }

  const groupByApp = (list: QueuedPost[]): [string, QueuedPost[]][] => {
    if (appFilter !== 'all') return [[appFilter, list]]
    const order = apps.map((a) => a.id)
    const m = new Map<string, QueuedPost[]>()
    for (const p of list) m.set(p.app_id, [...(m.get(p.app_id) ?? []), p])
    return Array.from(m.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }

  const dayFmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const small: React.CSSProperties = { ...btn('ghost'), padding: '5px 11px', fontSize: 12, borderRadius: 9 }
  // Dense list (Up next / Recent for one app): thumbnail · time · caption on two
  // lines · where · status. A row opens the detail drawer; scheduled rows can be
  // ticked for bulk cancel / shift.
  const section = (title: string, list: QueuedPost[], empty: string, selectable = false) => {
    const ids = list.filter((p) => p.status === 'scheduled').map((p) => p.id)
    const allOn = selectable && ids.length > 0 && ids.every((id) => selected.has(id))
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectable && ids.length > 1 && (
            <input type="checkbox" aria-label={`Select all ${title}`} checked={allOn} onChange={() => setSelected((x) => { const n = new Set(x); for (const id of ids) { if (allOn) n.delete(id); else n.add(id) } return n })}
              style={{ width: 16, height: 16, accentColor: C.mint, cursor: 'pointer' }} />
          )}
          <span style={label}>{title}</span><span style={{ fontSize: 12, color: C.soft }}>{list.length || ''}</span><span style={{ flex: 1, height: 1, background: C.rule }} />
        </div>
        {list.length === 0 ? <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>{empty}</p> : (
          <div style={{ ...card, padding: '2px 0', overflow: 'hidden' }}>
            {list.map((p, i) => denseRow(p, i, selectable && p.status === 'scheduled'))}
          </div>
        )}
      </section>
    )
  }
  const denseRow = (p: QueuedPost, i: number, selectable: boolean) => {
    const app = apps.find((a) => a.id === p.app_id)
    const s = statusOf(p.status)
    const every = allMediaOf(p)
    const first = every[0]
    const at = p.scheduled_at ?? p.created_at
    const mk = marketOf(p)
    const bad = p.status === 'failed' || p.status === 'partial'
    const on = selected.has(p.id)
    return (
      <div key={p.id} className="q-row" onClick={() => setDrawer({ post: p })} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setDrawer({ post: p }) }}
        style={{ display: 'grid', gridTemplateColumns: '22px 52px 74px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 16px', cursor: 'pointer',
                 borderTop: i ? `1px solid ${C.rule}` : 0, background: on ? C.mintTint : undefined, boxShadow: appFilter === 'all' ? `inset 3px 0 0 ${app?.accent ?? C.mint}` : undefined }}>
        <span onClick={(e) => e.stopPropagation()}>
          {selectable && <input type="checkbox" aria-label="Select post" checked={on} onChange={() => pick(p.id)} style={{ width: 16, height: 16, accentColor: C.mint, cursor: 'pointer' }} />}
        </span>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: C.card2, position: 'relative' }}>
          {first ? <Thumb item={first} onOpen={() => setViewing({ media: every, index: 0 })} badge={every.length > 1 ? String(every.length) : undefined} />
            : <span style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 10.5, color: C.soft }}>Text</span>}
        </div>
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: bad ? C.red : C.ink }}>{dayFmt(at)}</div>
          <div style={{ fontSize: 12, color: C.soft }}>{timeFmt(at)}</div>
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {p.caption || <i style={{ color: C.soft }}>No caption</i>}
          </span>
          <span style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            {appFilter === 'all' && <AppTag id={p.app_id} name={app?.name} size={14} style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2 }} />}
            {p.targets.map((t) => <span key={t.platform} title={`${pname(t.platform)}${t.platform === 'instagram' || t.platform === 'facebook' ? ` ${FORMAT_LABEL[t.format as Format]}` : ''} · ${t.status}${t.error ? ` — ${t.error}` : ''}`} style={{ display: 'inline-flex' }}>
              <PlatformGlyph platform={t.platform} size={14} color={t.status === 'failed' ? C.red : t.status === 'published' ? C.mint : C.soft} /></span>)}
            {mk && <CountryTag m={mk} size={11} short />}
            {p.series_id && <span style={{ fontSize: 11, color: C.soft }}>↻ #{p.occurrence ?? '?'}</span>}
            {p.caption_by === 'ai' && <span style={{ fontSize: 11, fontWeight: 700, color: C.mint }}>✦ AI</span>}
            {p.stats && Object.values(p.stats).length > 0 && <span style={{ fontSize: 11.5, color: C.ink2 }}>{Object.values(p.stats).reduce((t, x) => t + (x?.reach ?? 0), 0).toLocaleString()} reached</span>}
            {bad && <span style={{ fontSize: 11.5, color: C.red, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.targets.filter((t) => t.status === 'failed').map((t) => pname(t.platform)).join(', ')} failed</span>}
          </span>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap' }}>{s.text}</span>
      </div>
    )
  }

  /** Bulk: cancel or shift every ticked scheduled post. */
  const bulk = async (action: 'cancel' | 'shift', minutes?: number) => {
    const ids = Array.from(selected)
    if (action === 'cancel' && !confirm(`Cancel ${ids.length} scheduled post${ids.length === 1 ? '' : 's'}? Copies of repeating posts are skipped.`)) return
    setBusy('bulk'); setNotice(null)
    const res = await fetch('/api/publish/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action, ...(minutes ? { minutes } : {}) }) }).catch(() => null)
    const body = await res?.json().catch(() => ({})) ?? {}
    setBusy(null)
    if (!res?.ok) setNotice({ ok: false, text: body.error ?? 'Bulk change failed.' })
    else {
      const n = body.updated?.length ?? 0, k = body.skipped?.length ?? 0
      const why = Array.from(new Set(((body.skipped ?? []) as { reason: string }[]).map((x) => x.reason))).join(' ')
      setNotice({ ok: k === 0, text: `${action === 'cancel' ? 'Canceled' : 'Moved'} ${n} post${n === 1 ? '' : 's'}${k ? ` · ${k} left alone (${why})` : ''}.` })
      setSelected(new Set())
    }
    load(); onChanged?.()
  }

  // "All apps": one lane per app — what's next, what needs attention, how it's
  // going — instead of every card from every app in one long column. Picking
  // an app (or "Open") switches to the full cards for that app.
  type RowOpts = { tone?: 'bad'; country?: boolean; app?: boolean; tz?: string; nested?: boolean }
  const zoned = (iso: string, tz: string) => {
    const d = new Date(iso)
    return { day: d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', day: 'numeric' }), time: d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) }
  }
  const row = (p: QueuedPost, o: RowOpts = {}) => {
    const { tone } = o
    const at = p.scheduled_at ?? p.created_at
    const mk = o.country ? marketOf(p) : null
    // In a country lane the time is shown in that country, with Brian's own time under it.
    const local = o.tz ? zoned(at, o.tz) : null
    const app = apps.find((a) => a.id === p.app_id)
    return (
      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: o.nested ? '58px minmax(0,1fr) auto' : '58px 40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: o.nested ? '8px 0 8px 0' : '10px 0', borderTop: `1px solid ${C.rule}`,
                                   ...(o.app ? { boxShadow: `inset 3px 0 0 ${app?.accent ?? C.mint}`, paddingLeft: 10 } : {}) }}>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: tone ? C.red : C.ink }}>{local ? local.day : dayFmt(at)}</div>
          <div style={{ fontSize: 11.5, color: C.soft }}>{local ? local.time : timeFmt(at)}</div>
          {local && local.time !== timeFmt(at) && <div title="Your time (Chicago)" style={{ fontSize: 10.5, color: C.faint, whiteSpace: 'nowrap' }}>{timeFmt(at)} yours</div>}
        </div>
        {!o.nested && (
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: C.card2 }}>
            {p.media[0] ? <Thumb item={p.media[0]} onOpen={() => setViewing({ media: p.media, index: 0 })} /> : null}
          </div>
        )}
        <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
          {o.app && <AppTag id={p.app_id} name={app?.name} size={15} style={{ fontSize: 12, fontWeight: 700, color: C.ink }} />}
          <button onClick={() => setDrawer({ post: p })} title="Open details"
            style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: C.ink2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {p.caption || <i>No caption</i>}
          </button>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
            {mk && <CountryTag m={mk} size={11} short />}
            {p.targets.map((t) => <PlatformGlyph key={t.platform} platform={t.platform} size={13} color={t.status === 'failed' ? C.red : t.status === 'published' ? C.mint : C.soft} />)}
            {p.series_id && <span style={{ fontSize: 11, color: C.soft }}>↻ #{p.occurrence ?? '?'}</span>}
            {p.caption_by === 'ai' && <span style={{ fontSize: 11, fontWeight: 700, color: C.mint }}>✦ AI</span>}
            {tone && <span style={{ fontSize: 11.5, color: C.red, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.targets.filter((t) => t.status === 'failed').map((t) => pname(t.platform)).join(', ')} failed</span>}
          </span>
          {tone && p.targets.filter((t) => t.status === 'failed' && t.error).map((t) => (
            <span key={t.platform} title={t.error} style={{ fontSize: 11.5, color: C.red, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pname(t.platform)}: {t.error}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tone && <button style={{ ...small, ...btn('solid'), padding: '5px 11px', fontSize: 12, borderRadius: 9 }} disabled={busy === p.id} onClick={() => act(p.id, 'PATCH')}>{busy === p.id ? '…' : 'Retry'}</button>}
          {tone && <button style={small} disabled={busy === p.id} title="Remove the failure from the queue" onClick={() => act(p.id, 'DELETE')}>Clear</button>}
          {!tone && p.status === 'scheduled' && <button style={small} onClick={() => setDrawer({ post: p, start: 'edit' })}>Edit</button>}
          {!tone && <button style={small} disabled={busy === p.id} onClick={() => act(p.id, 'DELETE')}>{p.series_id ? 'Skip' : 'Cancel'}</button>}
        </div>
      </div>
    )
  }
  // One multi-country post: a single row (flags, local time, caption of the
  // first edition) that opens to each country's edition with its own time.
  const editions = (it: Extract<Item, { kind: 'editions' }>) => {
    const first = it.posts[0]
    const ms = it.posts.map((p) => countryOf(p))
    const isOpen = open.has(it.key)
    const at = first.scheduled_at ?? first.created_at
    const sameLocal = new Set(it.posts.map((p) => { const m = countryOf(p); return zoned(p.scheduled_at ?? p.created_at, m.tz).time })).size === 1
    return (
      <div key={it.key} style={{ borderTop: `1px solid ${C.rule}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '58px 40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0' }}>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{dayFmt(at)}</div>
            <div style={{ fontSize: 11.5, color: C.soft }}>{sameLocal ? `${zoned(at, ms[0].tz).time} local` : timeFmt(at)}</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: C.card2 }}>
            {first.media[0] ? <Thumb item={first.media[0]} onOpen={() => setViewing({ media: first.media, index: 0 })} /> : null}
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
            <button onClick={() => setDrawer({ post: first })} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: C.ink2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{first.caption || <i>No caption</i>}</button>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FlagStack markets={ms} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2 }}>{ms.length} countries{sameLocal ? ' · same local time' : ''}</span>
            </span>
          </div>
          <button style={small} aria-expanded={isOpen} onClick={() => toggle(it.key)}>{isOpen ? 'Hide' : 'Editions'}</button>
        </div>
        {isOpen && (
          <div style={{ margin: '0 0 8px 70px', borderLeft: `2px solid ${C.rule}`, paddingLeft: 12 }}>
            {it.posts.map((p) => row(p, { country: true, tz: countryOf(p).tz, nested: true }))}
          </div>
        )}
      </div>
    )
  }

  // By country: one lane per country that has anything scheduled, times in
  // that country's own clock; rows carry their app (tag + accent bar).
  const countryLane = (m: Market, list: QueuedPost[], trouble: QueuedPost[], wide = false) => {
    const SHOW = wide ? 8 : 4
    const nowThere = new Date().toLocaleTimeString('en-US', { timeZone: m.tz, hour: 'numeric', minute: '2-digit' })
    const appsHere = Array.from(new Set(list.map((p) => p.app_id)))
    return (
      <article key={m.id} style={{ ...card, padding: 0, overflow: 'hidden', display: 'grid', breakInside: 'avoid', marginBottom: 14 }}>
        <div style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{m.flag}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: C.soft }}>{m.langName} · {list.length} scheduled · {nowThere} there now</div>
          </div>
          <span style={{ display: 'flex', gap: 4 }}>{appsHere.map((a) => <AppTag key={a} id={a} name="" size={18} />)}</span>
        </div>
        {/* A lone country gets the full width, its rows in two columns. */}
        <div style={{ padding: '4px 18px 8px', ...(wide ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', columnGap: 28 } : {}) }}>
          {trouble.map((p) => row(p, { tone: 'bad', app: true, tz: m.tz }))}
          {list.slice(0, SHOW).map((p) => row(p, { app: true, tz: m.tz }))}
          {list.length > SHOW && <p style={{ margin: '8px 0 4px', fontSize: 12, color: C.soft }}>+{list.length - SHOW} more — pick an app above to see them all</p>}
        </div>
      </article>
    )
  }

  const lane = (id: string) => {
    const a = apps.find((x) => x.id === id)
    const next = posts.filter((p) => p.status === 'scheduled' && p.app_id === id).sort((x, y) => (x.scheduled_at ?? '').localeCompare(y.scheduled_at ?? ''))
    const items = groupEditions(next)
    // One country across the lane → say it once in the header, not on every row.
    const laneMarkets = Array.from(new Map(next.map((p) => marketOf(p)).filter((m): m is Market => !!m).map((m) => [m.id, m])).values())
    const mixed = laneMarkets.length > 1
    const troubleAll = posts.filter((p) => (p.status === 'failed' || p.status === 'partial') && p.app_id === id)
    const trouble = troubleAll.slice(0, 2)
    const sent = posts.filter((p) => (p.status === 'done' || p.status === 'partial') && p.app_id === id)
    const last = sent[0]
    const boosts = allPromotions.filter((x) => x.app_id === id && x.status === 'active').length
    const reps = series.filter((r) => r.app_id === id && r.status === 'active').length
    const SHOW = 3
    return (
      <article key={id} style={{ ...card, padding: 0, overflow: 'hidden', display: 'grid', breakInside: 'avoid', marginBottom: 14 }}>
        <div style={{ height: 4, background: a?.accent ?? C.mint }} />
        <div style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <AppTag id={id} name={a?.name} size={28} style={{ fontWeight: 800, fontSize: 15.5 }} />
            <div style={{ fontSize: 12, color: C.soft, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{next.length ? `${next.length} scheduled · next ${when(next[0].scheduled_at!)}` : 'Nothing scheduled'}</span>
              {reps > 0 && <span>↻ {reps} repeating</span>}
              {boosts > 0 && <span style={{ color: C.mint, fontWeight: 700 }}>● {boosts} boost{boosts === 1 ? '' : 's'} running</span>}
            </div>
            {laneMarkets.length === 1 && <div style={{ marginTop: 6 }}><CountryTag m={laneMarkets[0]} size={11} /></div>}
            {(() => {
              const counts = new Map<string, { m: Market; n: number }>()
              for (const p of next) { const m = marketOf(p); if (m) counts.set(m.id, { m, n: (counts.get(m.id)?.n ?? 0) + 1 }) }
              return counts.size > 1 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {Array.from(counts.values()).map(({ m, n }) => <span key={m.id} title={m.name} style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, background: C.card2, borderRadius: 99, padding: '2px 8px' }}>{m.flag} {m.short} {n}</span>)}
                </div>
              ) : null
            })()}
          </div>
          <button style={small} onClick={() => setAppFilter(id)}>Open</button>
        </div>
        <div style={{ padding: '4px 18px 6px' }}>
          {trouble.map((p) => row(p, { tone: 'bad', country: mixed }))}
          {troubleAll.length > 0 && (
            <button style={{ ...small, margin: '2px 0 8px' }} disabled={busy === `clear:${id}`} onClick={() => clearFailed(id, troubleAll.length)}>
              {busy === `clear:${id}` ? 'Clearing…' : troubleAll.length > 1 ? `Clear all ${troubleAll.length} failed` : 'Clear failed'}
            </button>
          )}
          {items.slice(0, SHOW).map((it) => it.kind === 'post' ? row(it.post, { country: mixed }) : editions(it))}
          {!next.length && !trouble.length && <p style={{ margin: '8px 0 10px', fontSize: 12.5, color: C.soft, borderTop: `1px solid ${C.rule}`, paddingTop: 10 }}>Queue is empty — compose one to keep the account warm.</p>}
        </div>
        <div style={{ padding: '10px 18px', background: C.card2, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.ink2, marginTop: 'auto' }}>
          <span style={{ flex: 1 }}>
            {last ? <>Last posted {when(last.scheduled_at ?? last.created_at)}{last.targets.filter((t) => t.permalink).slice(0, 2).map((t) => <a key={t.platform} href={t.permalink} target="_blank" rel="noreferrer" style={{ color: C.mint, fontWeight: 700, marginLeft: 6 }}>{PLATFORMS.find((x) => x.id === t.platform)?.name} ↗</a>)}</> : 'Nothing posted yet'}
          </span>
          {items.length > SHOW && <button onClick={() => setAppFilter(id)} style={{ border: 0, background: 'transparent', color: C.mint, fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: C.sans }}>+{items.length - SHOW} more</button>}
        </div>
      </article>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {notice && (
        <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, fontWeight: 700, fontSize: 13.5, lineHeight: 1.45,
                                    background: notice.ok ? C.mintTint : '#FBE7E5', color: notice.ok ? C.mint : C.red }}>
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ all: 'unset', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {appIds.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip('all', 'All apps', posts.filter((p) => p.status === 'scheduled').length)}
          {appIds.map((id) => { const a = apps.find((x) => x.id === id)!; return chip(id, <AppTag id={a.id} name={a.name} size={16} />, upcoming(id)) })}
        </div>
      )}
      {shownSeries.length > 0 && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={label}>Repeating</span><span style={{ flex: 1, height: 1, background: C.rule }} />
          </div>
          {shownSeries.map((r) => {
            const app = apps.find((a) => a.id === r.app_id)
            const first = r.media[0]
            const paused = r.status === 'paused'
            return (
              <article key={r.id} style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: C.card2 }}>
                  {first && <Thumb item={first} onOpen={() => setViewing({ media: r.media, index: 0 })} />}
                </div>
                <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {app && <img src={app.icon} alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                    <b style={{ fontSize: 14 }}>{app?.name ?? r.app_id}</b>
                    <span style={{ fontSize: 13, color: C.ink2 }}>↻ {describeRule(r.rule)}</span>
                    {paused && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, background: '#FBF0DD', borderRadius: 99, padding: '2px 9px' }}>Paused</span>}
                  </div>
                  <span style={{ fontSize: 12.5, color: C.soft }}>
                    {r.runs} sent{r.max_runs ? ` of ${r.max_runs}` : ''}
                    {!paused && r.next_at ? ` · then ${when(r.next_at)}` : ''}
                    {r.ends_at ? ` · ends ${new Date(r.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    {' · '}{r.caption_mode === 'fresh' ? 'fresh AI caption each time' : 'same caption each time'}
                    {' · '}{r.targets.map((t) => PLATFORMS.find((x) => x.id === t.platform)?.name).join(', ')}
                  </span>
                  {r.last_error && <span style={{ fontSize: 12, color: C.amber }}>{r.last_error}</span>}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button style={btn('ghost')} disabled={busy === r.id} onClick={() => control(r.id, paused ? 'resume' : 'pause')}>{paused ? 'Resume' : 'Pause'}</button>
                  <button style={{ ...btn('ghost'), color: C.red }} disabled={busy === r.id} onClick={() => control(r.id, 'end')}>Stop</button>
                </div>
              </article>
            )
          })}
        </section>
      )}
      {tt && (
        <section style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={label}>Boost on TikTok</span>
          <span style={{ fontSize: 12.5, color: C.ink2 }}>A video already on an app’s TikTok (posted from the phone, say) can be boosted too — never from the TikTok app’s own Promote button.</span>
          {apps.filter((a) => tt.statusByApp?.[a.id]?.ready).map((a) => (
            <button key={a.id} style={{ ...btn('ghost'), padding: '5px 11px', fontSize: 12.5 }} onClick={() => setPickingVideo(a)}>{a.name}: pick a video</button>
          ))}
          {!apps.some((a) => tt.statusByApp?.[a.id]?.ready) && <span style={{ fontSize: 12.5, color: C.amber }}>{Object.values(tt.statusByApp ?? {})[0]?.reasons?.[0] ?? 'TikTok ads aren’t connected yet.'}</span>}
        </section>
      )}
      {shownAds && <Promotions ads={shownAds} apps={apps} onChange={loadAds} />}
      {viewing && <MediaViewer media={viewing.media} start={viewing.index} onClose={() => setViewing(null)} />}
      {drawer && <PostDrawer post={drawer.post} start={drawer.start} apps={apps} onClose={() => setDrawer(null)}
        onChanged={(np) => { if (np) setDrawer((d) => d ? { post: np } : d); load(); onChanged?.() }}
        onDuplicate={(p) => { setDrawer(null); onDuplicate?.(p) }}
        onPromote={(p) => { if (canPromote(p)) { setDrawer(null); setPromoting(p) } }} />}
      {selected.size > 0 && (
        <div role="toolbar" aria-label="Selected posts" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: 'min(760px, calc(100vw - 32px))', boxSizing: 'border-box', zIndex: 40, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                                                               padding: '10px 14px', borderRadius: 14, background: C.ink, color: '#fff', boxShadow: '0 12px 30px rgba(15,17,21,.25)' }}>
          <b style={{ fontSize: 13.5 }}>{selected.size} selected</b>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, opacity: 0.75 }}>Shift</span>
          {([[-60, '−1 h'], [60, '+1 h'], [1440, '+1 day'], [10080, '+1 week']] as const).map(([m, l]) => (
            <button key={l} disabled={busy === 'bulk'} onClick={() => bulk('shift', m)} style={{ border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: '#fff', borderRadius: 9, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>{l}</button>
          ))}
          <button disabled={busy === 'bulk'} onClick={() => bulk('cancel')} style={{ border: 0, background: '#fff', color: C.red, borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: C.sans }}>{busy === 'bulk' ? 'Working…' : 'Cancel posts'}</button>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" style={{ all: 'unset', cursor: 'pointer', fontSize: 18, padding: '0 6px' }}>×</button>
        </div>
      )}
      {promoting && ads && <PromoteSheet post={promoting} app={apps.find((a) => a.id === promoting.app_id)} ads={ads} tt={tt} onClose={() => setPromoting(null)} onDone={() => { setPromoting(null); loadAds() }} />}
      {pickingVideo && <TikTokVideoPicker app={pickingVideo} onClose={() => setPickingVideo(null)} onPick={(v) => { setPickingVideo(null); setBoostingVideo(v) }} />}
      {boostingVideo && ads && <PromoteSheet video={boostingVideo} app={apps.find((a) => a.id === boostingVideo.appId)} ads={ads} tt={tt} onClose={() => setBoostingVideo(null)} onDone={() => { setBoostingVideo(null); loadAds() }} />}
      {appFilter === 'all' && appIds.length > 1 ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={label}>{view === 'app' ? 'By app' : 'By country'}</span><span style={{ flex: 1, height: 1, background: C.rule }} />
            <div role="radiogroup" aria-label="Group the queue" style={{ display: 'inline-flex', background: C.card2, borderRadius: 9, padding: 3 }}>
              {(['app', 'country'] as const).map((v) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}
                  style={{ border: 0, borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: C.sans, cursor: 'pointer',
                           background: view === v ? C.card : 'transparent', color: view === v ? C.ink : C.soft, boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                  {v === 'app' ? 'Apps' : 'Countries'}
                </button>
              ))}
            </div>
          </div>
          {/* Masonry: lanes of different heights pack without holes. */}
          <div style={{ columnWidth: 420, columnGap: 14 }}>
            {view === 'app' ? appIds.map(lane) : null}
          </div>
          {view === 'country' && (() => {
              const order = Object.keys(MARKETS) as MarketId[]
              const by = new Map<MarketId, { list: QueuedPost[]; trouble: QueuedPost[] }>()
              for (const p of posts) {
                const failed = p.status === 'failed' || p.status === 'partial'
                if (p.status !== 'scheduled' && !failed) continue
                const m = countryOf(p).id
                const x = by.get(m) ?? { list: [], trouble: [] }
                if (failed) { if (x.trouble.length < 2) x.trouble.push(p) } else x.list.push(p)
                by.set(m, x)
              }
              const ids = order.filter((id) => by.has(id))
              const lanes = ids.map((id) => {
                const x = by.get(id)!
                x.list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
                return countryLane(MARKETS[id], x.list, x.trouble, ids.length === 1)
              })
              return (
                <>
                  <div style={{ columnWidth: ids.length === 1 ? undefined : 420, columnGap: 14 }}>{lanes}</div>
                  {ids.length === 1 && <p style={{ margin: 0, fontSize: 12.5, color: C.soft }}>Everything scheduled is for {MARKETS[ids[0]].name}. Pick more countries in Compose to post editions elsewhere.</p>}
                </>
              )
            })()}
          {idleIds.length > 0 && (
            <div style={{ ...card, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: C.soft }}>Nothing scheduled</span>
              {idleIds.map((id) => {
                const a = apps.find((x) => x.id === id)
                return <span key={id} style={{ borderLeft: `3px solid ${a?.accent ?? C.mint}`, paddingLeft: 8 }}><AppTag id={id} name={a?.name} size={18} style={{ fontWeight: 700, fontSize: 13.5 }} /></span>
              })}
              <span style={{ flex: 1 }} />
              {onCompose && <button style={small} onClick={onCompose}>Compose</button>}
            </div>
          )}
        </section>
      ) : (<>
        {section('Up next', scheduled, 'Nothing scheduled. Posts you schedule land here.', true)}
        {section('Recent', rest, 'Nothing posted from Studio yet.')}
      </>)}
    </div>
  )
}
