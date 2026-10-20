'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppTag, C, btn } from '@/components/AdminNav'
import { PLATFORMS, FORMAT_LABEL, type Format } from '@/lib/publish/rules'
import { PlatformGlyph, card, label, when, type PublishApp, type QueuedPost, type QueuedSeries } from './shared'
import { describeRule } from '@/lib/publish/recur'
import { PromoteSheet, Promotions, promotable, type AdsData } from './Promote'
import { APP_MARKETS, isMarket, MARKETS, type Market, type MarketId } from '@/lib/publish/markets'

// Repeating posts (pause / resume / stop), then everything scheduled, in
// flight, and recently sent — with the per-platform
// outcome, links to the live posts, and cancel / retry.

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  scheduled: { text: 'Scheduled', color: C.ink2, bg: C.card2 },
  publishing: { text: 'Publishing…', color: C.amber, bg: '#FBF0DD' },
  done: { text: 'Posted', color: C.mint, bg: C.mintTint },
  partial: { text: 'Partly posted', color: C.amber, bg: '#FBF0DD' },
  failed: { text: 'Failed', color: C.red, bg: '#FBE7E5' },
}

/** Which country a post is for. Only apps that post to more than one country
 *  show it; a post without a market is the app's home edition. */
function marketOf(p: { app_id: string; market?: string | null }): Market | null {
  const list = APP_MARKETS[p.app_id] ?? ['us']
  if (list.length < 2) return null
  return MARKETS[isMarket(p.market) ? p.market : list[0]]
}
/** The country a post is for in the By-country view: single-country apps are home (US). */
function countryOf(p: { app_id: string; market?: string | null }): Market {
  return marketOf(p) ?? MARKETS[(APP_MARKETS[p.app_id] ?? ['us'])[0]]
}

/** Up to four flags, overlapping, for an edition group ("3 countries"). */
function FlagStack({ markets }: { markets: Market[] }) {
  const shown = markets.slice(0, 4)
  return (
    <span title={markets.map((m) => m.name).join(', ')} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <span key={m.id} aria-hidden style={{ width: 20, height: 20, borderRadius: 99, background: C.card, border: `1.5px solid ${C.card}`, boxShadow: `0 0 0 1px ${C.rule}`,
                                              display: 'grid', placeItems: 'center', fontSize: 12, marginLeft: i ? -6 : 0, zIndex: shown.length - i }}>{m.flag}</span>
      ))}
      {markets.length > shown.length && <span style={{ fontSize: 11, fontWeight: 700, color: C.soft, marginLeft: 4 }}>+{markets.length - shown.length}</span>}
    </span>
  )
}

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

