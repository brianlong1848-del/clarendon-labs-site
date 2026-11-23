'use client'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AppTag, C, STUDIO_APPS, appAccent, btn, labelStyle } from '@/components/AdminNav'
import { PlatformGlyph, type PublishApp, type QueuedPost } from '@/components/post/shared'
import { Preview } from '@/components/post/Preview'
import { PostDrawer } from '@/components/post/PostDrawer'
import { peek, stash } from '@/lib/clientCache'
import type { Platform, Format } from '@/lib/publish/rules'
import type { UpBoost, UpPost, UpRepeat, UpcomingItem, UpcomingPayload } from '@/lib/upcoming'

// ─── Coming up (FEAT-CLA-037) ────────────────────────────────────────────────
//
// What's about to go out, reviewable before it does: every scheduled post with
// the exact caption each platform gets, its video or photos, platforms and
// formats, country, hashtags and time; the runs a repeating series will make;
// and every boost with dates, budget, goal and the full audience (places,
// ages, interests, hashtags). Review checks flag what a careful eye would.
//
//   <Upcoming app="yulepick" />          — app page / overview ("all")
//   <Upcoming app="all" variant="next" /> — the console's "Up next" strip
//
// Preview opens the platform-accurate phone preview (post/Preview, safe
// zones included); Review opens the same PostDrawer as /post (edit caption,
// reschedule, new AI caption, cancel). Boosts pause / resume in place.
// Reads /api/upcoming; shows the last copy at once, refreshes behind it.

type Kind = 'all' | 'posts' | 'ads'
const PNAME: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', tiktok: 'TikTok' }
const DAY_MS = 86400000
const tz = 'America/Chicago'
const dayKey = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(d))
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
const dayTitle = (k: string) => {
  const today = dayKey(new Date()), tomorrow = dayKey(new Date(Date.now() + DAY_MS))
  const d = new Date(`${k}T12:00:00`)
  const base = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return k === today ? `Today · ${base}` : k === tomorrow ? `Tomorrow · ${base}` : base
}
function until(iso: string) {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (m <= 0) return 'now'
  if (m < 60) return `in ${m}m`
  if (m < 60 * 24) return `in ${Math.floor(m / 60)}h${m % 60 && m < 600 ? ` ${m % 60}m` : ''}`
  return `in ${Math.round(m / 1440)}d`
}
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 ? 2 : 0 })
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })
const appName = (id: string) => STUDIO_APPS.find((a) => a.id === id)?.name ?? id

const CSS = `
.up-rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(58px,1fr);gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.up-day{all:unset;cursor:pointer;display:grid;gap:5px;justify-items:center;padding:8px 4px 7px;border-radius:12px;border:1px solid ${C.rule};background:#fff;transition:border-color .2s ease,box-shadow .25s ease,transform .2s ease}
.up-day:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,17,21,.08)}
.up-day[data-on="1"]{border-color:${C.teal};box-shadow:0 0 0 3px rgba(11,122,131,.14)}
.up-day[data-gap="1"]{background:repeating-linear-gradient(135deg,#fff 0 6px,#F4F5F7 6px 12px)}
.up-day:focus-visible{outline:2px solid ${C.teal};outline-offset:2px}
.up-item{display:grid;grid-template-columns:78px minmax(0,1fr) 112px;gap:16px;align-items:start;padding:14px;border-radius:16px;background:#fff;border:1px solid ${C.rule};position:relative;overflow:hidden;transition:box-shadow .25s ease,border-color .2s ease}
.up-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--acc)}
.up-item:hover{border-color:color-mix(in srgb,var(--acc) 35%,${C.rule});box-shadow:0 10px 28px color-mix(in srgb,var(--acc) 12%,transparent)}
.up-item[data-kind="repeat"]{border-style:dashed;background:#FCFCFD}
.up-item[data-kind="boost"]{background:linear-gradient(90deg,#F6F5FF,#fff 40%)}
.up-thumb{position:relative;width:78px;height:138px;border-radius:10px;overflow:hidden;background:#0F1115;cursor:pointer;border:0;padding:0}
.up-thumb video,.up-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.up-thumb:hover .up-play{opacity:1}
.up-play{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.28);color:#fff;font-size:22px;opacity:0;transition:opacity .2s ease}
.up-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:650;color:${C.ink2};background:${C.card2};border-radius:99px;padding:3px 9px;white-space:nowrap}
.up-tab{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px;color:${C.soft}}
.up-tab[aria-pressed="true"]{background:${C.ink};color:#fff}
.up-next{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);gap:10px;overflow-x:auto}
@keyframes up-pulse{0%{box-shadow:0 0 0 0 rgba(79,70,229,.45)}70%{box-shadow:0 0 0 8px rgba(79,70,229,0)}100%{box-shadow:0 0 0 0 rgba(79,70,229,0)}}
.up-live{animation:up-pulse 2s ease-out infinite}
@media (max-width:760px){.up-item{grid-template-columns:64px minmax(0,1fr)}.up-item>.up-when{grid-column:1/-1;grid-row:1;display:flex!important;gap:10px;align-items:baseline}.up-thumb{width:64px;height:114px}}
`