function CountryTag({ m, size = 12 }: { m: Market; size?: number }) {
  return (
    <span title={`${m.name} · ${m.langName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size, fontWeight: 700, color: C.ink, background: C.card2, borderRadius: 99, padding: '2px 8px 2px 6px', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ fontSize: size + 1 }}>{m.flag}</span>{m.name}
    </span>
  )
}

export function Queue({ pw, apps, refreshKey, onCount, onCompose }: { pw: string; apps: PublishApp[]; refreshKey: number; onCount: (n: number) => void; onCompose?: () => void }) {
  const [posts, setPosts] = useState<QueuedPost[] | null>(null)
  const [series, setSeries] = useState<QueuedSeries[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ads, setAds] = useState<AdsData | null>(null)
  const [promoting, setPromoting] = useState<QueuedPost | null>(null)
  const [viewing, setViewing] = useState<{ media: QueuedPost['media']; index: number } | null>(null)
  const [appFilter, setAppFilter] = useState<string>('all')
  // All-apps view: lanes per app, or per country (remembered in this browser).
  const [view, setViewState] = useState<'app' | 'country'>('app')
  useEffect(() => { try { if (localStorage.getItem('clarendon:queue-view') === 'country') setViewState('country') } catch { /* private mode */ } }, [])
  const setView = (v: 'app' | 'country') => { setViewState(v); try { localStorage.setItem('clarendon:queue-view', v) } catch { /* ignore */ } }
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const loadAds = useCallback(async () => {
    const r = await fetch('/api/ads/meta').then((x) => (x.ok ? x.json() : null)).catch(() => null)
    if (r) setAds(r)
  }, [])
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

  const act = async (id: string, method: 'DELETE' | 'PATCH', action?: string) => {
    setBusy(id)
    const res = await fetch(`/api/publish?id=${id}${action ? `&action=${action}` : ''}`, { method, headers: {} })
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
  const shownAds = ads ? { ...ads, promotions: ads.promotions.filter(inApp) } : null
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

  const section = (title: string, list: QueuedPost[], empty: string) => (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>{title}</span><span style={{ flex: 1, height: 1, background: C.rule }} />
      </div>
      {list.length === 0 ? <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>{empty}</p> : groupByApp(list).map(([appId, group]) => (
        <div key={appId} style={{ display: 'grid', gap: 10 }}>
          {appFilter === 'all' && (() => { const a = apps.find((x) => x.id === appId); return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {a && <img src={a.icon} alt="" width={18} height={18} style={{ borderRadius: 5 }} />}
              <b style={{ fontSize: 13.5 }}>{a?.name ?? appId}</b><span style={{ fontSize: 12.5, color: C.soft }}>{group.length}</span>
            </div>) })()}
          {group.map((p) => {
        const app = apps.find((a) => a.id === p.app_id)
        const s = STATUS[p.status] ?? STATUS.scheduled
        const first = p.media[0]
        return (
          <article key={p.id} style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '84px minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', background: C.card2, position: 'relative' }}>
              {first ? <Thumb item={first} onOpen={() => setViewing({ media: p.media, index: 0 })} />
                : <div style={{ padding: 8, fontSize: 11, color: C.soft }}>Text only</div>}
              {p.media.length > 1 && <span style={{ position: 'absolute', right: 5, top: 5, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '1px 6px' }}>{p.media.length}</span>}
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {app && <img src={app.icon} alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                <b style={{ fontSize: 14 }}>{app?.name ?? p.app_id}</b>
                <span style={{ fontSize: 12.5, color: C.soft }}>{p.scheduled_at ? when(p.scheduled_at) : when(p.created_at)}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px' }}>{s.text}</span>
                {(() => { const m = marketOf(p); return m ? <CountryTag m={m} size={11.5} /> : null })()}
                {p.series_id && <span title="A copy of a repeating post" style={{ fontSize: 11.5, fontWeight: 700, color: C.ink2, border: `1px solid ${C.rule2}`, borderRadius: 99, padding: '1px 8px' }}>↻ #{p.occurrence ?? '?'}</span>}
                {p.caption_by === 'ai' && <span title="Caption written by Claude" style={{ fontSize: 11.5, fontWeight: 700, color: C.mint }}>✦ AI caption</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || <i>No caption</i>}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.targets.map((t) => {
                  const name = PLATFORMS.find((x) => x.id === t.platform)?.name
                  const tone = t.status === 'published' ? C.mint : t.status === 'failed' ? C.red : C.ink2
                  const chip = (
                    <span title={t.error} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: tone,
                                                   border: `1px solid ${C.rule2}`, borderRadius: 99, padding: '3px 10px 3px 7px' }}>
                      <PlatformGlyph platform={t.platform} size={14} color={tone} />
                      {name}{t.platform === 'instagram' ? ` ${FORMAT_LABEL[t.format as Format]}` : ''}
                      {t.status === 'published' ? ' ↗' : t.status === 'failed' ? ' ✕' : t.status === 'processing' ? ' …' : ''}
                    </span>
                  )
                  return t.permalink ? <a key={t.platform} href={t.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{chip}</a> : <span key={t.platform}>{chip}</span>
                })}
              </div>
              {p.targets.filter((t) => t.status === 'failed' && t.error).map((t) => (
                <p key={t.platform} style={{ margin: 0, fontSize: 12, color: C.red }}>{PLATFORMS.find((x) => x.id === t.platform)?.name}: {t.error}</p>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {p.status === 'scheduled' && p.series_id && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => act(p.id, 'PATCH', 'recaption')}>{busy === p.id ? 'Writing…' : '✦ New caption'}</button>}
              {p.status === 'scheduled' && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => act(p.id, 'DELETE')}>{p.series_id ? 'Skip this one' : 'Cancel'}</button>}
              {ads && promotable(p).length > 0 && <button style={btn('mint')} onClick={() => setPromoting(p)}>{ads.promotions.some((x) => x.post_id === p.id && (x.status === 'active' || x.status === 'paused')) ? 'Promote again' : 'Promote'}</button>}
              {(p.status === 'failed' || p.status === 'partial') && <button style={btn('solid')} disabled={busy === p.id} onClick={() => act(p.id, 'PATCH')}>{busy === p.id ? 'Retrying…' : 'Retry failed'}</button>}
            </div>
          </article>
        )
      })}
        </div>
      ))}
    </section>
  )

  // "All apps": one lane per app — what's next, what needs attention, how it's
  // going — instead of every card from every app in one long column. Picking
  // an app (or "Open") switches to the full cards for that app.
  const dayFmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const small: React.CSSProperties = { ...btn('ghost'), padding: '5px 11px', fontSize: 12, borderRadius: 9 }
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
          {local && <div title="Your time" style={{ fontSize: 10.5, color: C.faint }}>{timeFmt(at)} yours</div>}
        </div>
        {!o.nested && (
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: C.card2 }}>
            {p.media[0] ? <Thumb item={p.media[0]} onOpen={() => setViewing({ media: p.media, index: 0 })} /> : null}
          </div>
        )}
        <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
          {o.app && <AppTag id={p.app_id} name={app?.name} size={15} style={{ fontSize: 12, fontWeight: 700, color: C.ink }} />}
          <span style={{ fontSize: 13, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.caption || <i>No caption</i>}
          </span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
            {mk && <CountryTag m={mk} size={11} />}
            {p.targets.map((t) => <PlatformGlyph key={t.platform} platform={t.platform} size={13} color={t.status === 'failed' ? C.red : t.status === 'published' ? C.mint : C.soft} />)}
            {p.series_id && <span style={{ fontSize: 11, color: C.soft }}>↻ #{p.occurrence ?? '?'}</span>}
            {p.caption_by === 'ai' && <span style={{ fontSize: 11, fontWeight: 700, color: C.mint }}>✦ AI</span>}
            {tone && <span style={{ fontSize: 11.5, color: C.red, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.targets.filter((t) => t.status === 'failed').map((t) => PLATFORMS.find((x) => x.id === t.platform)?.name).join(', ')} failed</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tone && <button style={{ ...small, ...btn('solid'), padding: '5px 11px', fontSize: 12, borderRadius: 9 }} disabled={busy === p.id} onClick={() => act(p.id, 'PATCH')}>{busy === p.id ? '…' : 'Retry'}</button>}
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
            <span style={{ fontSize: 13, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first.caption || <i>No caption</i>}</span>
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
  const countryLane = (m: Market, list: QueuedPost[], trouble: QueuedPost[]) => {
    const SHOW = 4
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
        <div style={{ padding: '4px 18px 8px' }}>
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
    const trouble = posts.filter((p) => (p.status === 'failed' || p.status === 'partial') && p.app_id === id).slice(0, 2)
    const sent = posts.filter((p) => (p.status === 'done' || p.status === 'partial') && p.app_id === id)
    const last = sent[0]
    const boosts = (ads?.promotions ?? []).filter((x) => x.app_id === id && x.status === 'active').length
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
      {shownAds && <Promotions ads={shownAds} apps={apps} onChange={loadAds} />}
      {viewing && <MediaViewer media={viewing.media} start={viewing.index} onClose={() => setViewing(null)} />}
      {promoting && ads && <PromoteSheet post={promoting} app={apps.find((a) => a.id === promoting.app_id)} ads={ads} onClose={() => setPromoting(null)} onDone={() => { setPromoting(null); loadAds() }} />}
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
            {view === 'app' ? appIds.map(lane) : (() => {
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
              return order.filter((id) => by.has(id)).map((id) => {
                const x = by.get(id)!
                x.list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
                return countryLane(MARKETS[id], x.list, x.trouble)
              })
            })()}
          </div>
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
        {section('Up next', scheduled, 'Nothing scheduled. Posts you schedule land here.')}
        {section('Recent', rest, 'Nothing posted from Studio yet.')}
      </>)}
    </div>
  )
}

type Media = QueuedPost['media'][number]

/** Queue thumbnail: shows the first frame (preload metadata + #t) and opens
 *  the full player on click. Videos get a ▶ badge so it reads as playable. */
function Thumb({ item, onOpen }: { item: Media; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label={item.kind === 'video' ? 'Play video' : 'View image'}
      style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', height: '100%', position: 'relative' }}>
      {item.kind === 'video'
        ? <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        : <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      {item.kind === 'video' && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <span style={{ width: 30, height: 30, borderRadius: 99, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="#fff" /></svg>
          </span>
        </span>
      )}
    </button>
  )
}

/** Full-size player for a post's media: video with controls (autoplays with
 *  sound — the click is the user gesture), images, arrows for carousels,
 *  Esc / ← / → on the keyboard. */
function MediaViewer({ media, start, onClose }: { media: Media[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const m = media[i]
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((x) => Math.min(media.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [media.length, onClose])
  if (!m) return null
  const arrow = (dir: -1 | 1) => (
    <button onClick={(e) => { e.stopPropagation(); setI((x) => x + dir) }} aria-label={dir < 0 ? 'Previous' : 'Next'}
      style={{ border: 0, width: 40, height: 40, borderRadius: 99, background: 'rgba(255,255,255,.9)', cursor: 'pointer', fontSize: 18 }}>{dir < 0 ? '‹' : '›'}</button>
  )
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Post media" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,12,.82)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%' }}>
        {media.length > 1 && (i > 0 ? arrow(-1) : <span style={{ width: 40 }} />)}
        {m.kind === 'video'
          ? <video key={m.url} src={m.url} controls autoPlay playsInline style={{ maxHeight: '86vh', maxWidth: 'min(90vw, 720px)', borderRadius: 12, background: '#000' }} />
          : <img key={m.url} src={m.url} alt="" style={{ maxHeight: '86vh', maxWidth: 'min(90vw, 900px)', borderRadius: 12 }} />}
        {media.length > 1 && (i < media.length - 1 ? arrow(1) : <span style={{ width: 40 }} />)}
      </div>
      <button onClick={onClose} style={{ position: 'fixed', top: 16, right: 16, ...btn('ghost') }}>Close</button>
      {media.length > 1 && <span style={{ position: 'fixed', bottom: 18, color: '#fff', fontSize: 13 }}>{i + 1} / {media.length}</span>}
    </div>
  , document.body)
}