function PostBody({ it, showApp, openPreview }: { it: UpPost | UpRepeat; showApp: boolean; openPreview: (it: UpPost | UpRepeat, p?: Platform, f?: Format) => void }) {
  const caps = it.kind === 'post' ? it.captions : Object.fromEntries(it.targets.map((t) => [t.platform, it.caption]))
  const distinct = [...new Set(Object.values(caps).map((c) => c ?? ''))]
  const [tab, setTab] = useState<Platform>(it.targets[0]?.platform)
  const [more, setMore] = useState(false)
  const text = (caps[tab] ?? '') as string
  return (
    <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {showApp && <AppTag id={it.app_id} name={appName(it.app_id)} size={18} style={{ fontSize: 13, fontWeight: 700, marginRight: 4 }} />}
        {it.targets.map((t) => (
          <button key={`${t.platform}${t.format}`} className="up-chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => openPreview(it, t.platform, t.format as Format)} title={`Preview on ${PNAME[t.platform]}`}>
            <PlatformGlyph platform={t.platform} size={12} />{PNAME[t.platform]} {t.label}
          </button>
        ))}
        {it.kind === 'post' && it.market && <span className="up-chip" title={it.market.name}><span aria-hidden>{it.market.flag}</span>{it.market.name}</span>}
        {it.kind === 'post' && it.caption_by === 'ai' && <span className="up-chip" style={{ color: C.indigo, background: C.indigoTint }}>✦ AI caption</span>}
        {it.kind === 'post' && it.occurrence ? <span className="up-chip">↻ #{it.occurrence}</span> : null}
        {it.kind === 'repeat' && <span className="up-chip" style={{ color: C.indigo, background: C.indigoTint }}>↻ {it.rule}{it.caption_mode === 'fresh' ? ' · fresh caption each time' : ''}</span>}
      </div>
      {distinct.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Caption per platform">
          {it.targets.filter((t, i, a) => a.findIndex((u) => u.platform === t.platform) === i).map((t) => (
            <button key={t.platform} className="up-tab" aria-pressed={tab === t.platform} onClick={() => setTab(t.platform)}><PlatformGlyph platform={t.platform} size={11} color={tab === t.platform ? '#fff' : undefined} />{PNAME[t.platform]}</button>
          ))}
        </div>
      )}
      {text
        ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: C.ink, ...(more ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
            {it.kind === 'repeat' && it.caption_mode === 'fresh' ? <span style={{ color: C.soft }}>Last caption: </span> : null}{text}
          </p>
        : <p style={{ margin: 0, fontSize: 13, color: C.soft, fontStyle: 'italic' }}>{it.targets.every((t) => t.format === 'story') ? 'Story — no caption shown.' : 'No caption.'}</p>}
      {text.length > 160 && <button onClick={() => setMore((v) => !v)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.teal, justifySelf: 'start' }}>{more ? 'Less' : 'Full caption'}</button>}
      {it.hashtags.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{it.hashtags.map((h) => <span key={h} style={{ fontSize: 11.5, fontWeight: 600, color: C.teal }}>{h}</span>)}</div>}
      {it.kind === 'post' && it.notes ? <p style={{ margin: 0, fontSize: 12, color: C.soft }}>Note: {it.notes}</p> : null}
    </div>
  )
}

function BoostBody({ b, showApp }: { b: UpBoost; showApp: boolean }) {
  const label = labelStyle
  const a = b.audience
  const chip = (icon: string, text: string, key?: string) => <span key={key ?? text} className="up-chip"><span aria-hidden>{icon}</span>{text}</span>
  return (
    <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {showApp && <AppTag id={b.app_id} name={appName(b.app_id)} size={18} style={{ fontSize: 13, fontWeight: 700, marginRight: 4 }} />}
        <span className="up-chip" style={{ color: '#fff', background: C.grad }}>Boost</span>
        <span className="up-chip"><PlatformGlyph platform={(b.platform === 'tiktok' ? 'tiktok' : b.platform) as Platform} size={12} />{PNAME[b.platform] ?? b.platform} · {b.network === 'meta' ? 'Meta Ads' : 'TikTok Ads'}</span>
        <span className={b.live ? 'up-chip up-live' : 'up-chip'} style={b.live ? { color: C.indigo, background: C.indigoTint } : b.status === 'paused' ? { color: C.amber, background: '#FBF0DD' } : {}}>
          {b.live ? '● Live now' : b.status === 'paused' ? 'Paused' : `Starts ${until(b.start_at)}`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{usd(b.daily_budget_cents)}<span style={{ fontSize: 12, color: C.soft, fontWeight: 500 }}>/day</span></div><div style={{ ...label, fontSize: 9.5 }}>{b.goal}</div></div>
        <div><div style={{ fontSize: 14, fontWeight: 650 }}>{shortDate(b.start_at)} → {shortDate(b.end_at)}</div><div style={{ ...label, fontSize: 9.5 }}>{Math.max(1, Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / DAY_MS))} days</div></div>
        {b.total_cents > 0 && <div><div style={{ fontSize: 14, fontWeight: 650, color: C.loss }}>up to {usd(b.total_cents)}</div><div style={{ ...label, fontSize: 9.5 }}>still to spend</div></div>}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {(a.places.length ? a.places : ['No location']).slice(0, 6).map((p) => chip('📍', p, `pl:${p}`))}
        {a.places.length > 6 && chip('📍', `+${a.places.length - 6}`)}
        {chip('👥', `${a.ages}${a.gender !== 'all' ? ` · ${a.gender}` : ''}`)}
        {a.interests.slice(0, 5).map((i) => chip('♥', i, `in:${i}`))}
        {a.interests.length > 5 && chip('♥', `+${a.interests.length - 5}`)}
        {a.hashtags.slice(0, 5).map((h) => chip('#', h.replace(/^#/, ''), `h:${h}`))}
        {a.expand && chip('↗', 'Meta may widen')}
      </div>
      {b.post?.caption && <p style={{ margin: 0, fontSize: 12.5, color: C.ink2, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.post.caption}</p>}
    </div>
  )
}


export function Upcoming({ app = 'all', variant = 'full', days: startDays = 14 }: { app?: string; variant?: 'full' | 'next'; days?: 7 | 14 | 30 }) {
  const [days, setDays] = useState<7 | 14 | 30>(startDays)
  const [data, setData] = useState<UpcomingPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('all')
  const [platforms, setPlatforms] = useState<Set<string>>(new Set())
  const [reviewOnly, setReviewOnly] = useState(false)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ item: UpPost | UpRepeat | UpBoost; platform: Platform; format: Format } | null>(null)
  const [drawer, setDrawer] = useState<{ post: QueuedPost; start?: 'edit' | 'reschedule' } | null>(null)
  const [apps, setApps] = useState<PublishApp[] | null>(null)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const key = `upcoming:${app}:${variant === 'next' ? 2 : days}`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/upcoming?app=${app}&days=${variant === 'next' ? 2 : days}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setData(body); stash(key, body)
    } catch (e) { setError((e as Error).message) }
    setLoading(false)
  }, [app, days, variant, key])
  useEffect(() => { const c = peek<UpcomingPayload>(key); if (c) setData(c); load() }, [load, key])

  // Accounts (handles + avatars for the previews, and what PostDrawer needs) load on first use.
  const needApps = useCallback(async () => {
    if (apps) return apps
    const cached = peek<PublishApp[]>('publish-apps')
    if (cached) setApps(cached)
    const r = await fetch('/api/publish/accounts').then((x) => x.json()).catch(() => null)
    const list = (r?.apps ?? cached ?? []) as PublishApp[]
    setApps(list); stash('publish-apps', list)
    return list
  }, [apps])

  const items = useMemo(() => (data?.items ?? []).filter((i) =>
    (kind === 'all' || (kind === 'ads' ? i.kind === 'boost' : i.kind !== 'boost'))
    && (!platforms.size || (i.kind === 'boost' ? platforms.has(i.platform === 'tiktok' ? 'tiktok' : i.platform) : i.targets.some((t) => platforms.has(t.platform))))
    && (!reviewOnly || i.checks.length > 0)), [data, kind, platforms, reviewOnly])

  const dayList = useMemo(() => Array.from({ length: variant === 'next' ? 2 : days }, (_, i) => dayKey(new Date(Date.now() + i * DAY_MS))), [days, variant])
  const byDay = useMemo(() => {
    const m = new Map<string, UpcomingItem[]>()
    for (const i of items) { const k = dayKey(i.at); m.set(k, [...(m.get(k) ?? []), i]) }
    return m
  }, [items])
  const gapDays = useMemo(() => new Set(app === 'all' ? [] : (data?.gaps.find((g) => g.app_id === app)?.days ?? [])), [data, app])

  const boostAction = async (b: UpBoost, kind2: 'pause' | 'resume') => {
    setBusy((x) => ({ ...x, [b.id]: kind2 === 'pause' ? 'Pausing…' : 'Resuming…' }))
    const r = await fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind2, platform: b.network, campaign_id: b.campaign_id ?? b.promotion_id, app_id: b.app_id, promotion_id: b.promotion_id }) }).catch(() => null)
    const out = await r?.json().catch(() => ({})) ?? {}
    setBusy((x) => ({ ...x, [b.id]: r?.ok ? (kind2 === 'pause' ? 'Paused ✓' : 'Resumed ✓') : (out.error ?? 'Didn’t go through') }))
    if (r?.ok) setTimeout(load, 800)
  }
  const openPreview = async (item: UpPost | UpRepeat | UpBoost, platform?: Platform, format?: Format) => {
    await needApps()
    if (item.kind === 'boost') setPreview({ item, platform: (item.platform === 'tiktok' ? 'tiktok' : item.platform) as Platform, format: item.network === 'tiktok' ? 'post' : 'reel' })
    else { const t = item.targets.find((x) => x.platform === platform) ?? item.targets[0]; setPreview({ item, platform: t.platform, format: (format ?? t.format) as Format }) }
  }
  const openDrawer = async (p: UpPost, start?: 'edit' | 'reschedule') => { await needApps(); setDrawer({ post: p.raw as unknown as QueuedPost, start }) }

  const label = labelStyle
  const small: CSSProperties = { padding: '6px 11px', fontSize: 12.5 }
  const counts = data?.counts

  // ── One item ───────────────────────────────────────────────────────────
  const thumb = (m: { url: string; kind: 'image' | 'video' } | undefined, onClick: () => void, lb: string) => (
    <button className="up-thumb" onClick={onClick} aria-label={lb}>
      {m ? (m.kind === 'video' ? <video src={`${m.url}#t=0.6`} muted playsInline preload="metadata" onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}) }} onMouseLeave={(e) => { e.currentTarget.pause() }} /> : <img src={m.url} alt="" loading="lazy" />)
        : <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8A919E', fontSize: 11, padding: 6, textAlign: 'center' }}>Text only</span>}
      <span className="up-play" aria-hidden="true">▶</span>
    </button>
  )

  const item = (it: UpcomingItem) => {
    const acc = it.kind === 'boost' ? C.indigo : appAccent(it.app_id)
    const media = it.kind === 'boost' ? it.post?.media[0] : it.media[0]
    return (
      <div key={it.id} className="up-item" data-kind={it.kind} style={{ ['--acc' as string]: acc } as CSSProperties}>
        {thumb(media, () => it.kind === 'boost' && !media && it.post?.permalink ? window.open(it.post.permalink, '_blank') : openPreview(it), 'Preview')}
        <div style={{ minWidth: 0, display: 'grid', gap: 10 }}>
          {it.kind === 'boost' ? <BoostBody b={it} showApp={app === 'all'} /> : <PostBody it={it} showApp={app === 'all'} openPreview={openPreview} />}
          {it.checks.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {it.checks.map((c) => <span key={c} className="up-chip" style={{ color: C.amber, background: '#FBF0DD' }}>⚠ {c}</span>)}
            </div>
          )}
          {busy[it.id] && <span style={{ fontSize: 12.5, fontWeight: 600, color: /✓/.test(busy[it.id]) ? C.teal : /…/.test(busy[it.id]) ? C.soft : C.red }}>{busy[it.id]}</span>}
        </div>
        <div className="up-when" style={{ display: 'grid', gap: 6, justifyItems: 'end', textAlign: 'right' }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{it.kind === 'boost' && it.live ? 'Running' : clock(it.at)}</div>
          <div style={{ fontSize: 12, color: C.soft }}>{it.kind === 'boost' && it.live ? `ends ${shortDate(it.end_at)}` : until(it.at)}</div>
          <div style={{ display: 'grid', gap: 6, justifyItems: 'end', marginTop: 4 }}>
            {it.kind === 'post' && <button style={{ ...btn('ghost'), ...small }} onClick={() => openDrawer(it)}>Review</button>}
            {it.kind !== 'boost' && <button style={{ ...btn('ghost'), ...small }} onClick={() => openPreview(it)}>Preview</button>}
            {it.kind === 'repeat' && <Link href="/post" style={{ ...btn('ghost'), ...small, textDecoration: 'none' }}>Series</Link>}
            {it.kind === 'boost' && it.status !== 'paused' && <button style={{ ...btn('ghost'), ...small, color: C.red }} onClick={() => boostAction(it, 'pause')}>Pause</button>}
            {it.kind === 'boost' && it.status === 'paused' && <button style={{ ...btn('ghost'), ...small }} onClick={() => boostAction(it, 'resume')}>Resume</button>}
            {it.kind === 'boost' && it.post?.permalink && <a href={it.post.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>Post ↗</a>}
          </div>
        </div>
      </div>
    )
  }

  // ── Preview overlay ────────────────────────────────────────────────────
  const overlay = preview && (() => {
    const it = preview.item
    const acct = apps?.find((a) => a.id === it.app_id)
    const account = acct?.accounts.find((a) => a.platform === preview.platform)
    const caption = it.kind === 'post' ? (it.captions[preview.platform] ?? '') : it.kind === 'repeat' ? it.caption : it.post?.caption ?? ''
    const media = (it.kind === 'boost' ? it.post?.media ?? [] : it.kind === 'post' && it.raw.media_overrides?.[preview.platform] ? it.raw.media_overrides[preview.platform]! : it.media)
      .map((m) => ({ src: m.url, kind: m.kind, width: m.width, height: m.height }))
    const plats = it.kind === 'boost' ? [] : it.targets
    return (
      <div role="dialog" aria-modal="true" aria-label="Preview" onClick={() => setPreview(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,17,21,.55)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 22, padding: 20, width: 'min(420px,100%)', maxHeight: '92dvh', overflow: 'auto', display: 'grid', gap: 14, boxShadow: '0 30px 80px rgba(0,0,0,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppTag id={it.app_id} name={appName(it.app_id)} size={22} style={{ fontWeight: 700 }} />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: C.soft }}>{it.kind === 'boost' ? `${shortDate(it.start_at)} → ${shortDate(it.end_at)}` : `${dayTitle(dayKey(it.at)).replace(/^(Today|Tomorrow) · /, '$1, ')} · ${clock(it.at)}`}</span>
            <button onClick={() => setPreview(null)} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>×</button>
          </div>
          {plats.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {plats.map((t) => <button key={`${t.platform}${t.format}`} className="up-tab" aria-pressed={preview.platform === t.platform && preview.format === t.format} onClick={() => setPreview({ ...preview, platform: t.platform, format: t.format as Format })}><PlatformGlyph platform={t.platform} size={11} color={preview.platform === t.platform && preview.format === t.format ? '#fff' : undefined} />{PNAME[t.platform]} {t.label}</button>)}
            </div>
          )}
          <Preview platform={preview.platform} format={preview.format} media={media} caption={caption} handle={account?.handle} avatar={account?.avatar ?? `/icons/${it.app_id}.png`} appName={appName(it.app_id)} />
          {it.kind === 'post' && <button style={{ ...btn('mint') }} onClick={() => { setPreview(null); openDrawer(it, 'edit') }}>Edit this post</button>}
        </div>
      </div>
    )
  })()

  const drawerEl = drawer && apps && (
    <PostDrawer post={drawer.post} start={drawer.start} apps={apps} onClose={() => setDrawer(null)}
      onChanged={(np) => { if (np) setDrawer((d) => d ? { post: np } : d); else setDrawer(null); load() }}
      onDuplicate={() => { setDrawer(null); window.location.href = '/post' }} />
  )

  // While a preview or the drawer is open: the page behind stays put, Escape closes the preview.
  useEffect(() => {
    if (!preview && !drawer) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [preview, drawer])

  // Overlays go to <body>: a card's animation makes it the containing block for
  // position: fixed, which trapped the preview inside the card (2026-11-22).
  const portal = (el: ReactNode) => el && typeof document !== 'undefined' ? createPortal(el, document.body) : null

  // ── Console strip: the next few things, side by side ───────────────────
  if (variant === 'next') {
    const next = (data?.items ?? []).filter((i) => !(i.kind === 'boost' && i.live)).slice(0, 6)
    const live = (data?.items ?? []).filter((i) => i.kind === 'boost' && i.live) as UpBoost[]
    return (
      <section data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 18, display: 'grid', gap: 12 }}>
        <style>{CSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Up next</h2>
          <span style={{ fontSize: 12.5, color: C.soft }}>next 48 hours{live.length ? ` · ${live.length} boost${live.length === 1 ? '' : 's'} running` : ''}{data?.counts.checks ? ` · ${data.counts.checks} to review` : ''}</span>
          <span style={{ flex: 1 }} />
          <Link href="/analytics#coming-up" style={{ fontSize: 13, fontWeight: 700, color: C.teal, textDecoration: 'none' }}>Everything coming up →</Link>
        </div>
        {!data && <div style={{ height: 120, borderRadius: 12, background: C.card2 }} />}
        {data && next.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.soft }}>Nothing scheduled in the next 48 hours. <Link href="/post" style={{ color: C.teal, fontWeight: 700 }}>Plan a post</Link></p>}
        <div className="up-next">
          {next.map((it) => {
            const media = it.kind === 'boost' ? it.post?.media[0] : it.media[0]
            const text = it.kind === 'post' ? Object.values(it.captions).find(Boolean) ?? '' : it.kind === 'repeat' ? it.caption : it.post?.caption ?? ''
            return (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 10, padding: 10, borderRadius: 14, background: C.card2, borderLeft: `4px solid ${it.kind === 'boost' ? C.indigo : appAccent(it.app_id)}` }}>
                <button className="up-thumb" style={{ width: 54, height: 96 }} onClick={() => it.kind === 'post' ? openDrawer(it) : openPreview(it)} aria-label="Preview">
                  {media ? (media.kind === 'video' ? <video src={`${media.url}#t=0.6`} muted playsInline preload="metadata" /> : <img src={media.url} alt="" loading="lazy" />) : null}
                  <span className="up-play" aria-hidden="true">▶</span>
                </button>
                <div style={{ minWidth: 0, display: 'grid', gap: 4, alignContent: 'start' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <b style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{clock(it.at)}</b>
                    <span style={{ fontSize: 11.5, color: C.soft }}>{dayKey(it.at) === dayKey(new Date()) ? until(it.at) : 'tomorrow'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <img src={`/icons/${it.app_id}.png`} alt={appName(it.app_id)} width={14} height={14} style={{ borderRadius: 4 }} />
                    {it.kind === 'boost' ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.indigo }}>Boost · {usd(it.daily_budget_cents)}/day</span>
                      : it.targets.map((t) => <PlatformGlyph key={`${t.platform}${t.format}`} platform={t.platform} size={13} />)}
                  </div>
                  <span style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text || <i style={{ color: C.soft }}>Story</i>}</span>
                  {it.checks.length > 0 && <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 700 }}>⚠ {it.checks[0]}</span>}
                </div>
              </div>
            )
          })}
        </div>
        {portal(overlay)}{portal(drawerEl)}
      </section>
    )
  }

  // ── Full view ──────────────────────────────────────────────────────────
  const plats = Object.entries(counts?.by_platform ?? {}) as [Platform, number][]
  const visibleDays = focusDay ? [focusDay] : dayList.filter((d) => byDay.has(d))
  return (
    <section id="coming-up" data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20, display: 'grid', gap: 14, scrollMarginTop: 24 }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Coming up</h2>
        {counts && <span style={{ fontSize: 12.5, color: C.soft }}>{[counts.posts && `${counts.posts} post${counts.posts === 1 ? '' : 's'}`, counts.repeats && `${counts.repeats} repeat${counts.repeats === 1 ? '' : 's'}`, counts.boosts && `${counts.boosts} boost${counts.boosts === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'nothing scheduled'}</span>}
        {loading && data && <span style={{ fontSize: 11.5, color: C.soft, background: C.card2, borderRadius: 99, padding: '2px 8px' }}>Updating…</span>}
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 2, background: C.card2, borderRadius: 10, padding: 3 }}>
          {([7, 14, 30] as const).map((d) => <button key={d} className="up-tab" aria-pressed={days === d} onClick={() => { setDays(d); setFocusDay(null) }} style={{ borderRadius: 8 }}>{d} days</button>)}
        </div>
        <Link href="/post" style={{ ...btn('mint'), ...small, textDecoration: 'none' }}>New post</Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'posts', 'ads'] as Kind[]).map((k) => <button key={k} className="up-tab" aria-pressed={kind === k} onClick={() => setKind(k)} style={{ border: `1px solid ${C.rule}` }}>{k === 'all' ? 'Everything' : k === 'posts' ? 'Posts' : 'Ads'}</button>)}
        <span style={{ width: 1, height: 18, background: C.rule, margin: '0 4px' }} />
        {plats.map(([p, n]) => (
          <button key={p} className="up-tab" aria-pressed={platforms.has(p)} style={{ border: `1px solid ${C.rule}` }}
            onClick={() => setPlatforms((s) => { const x = new Set(s); if (x.has(p)) x.delete(p); else x.add(p); return x })}>
            <PlatformGlyph platform={p} size={11} color={platforms.has(p) ? '#fff' : undefined} />{PNAME[p]} {n}
          </button>
        ))}
        {!!counts?.checks && <button className="up-tab" aria-pressed={reviewOnly} onClick={() => setReviewOnly((v) => !v)} style={{ border: `1px solid #EBC98F`, color: reviewOnly ? '#fff' : C.amber, background: reviewOnly ? C.amber : '#FBF0DD' }}>⚠ {counts.checks} to review</button>}
      </div>

      {/* Day rail */}
      <div className="up-rail" role="tablist" aria-label="Days">
        {dayList.map((d, i) => {
          const list = (byDay.get(d) ?? [])
          const perApp = new Map<string, number>()
          for (const it of list) perApp.set(it.kind === 'boost' ? '__boost' : it.app_id, (perApp.get(it.kind === 'boost' ? '__boost' : it.app_id) ?? 0) + 1)
          const date = new Date(`${d}T12:00:00`)
          const warn = list.some((x) => x.checks.length)
          return (
            <button key={d} className="up-day" role="tab" aria-selected={focusDay === d} data-on={focusDay === d ? '1' : undefined} data-gap={gapDays.has(d) ? '1' : undefined}
              title={gapDays.has(d) ? 'Nothing scheduled' : `${list.length} item${list.length === 1 ? '' : 's'}`}
              onClick={() => { setFocusDay((f) => f === d ? null : d); setTimeout(() => dayRefs.current[d]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30) }}>
              <span style={{ ...label, fontSize: 9.5, color: i === 0 ? C.teal : C.soft }}>{i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{date.getDate()}</span>
              <span style={{ display: 'flex', gap: 2, height: 22, alignItems: 'flex-end' }}>
                {[...perApp.entries()].map(([a, n]) => <span key={a} style={{ width: 5, height: Math.min(22, 5 + n * 5), borderRadius: 3, background: a === '__boost' ? C.indigo : appAccent(a) }} />)}
                {!list.length && <span style={{ width: 14, height: 2, borderRadius: 2, background: C.rule2 }} />}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: warn ? C.amber : C.soft, minHeight: 13 }}>{warn ? '⚠' : list.length || ''}</span>
            </button>
          )
        })}
      </div>
      {app !== 'all' && gapDays.size > 0 && gapDays.size < dayList.length && (
        <p style={{ margin: 0, fontSize: 12.5, color: C.ink2 }}>
          <b>{gapDays.size} empty day{gapDays.size === 1 ? '' : 's'}</b> (striped) — {[...gapDays].slice(0, 4).map((d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}{gapDays.size > 4 ? '…' : ''}. <Link href={`/post?app=${app}`} style={{ color: C.teal, fontWeight: 700 }}>Fill a gap</Link>
        </p>
      )}

      {error && <p style={{ margin: 0, color: C.red, fontSize: 13 }}>{error}</p>}
      {!data && <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 150, borderRadius: 16, background: C.card2 }} />)}</div>}
      {data && items.length === 0 && (
        <div style={{ padding: '26px 12px', textAlign: 'center', display: 'grid', gap: 6, justifyItems: 'center' }}>
          <b>{data.items.length ? 'Nothing matches these filters.' : 'Nothing scheduled yet.'}</b>
          <span style={{ fontSize: 13, color: C.soft }}>{data.items.length ? 'Clear a filter to see the rest.' : 'Plan a post or a boost and it shows up here for review before it goes out.'}</span>
          {!data.items.length && <Link href="/post" style={{ ...btn('ghost'), textDecoration: 'none', marginTop: 6 }}>Open Post</Link>}
        </div>
      )}

      {/* Agenda */}
      <div style={{ display: 'grid', gap: 18 }}>
        {visibleDays.map((d) => (
          <div key={d} ref={(el) => { dayRefs.current[d] = el }} style={{ display: 'grid', gap: 10, scrollMarginTop: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontSize: 14 }}>{dayTitle(d)}</b>
              <span style={{ fontSize: 12, color: C.soft }}>{(byDay.get(d) ?? []).length} item{(byDay.get(d) ?? []).length === 1 ? '' : 's'}</span>
              <span style={{ flex: 1, height: 1, background: C.rule }} />
              {focusDay && <button className="up-tab" onClick={() => setFocusDay(null)} style={{ border: `1px solid ${C.rule}` }}>Show all days</button>}
            </div>
            {(byDay.get(d) ?? []).map((it) => item(it))}
            {!(byDay.get(d) ?? []).length && <p style={{ margin: 0, fontSize: 13, color: C.soft }}>Nothing on this day.</p>}
          </div>
        ))}
      </div>
      {portal(overlay)}{portal(drawerEl)}
    </section>
  )
}
