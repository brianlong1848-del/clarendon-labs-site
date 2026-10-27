'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, btn } from '@/components/AdminNav'
import {
  PLATFORMS, FORMAT_LABEL, defaultFormat, fbReelOK, validate, captionFor, ratioName,
  type Format, type MediaItem, type MediaOverrides, type Platform, type Target, type TikTokSettings,
} from '@/lib/publish/rules'
import { anyPlatformTagged, assignPlatformMedia } from '@/lib/publish/platformMedia'
import { Preview } from './Preview'
import { TikTokPanel, type Creator } from './TikTokPanel'
import { PlatformGlyph, Segmented, Toggle, card, label, when, type PublishApp, type QueuedPost, type QueuedSeries } from './shared'
import { DAY_SHORT, checkRepeat, describeRule, upcoming, type RepeatSpec } from '@/lib/publish/recur'
import { MARKETS, assignMedia, inZone, localTimeIn, marketsFor, wrongLanguage, type Assignment, type MarketId } from '@/lib/publish/markets'

// ─── Composer ────────────────────────────────────────────────────────────────
//
// One post, every platform — now, later, or on repeat (every Tue + Thu at
// 10, or hand-picked dates), with captions Claude writes per platform from
// the video's frames and the app's caption brief in Drive.
//
// One post, every platform. Left: what you're saying (app → media → caption →
// where). Right, sticky: what each platform will actually show, what's wrong
// with it, and the button. Media uploads start the moment it's dropped, so
// by the time the caption is written it's already on storage.

type Item = {
  key: string; name: string; src: string; kind: 'image' | 'video'; mime: string
  width: number; height: number; duration?: number; size: number
  progress: number; status: 'preparing' | 'uploading' | 'ready' | 'error'; error?: string; url?: string
}
type Dest = Record<Platform, { on: boolean; format: Format }>
/** One market edition's words (markets.ts): its caption and per-platform versions. */
type Edition = { caption: string; overrides: Partial<Record<Platform, string>> }
const BLANK: Edition = { caption: '', overrides: {} }
type OverridesArg = Partial<Record<Platform, string>> | ((o: Partial<Record<Platform, string>>) => Partial<Record<Platform, string>>)

const DRAFT_KEY = 'clarendon:post-draft'
/** Up to 10 per platform (a carousel), and room for one cut per platform per edition. */
const MAX_ITEMS = 40
const initialDest = (): Dest => ({
  instagram: { on: true, format: 'feed' }, facebook: { on: false, format: 'post' },
  threads: { on: false, format: 'post' }, tiktok: { on: false, format: 'post' },
})

// Browser-side prep: read dimensions, convert photos to JPEG (Instagram's API
// takes JPEG only), cap the long edge so phone photos don't upload at 48MP.
async function prepare(file: File): Promise<Omit<Item, 'key' | 'progress' | 'status'> & { blob: Blob }> {
  if (file.type.startsWith('video/')) {
    const src = URL.createObjectURL(file)
    const meta = await new Promise<{ w: number; h: number; d: number }>((resolve, reject) => {
      const v = document.createElement('video')
      v.preload = 'metadata'; v.src = src
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration })
      v.onerror = () => reject(new Error('This video format can’t be read — export it as MP4 (H.264).'))
    })
    return { name: file.name, src, kind: 'video', mime: file.type || 'video/mp4', width: meta.w, height: meta.h, duration: meta.d, size: file.size, blob: file }
  }
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image can’t be read here — export HEIC photos as JPEG first.') })
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.92))
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', src: URL.createObjectURL(blob), kind: 'image', mime: 'image/jpeg', width: w, height: h, size: blob.size, blob }
}

function put(url: string, blob: Blob, type: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url); x.setRequestHeader('Content-Type', type)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status}).`)))
    x.onerror = () => reject(new Error('Upload failed — check the connection.'))
    x.send(blob)
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
function quickTimes() {
  const now = new Date()
  const at = (days: number, h: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d }
  const late = now.getHours() >= 18
  return [
    { label: late ? 'Tomorrow 7 PM' : 'Tonight 7 PM', d: at(late ? 1 : 0, 19) },
    { label: 'Tomorrow 9 AM', d: at(1, 9) },
    { label: 'Friday 6 PM', d: at(((5 - now.getDay() + 7) % 7) || 7, 18) },
  ]
}

// Still frames for the AI to look at: 4 from a video, or the photos themselves.
async function grabFrames(src: string): Promise<Blob[]> {
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src
  await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error('Couldn’t read the video to write captions.')) })
  const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1
  const out: Blob[] = []
  for (const f of [0.08, 0.35, 0.62, 0.9]) {
    await new Promise<void>((resolve) => { v.onseeked = () => resolve(); v.currentTime = Math.min(d * f, Math.max(0, d - 0.15)) })
    const scale = Math.min(1, 768 / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    out.push(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8)))
  }
  return out
}

type BestTime = { heat: number[]; reason: string; best: string[]; auto: string[]; weekly: { days: number[]; times: string[] }; basis: { level: 'typical' | 'learning' | 'yours'; measured: number; igOnline: boolean } }

const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago' } catch { return 'America/Chicago' } })()
const shortWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function Composer({ pw, apps, onPosted }: { pw: string; apps: PublishApp[]; onPosted: () => void }) {
  const [appId, setAppId] = useState(apps[0]?.id ?? '')
  const [items, setItems] = useState<Item[]>([])
  const [tailor, setTailor] = useState(false)
  // A different cut per platform (platformMedia.ts): files named for a
  // platform go to it; untagged files are shared; Brian can pick per platform.
  const [splitPref, setSplitPref] = useState(false)
  const splitTouched = useRef(false)
  const [platPicked, setPlatPicked] = useState<Partial<Record<MarketId, Partial<Record<Platform, string[]>>>>>({})
  const [choosingPlat, setChoosingPlat] = useState<Platform | null>(null)
  // Market editions: which countries/languages this post goes to, and each
  // edition's caption. With one market (most apps) it's the classic composer.
  const [mkts, setMkts] = useState<MarketId[]>(['us'])
  const [active, setActive] = useState<MarketId>('us')
  const [eds, setEds] = useState<Partial<Record<MarketId, Edition>>>({})
  const [picked, setPicked] = useState<Partial<Record<MarketId, string[]>>>({})
  const [choosing, setChoosing] = useState<MarketId | null>(null)
  const [localTime, setLocalTime] = useState(true)
  const [results, setResults] = useState<{ market: MarketId; post: QueuedPost }[] | null>(null)
  const ed = eds[active] ?? BLANK
  const caption = ed.caption, overrides = ed.overrides
  const setCaption = (v: string) => setEds((e) => ({ ...e, [active]: { ...(e[active] ?? BLANK), caption: v } }))
  const setOverrides = (v: OverridesArg) => setEds((e) => {
    const cur = e[active] ?? BLANK
    return { ...e, [active]: { ...cur, overrides: typeof v === 'function' ? v(cur.overrides) : v } }
  })
  const [dest, setDest] = useState<Dest>(initialDest)
  const [mode, setMode] = useState<'now' | 'later' | 'repeat'>('now')
  const schedule = mode === 'later'
  // Repeat settings
  const [repKind, setRepKind] = useState<'weekly' | 'auto' | 'dates'>('auto')
  const [perWeek, setPerWeek] = useState(2)
  const [bt, setBt] = useState<BestTime | null>(null)
  const [days, setDays] = useState<number[]>([2, 4])
  const [times, setTimes] = useState<string[]>(['10:00'])
  const [dates, setDates] = useState<string[]>(() => [localInput(quickTimes()[1].d)])
  const [endKind, setEndKind] = useState<'never' | 'count' | 'date'>('count')
  const [endCount, setEndCount] = useState(8)
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 28); return localInput(d).slice(0, 10) })
  const [fresh, setFresh] = useState(true)
  // AI captions
  const [notes, setNotes] = useState('')
  const [captionBy, setCaptionBy] = useState<'brian' | 'ai'>('brian')
  const [ai, setAi] = useState<{ ready: boolean; brief: 'drive' | 'built-in' | null } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<{ text: string; ok: boolean } | null>(null)
  const frameCache = useRef<{ key: string; urls: string[] } | null>(null)
  const framesByKey = useRef(new Map<string, string[]>())
  const [resultSeries, setResultSeries] = useState<QueuedSeries | null>(null)
  const [at, setAt] = useState(() => localInput(quickTimes()[0].d))
  const [previewOn, setPreviewOn] = useState<Platform>('instagram')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<QueuedPost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const mediaKey = useRef('')
  const [connecting, setConnecting] = useState(false)
  // TikTok: settings start empty on purpose (no default audience, interactions off).
  const [tt, setTt] = useState<TikTokSettings>({ mode: 'direct' })
  const [creator, setCreator] = useState<{ info: Creator | null; audited: boolean; loading: boolean; error: string | null }>({ info: null, audited: false, loading: false, error: null })

  const connect = async (platform: 'threads' | 'tiktok') => {
    setConnecting(true); setError(null)
    const res = await fetch(`/api/publish/${platform}/connect?app=${appId}`, { method: 'POST', headers: {} }).catch(() => null)
    const out = await res?.json().catch(() => ({})) ?? {}
    if (res?.ok && out.url) window.location.href = out.url
    else { setConnecting(false); setError(out.error ?? `Couldn’t start the ${platform === 'tiktok' ? 'TikTok' : 'Threads'} sign-in.`) }
  }

  const app = apps.find((a) => a.id === appId)
  const available = useMemo(() => marketsFor(appId), [appId])
  const home = available[0].id
  // New app → back to its home market (its other editions are opt-in).
  useEffect(() => { setMkts([home]); setActive(home); setPicked({}); setChoosing(null) }, [home])
  // Prefill from the URL (Ad insights "Reuse angle": /post?app=&caption=&notes=&media=), once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.get('app') && !q.get('caption') && !q.get('media')) return
    const app = q.get('app'); if (app && apps.some((a) => a.id === app)) setAppId(app)
    const cap = q.get('caption'); if (cap) setEds((e) => ({ ...e, us: { ...(e.us ?? BLANK), caption: cap } }))
    const n = q.get('notes'); if (n) setNotes(n)
    const media = q.get('media')
    if (media) {
      const video = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(media)
      setItems([{ key: `prefill-${Date.now()}`, name: media.split('/').pop()?.split('?')[0] ?? 'media', src: media, kind: video ? 'video' : 'image', mime: video ? 'video/mp4' : 'image/jpeg',
        width: 0, height: 0, size: 0, progress: 1, status: 'ready', url: media }])
    }
    window.history.replaceState(null, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const multi = mkts.length > 1
  const sx = available.length > 1 ? 1 : 0
  useEffect(() => { if (!mkts.includes(active)) setActive(mkts[0]) }, [mkts, active])
  useEffect(() => { if (multi && mode === 'repeat') setMode('now') }, [multi, mode])
  useEffect(() => {
    let live = true
    fetch(`/api/publish/captions?app=${appId}`).then((r) => r.json()).then((b) => { if (live) setAi({ ready: !!b.ready, brief: b.brief ?? null }) }).catch(() => { if (live) setAi({ ready: false, brief: null }) })
    return () => { live = false }
  }, [appId])
  const account = useCallback((p: Platform) => app?.accounts.find((a) => a.platform === p), [app])

  // Draft survives a reload (caption + app only; media is re-picked).
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
      if (d) { setCaption(d.caption ?? ''); if (apps.some((a) => a.id === d.appId)) setAppId(d.appId) }
    } catch { /* private mode */ }
  }, [apps])
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ caption, appId })) } catch { /* ignore */ } }, [caption, appId])

  // Every place this app can post to starts switched on ("post everywhere");
  // ones it can't are off, with the reason shown as the fix.
  useEffect(() => {
    setDest((d) => {
      const next = { ...d }
      for (const p of PLATFORMS) next[p.id] = { ...next[p.id], on: !!account(p.id)?.ready }
      return next
    })
  }, [account])

  // TikTok wants creator info read fresh before each post: who it's going to,
  // which audiences are allowed, what's switched off on the account.
  const ttOn = dest.tiktok.on && !!account('tiktok')?.ready
  useEffect(() => {
    if (!ttOn) return
    let live = true
    setCreator((c) => ({ ...c, loading: true, error: null }))
    setTt({ mode: 'direct' })
    fetch(`/api/publish/tiktok/creator?app=${appId}`).then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => { if (live) setCreator({ info: ok ? b.creator : null, audited: !!b.audited, loading: false, error: ok ? null : b.error }) })
      .catch(() => { if (live) setCreator({ info: null, audited: false, loading: false, error: 'Couldn’t reach TikTok.' }) })
    return () => { live = false }
  }, [ttOn, appId])

  // Each edition's media: its own file (matched from the file name), the
  // shared files, or the nearest same-language edition's; or Brian's pick.
  const assignment: Record<string, Assignment> = useMemo(() => assignMedia(items, mkts, appId, picked), [items, mkts, appId, picked])
  const itemsFor = useCallback((m: MarketId) => multi ? (assignment[m]?.keys ?? []).map((k) => items.find((i) => i.key === k)!).filter(Boolean) : items, [multi, assignment, items])
  const toMedia = (list: Item[]): MediaItem[] => list.map((i) => ({ url: i.url ?? 'https://pending', kind: i.kind, width: i.width, height: i.height, duration: i.duration, mime: i.mime }))
  const activeItems = itemsFor(active)
  const media: MediaItem[] = useMemo(() => toMedia(activeItems), [activeItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-platform cuts. `split` only means something with more than one file.
  const split = splitPref && items.length > 1
  useEffect(() => { if (!splitTouched.current && anyPlatformTagged(items)) setSplitPref(true) }, [items])
  const platAssign = useCallback((m: MarketId) => assignPlatformMedia(itemsFor(m), platPicked[m]), [itemsFor, platPicked])
  const platItemsFor = useCallback((m: MarketId, p: Platform): Item[] => {
    if (!split) return itemsFor(m)
    return platAssign(m)[p].keys.map((k) => items.find((i) => i.key === k)!).filter(Boolean)
  }, [split, itemsFor, platAssign, items])
  const igMedia = useMemo(() => toMedia(platItemsFor(active, 'instagram')), [platItemsFor, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const fbMedia = useMemo(() => toMedia(platItemsFor(active, 'facebook')), [platItemsFor, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const ttMedia = useMemo(() => toMedia(platItemsFor(active, 'tiktok')), [platItemsFor, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const mediaOf = (p: Platform): MediaItem[] => p === 'instagram' ? igMedia : p === 'facebook' ? fbMedia : p === 'tiktok' ? ttMedia : toMedia(platItemsFor(active, p))
  /** What validate() and the server get: every platform's own cut, or {} when not split. */
  const moFor = (m: MarketId, on: Platform[] = PLATFORMS.map((p) => p.id)): MediaOverrides =>
    split ? Object.fromEntries(on.map((p) => [p, toMedia(platItemsFor(m, p))])) : {}

  // Keep Instagram's format sensible as media changes.
  // Each judged on its own cut when the media is split per platform.
  useEffect(() => {
    setDest((d) => {
      const f = d.instagram.format
      const igOne = igMedia.length === 1 && igMedia[0].kind === 'video'
      const ok = f === 'reel' ? igOne : f === 'story' ? igMedia.length <= 1 : !igOne
      const next = ok ? d : { ...d, instagram: { ...d.instagram, format: defaultFormat('instagram', igMedia) } }
      // New media → Facebook picks its default (a vertical clip becomes a Reel);
      // same media → keep your choice unless it no longer fits.
      const key = fbMedia.map((m) => `${m.kind}${m.width}x${m.height}:${Math.round(m.duration ?? 0)}`).join()
      const changed = key !== mediaKey.current
      mediaKey.current = key
      const fbOne = fbMedia.length === 1 && fbMedia[0].kind === 'video'
      const fbValid = d.facebook.format === 'post' || (fbOne && fbReelOK(fbMedia[0]))
      const fb = changed || !fbValid ? defaultFormat('facebook', fbMedia) : d.facebook.format
      return fb === next.facebook.format ? next : { ...next, facebook: { ...next.facebook, format: fb } }
    })
  }, [igMedia, fbMedia])

  const targets: Target[] = PLATFORMS.filter((p) => dest[p.id].on).map((p) => ({ platform: p.id, format: dest[p.id].format, ...(p.id === 'tiktok' ? { tiktok: tt } : {}) }))
  const tag = (m: MarketId) => `${MARKETS[m].flag} ${MARKETS[m].short}: `
  const issues = !multi ? validate(targets, media, caption, tailor ? overrides : {}, moFor(active)) : mkts.flatMap((m) => {
    const a = assignment[m], e = eds[m] ?? BLANK
    const out = validate(targets, toMedia(itemsFor(m)), e.caption, tailor ? e.overrides : {}, moFor(m)).map((i) => ({ ...i, text: tag(m) + i.text }))
    if (items.length && a?.how === 'none') out.push({ platform: targets[0]?.platform ?? 'instagram', level: 'error', text: `${tag(m)}no photo or video for this edition — add one named for ${MARKETS[m].short}, or pick one.`, todo: true })
    if (a?.note) out.push({ platform: targets[0]?.platform ?? 'instagram', level: wrongLanguage(a) ? 'error' : 'warn', text: tag(m) + a.note })
    if (!e.caption.trim() && targets.some((t) => t.format !== 'story')) out.push({ platform: targets[0]?.platform ?? 'instagram', level: 'error', text: `${tag(m)}no ${MARKETS[m].langName} caption yet — ✦ Write with AI does every edition at once.`, todo: true })
    return out
  })
  if (multi && mode === 'now' && targets.length) issues.push({ platform: targets[0].platform, level: 'warn', text: `All ${mkts.length} editions go to the same accounts at once. Schedule → “same local time” spreads them across time zones.` })
  if (split) for (const m of mkts) for (const t of targets) {
    if ((t.platform === 'threads' || t.platform === 'facebook') && !platItemsFor(m, t.platform).length) {
      issues.push({ platform: t.platform, level: 'warn', text: `${multi ? tag(m) : ''}${PLATFORMS.find((p) => p.id === t.platform)!.name} has no video of its own, so it goes out as text only. Name a file for it, or pick one under Photos & video.` })
    }
  }
  const ttVideo = ttMedia.length === 1 && ttMedia[0].kind === 'video' ? ttMedia[0] : undefined
  // What the AI looks at and the post's shared media: the first platform's cut when split.
  const capItemsFor = (m: MarketId) => split && targets[0] ? platItemsFor(m, targets[0].platform) : itemsFor(m)
  const sendMediaFor = (m: MarketId) => ({ media: toMedia(capItemsFor(m)), ...(split ? { mediaOverrides: moFor(m, targets.map((t) => t.platform)) } : {}) })
  if (ttOn && creator.loading) issues.push({ platform: 'tiktok', level: 'error', text: 'Checking the TikTok account…' })
  if (ttOn && !creator.loading && !creator.info) issues.push({ platform: 'tiktok', level: 'error', text: creator.error ?? 'Couldn’t read the TikTok account.' })
  if (ttOn && creator.info && ttVideo?.duration && ttVideo.duration > creator.info.max_video_post_duration_sec) issues.push({ platform: 'tiktok', level: 'error', text: `This TikTok account can post videos up to ${creator.info.max_video_post_duration_sec}s.` })
  const errors = issues.filter((i) => i.level === 'error')
  const uploading = items.some((i) => i.status === 'preparing' || i.status === 'uploading')
  const failedUploads = items.some((i) => i.status === 'error')
  const scheduleDate = new Date(at)
  const scheduleOk = !schedule || (mkts.length > 1 && localTime ? !isNaN(scheduleDate.getTime()) : scheduleDate.getTime() > Date.now() + 60_000)
  const repeatSpec: RepeatSpec = {
    rule: repKind === 'auto' ? { kind: 'auto', perWeek, tz: TZ }
      : repKind === 'weekly' ? { kind: 'weekly', days: [...days].sort(), times: Array.from(new Set(times)).sort(), tz: TZ }
      : { kind: 'dates', at: dates.map((d) => new Date(d)).filter((d) => !isNaN(d.getTime())).map((d) => d.toISOString()) },
    endsAt: repKind !== 'dates' && endKind === 'date' && endDate && !isNaN(new Date(`${endDate}T23:59:59`).getTime()) ? new Date(`${endDate}T23:59:59`).toISOString() : null,
    maxRuns: repKind !== 'dates' && endKind === 'count' ? endCount : null,
    captionMode: fresh ? 'fresh' : 'same', notes,
  }
  const repeatProblems = mode === 'repeat' ? (() => { try { return checkRepeat(repeatSpec) } catch { return ['Check the dates.'] } })() : []
  const nextTimes = mode === 'repeat' && repeatProblems.length === 0
    ? (repKind === 'auto' ? (bt?.auto ?? []).map((d) => new Date(d)) : upcoming(repeatSpec, 4)) : []
  const canSend = !(multi && mode === 'repeat') && !sending && targets.length > 0 && errors.length === 0 && !uploading && !failedUploads && scheduleOk && repeatProblems.length === 0

  // Best time for this app on the chosen platforms (re-asked when they change).
  const btKey = `${appId}|${targets.map((t) => t.platform).join(',')}|${perWeek}|${days.length}`
  useEffect(() => {
    const [a, pf, pw, nd] = btKey.split('|')
    let live = true
    const t = setTimeout(() => {
      fetch(`/api/publish/besttime?app=${a}&platforms=${pf}&perWeek=${pw}&days=${nd || pw}&tz=${encodeURIComponent(TZ)}`)
        .then((r) => r.ok ? r.json() : null).then((b) => { if (live && b) setBt(b) }).catch(() => {})
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [btKey])

  const firstTarget = targets[0]?.platform
  useEffect(() => { if (firstTarget && !dest[previewOn]?.on) setPreviewOn(firstTarget) }, [dest, previewOn, firstTarget])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, Math.max(0, MAX_ITEMS - items.length))
    await Promise.all(list.map(async (file) => {
      const key = crypto.randomUUID()
      setItems((xs) => [...xs, { key, name: file.name, src: '', kind: file.type.startsWith('video/') ? 'video' : 'image', mime: file.type, width: 1, height: 1, size: file.size, progress: 0, status: 'preparing' }])
      try {
        const prepped = await prepare(file)
        setItems((xs) => xs.map((x) => x.key === key ? { ...x, ...prepped, status: 'uploading' } : x))
        const res = await fetch('/api/publish/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, filename: prepped.name }) })
        const up = await res.json()
        if (!res.ok) throw new Error(up.error ?? 'Could not start upload.')
        await put(up.uploadUrl, prepped.blob, prepped.mime, (p) => setItems((xs) => xs.map((x) => x.key === key ? { ...x, progress: p } : x)))
        setItems((xs) => xs.map((x) => x.key === key ? { ...x, status: 'ready', progress: 1, url: up.publicUrl } : x))
      } catch (e) {
        setItems((xs) => xs.map((x) => x.key === key ? { ...x, status: 'error', error: (e as Error).message } : x))
      }
    }))
  }, [pw, appId, items.length])

  const uploadBlob = async (blob: Blob, name: string) => {
    const res = await fetch('/api/publish/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, filename: name }) })
    const up = await res.json()
    if (!res.ok) throw new Error(up.error ?? 'Could not upload a frame.')
    await put(up.uploadUrl, blob, 'image/jpeg', () => {})
    return up.publicUrl as string
  }
  /** Public URLs of what the AI should look at; video frames are uploaded once per media set. */
  const ensureFrames = async (from: Item[] = activeItems): Promise<string[]> => {
    const ready = from.filter((i) => i.status === 'ready' && i.url)
    const key = ready.map((i) => i.url).join('|')
    if (frameCache.current?.key === key) return frameCache.current.urls
    const cached = framesByKey.current.get(key)
    if (cached) return cached
    const video = ready.find((i) => i.kind === 'video')
    const urls = video
      ? await Promise.all((await grabFrames(video.src)).map((b, n) => uploadBlob(b, `frame-${n + 1}.jpg`)))
      : ready.filter((i) => i.kind === 'image').slice(0, 6).map((i) => i.url!)
    frameCache.current = { key, urls }; framesByKey.current.set(key, urls)
    return urls
  }
  const writeWithAi = async () => {
    if (aiBusy || !targets.length) return
    setAiBusy(true); setAiNote(null)
    if (multi) {
      // Every edition at once, each in its own language, from its own video.
      const intent = (eds[home] ?? BLANK).caption || caption
      const done = await Promise.all(mkts.map(async (m) => {
        try {
          const list = capItemsFor(m)
          const frames = await ensureFrames(list)
          const res = await fetch('/api/publish/captions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId, targets, frames, notes, market: m, draft: (eds[m] ?? BLANK).caption || intent,
              media: list.map((i) => ({ url: i.url, kind: i.kind, width: i.width, height: i.height, duration: i.duration })) }),
          })
          const out = await res.json()
          if (!res.ok) throw new Error(out.error ?? 'Couldn’t write captions.')
          setEds((e) => ({ ...e, [m]: { caption: out.caption, overrides: out.overrides ?? {} } }))
          return null
        } catch (e) { return `${tag(m)}${(e as Error).message}` }
      }))
      const failed = done.filter(Boolean) as string[]
      setTailor(true); setCaptionBy('ai')
      setAiNote(failed.length ? { ok: false, text: failed.join(' · ') }
        : { ok: true, text: `Wrote ${mkts.length} editions, each in its own language and from its own video — switch tabs to read and edit them.` })
      setAiBusy(false)
      return
    }
    try {
      const capItems = capItemsFor(active)
      const frames = await ensureFrames(capItems)
      const res = await fetch('/api/publish/captions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, targets, frames, notes, draft: caption, market: active === 'us' ? undefined : active, media: capItems.map((i) => ({ url: i.url, kind: i.kind, width: i.width, height: i.height, duration: i.duration })) }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error ?? 'Couldn’t write captions.')
      setCaption(out.caption); setOverrides(out.overrides ?? {}); setTailor(true); setCaptionBy('ai')
      setAiNote({ ok: true, text: `Written per platform from ${frames.length ? `${frames.length} frame${frames.length === 1 ? '' : 's'} and ` : ''}the ${app?.name ?? ''} ${out.brief === 'drive' ? 'caption brief in Drive' : 'built-in facts (no Drive brief found)'} — edit anything.` })
    } catch (e) { setAiNote({ ok: false, text: (e as Error).message }) }
    setAiBusy(false)
  }

  const editionTime = (m: MarketId): Date | null =>
    mode !== 'later' ? null : localTime && multi ? localTimeIn(at, MARKETS[m].tz) : scheduleDate
  const send = async () => {
    if (!canSend) return
    setSending(true); setError(null)
    if (multi) {
      const group = crypto.randomUUID()
      const out = await Promise.all(mkts.map(async (m) => {
        const e = eds[m] ?? BLANK, t = editionTime(m)
        const res = await fetch('/api/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId, caption: e.caption, overrides: tailor ? e.overrides : {}, targets, market: m, editionGroup: group,
            ...sendMediaFor(m),
            scheduledAt: t ? t.toISOString() : null, captionBy, notes,
          }),
        }).catch(() => null)
        const body = await res?.json().catch(() => null)
        return res?.ok && body?.post ? { market: m, post: body.post as QueuedPost } : { market: m, error: body?.error ?? 'Posting failed.' }
      }))
      const ok = out.filter((x): x is { market: MarketId; post: QueuedPost } => 'post' in x)
      const bad = out.filter((x) => 'error' in x) as { market: MarketId; error: string }[]
      if (ok.length) { setResults(ok); onPosted(); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }
      if (bad.length) setError(bad.map((b) => tag(b.market) + b.error).join(' · '))
      setSending(false)
      return
    }
    try {
      const repeat = mode === 'repeat' ? { ...repeatSpec, frames: fresh ? await ensureFrames(capItemsFor(active)).catch(() => []) : [] } : undefined
      const res = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId, caption, overrides: tailor ? overrides : {}, targets,
          ...sendMediaFor(active),
          scheduledAt: schedule ? scheduleDate.toISOString() : null,
          captionBy, notes, ...(repeat ? { repeat } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Posting failed.')
      setResult(body.post); setResultSeries(body.series ?? null); onPosted()
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    } catch (e) { setError((e as Error).message) }
    setSending(false)
  }
  const sendRef = useRef(send); sendRef.current = send

  // Keep the result card live while Meta finishes processing video.
  useEffect(() => {
    if (result?.status !== 'publishing') return
    const t = setInterval(async () => {
      fetch('/api/publish/run', { method: 'POST' }).catch(() => {})
      const res = await fetch('/api/publish', { headers: {} }).catch(() => null)
      const body = await res?.json().catch(() => null)
      const fresh = body?.posts?.find((p: QueuedPost) => p.id === result.id)
      if (fresh) setResult(fresh)
    }, 8000)
    return () => clearInterval(t)
  }, [result, pw])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendRef.current() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reset = () => { setItems([]); setEds({}); setPicked({}); setResults(null); setTailor(false); setResult(null); setResultSeries(null); setMode('now'); setNotes(''); setCaptionBy('brian'); setAiNote(null); frameCache.current = null; setSplitPref(false); splitTouched.current = false; setPlatPicked({}); setChoosingPlat(null) }
  const move = (from: string, to: string) => setItems((xs) => {
    const a = [...xs], i = a.findIndex((x) => x.key === from), j = a.findIndex((x) => x.key === to)
    if (i < 0 || j < 0) return xs
    const [m] = a.splice(i, 1); a.splice(j, 0, m); return a
  })

  const strictest = targets.map((t) => ({ t, max: PLATFORMS.find((p) => p.id === t.platform)!.captionMax })).sort((a, b) => a.max - b.max)[0]
  const tags = (caption.match(/(^|\s)#\w/g) ?? []).length
  const previewTarget = targets.find((t) => t.platform === previewOn) ?? targets[0]
  const pname = (p: Platform) => PLATFORMS.find((x) => x.id === p)!.name

  if (result) return <Result post={result} series={resultSeries} app={app} onNew={reset} />
  if (results) return <EditionsResult results={results} app={app} onNew={reset} />

  const step = (n: number, title: string, aside?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>0{n}</span>
      <h2 style={{ fontFamily: C.serif, fontSize: 19, fontWeight: 800, margin: 0 }}>{title}</h2>
      <span style={{ flex: 1 }} />{aside}
    </div>
  )

  return (
    <div className="composer" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 26, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        {/* 1 · App */}
        <section style={card}>
          {step(1, 'Which app?')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {apps.map((a) => {
              const on = a.id === appId
              const ready = a.accounts.filter((x) => x.ready).length
              return (
                <button key={a.id} onClick={() => setAppId(a.id)} aria-pressed={on}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: 10, borderRadius: 14, cursor: 'pointer', fontFamily: C.sans,
                           background: on ? C.card : C.card2, border: `2px solid ${on ? a.accent : 'transparent'}`,
                           boxShadow: on ? `0 6px 18px ${a.accent}33` : 'none', transition: 'all .15s' }}>
                  <img src={a.icon} alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 14.5, color: C.ink }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.soft }}>{ready} of 4 ready</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 2 · Media */}
        <section style={card}>
          {step(2, 'Photos & video', items.length > 0 && <span style={{ fontSize: 12.5, color: C.soft }}>{items.length} item{items.length === 1 ? '' : 's'} · drag to reorder</span>)}
          <div
            onDragOver={(e) => { e.preventDefault(); if (!dragKey) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!dragKey && e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
            style={{ border: `2px dashed ${dragOver ? C.mint : C.rule2}`, background: dragOver ? C.mintTint : C.paper, borderRadius: 14, padding: items.length ? 12 : 30, transition: 'all .15s' }}>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
                <b style={{ fontSize: 15 }}>Drop photos or a video here</b>
                <span style={{ fontSize: 13, color: C.soft }}>JPEG, PNG, MP4 or MOV · up to 10 for a carousel · one cut per platform (name them _ig, _fb, _tiktok, _threads) · or text only to Threads and Facebook</span>
                <button style={{ ...btn('ghost'), marginTop: 6 }} onClick={() => fileInput.current?.click()}>Choose files</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                {items.map((it, idx) => (
                  <div key={it.key} draggable onDragStart={() => setDragKey(it.key)} onDragEnd={() => setDragKey(null)}
                    onDragOver={(e) => { e.preventDefault(); if (dragKey && dragKey !== it.key) move(dragKey, it.key) }}
                    style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: C.card2, cursor: 'grab',
                             outline: dragKey === it.key ? `2px solid ${C.mint}` : 'none', opacity: dragKey === it.key ? 0.6 : 1 }}>
                    {it.src && (it.kind === 'video'
                      ? <video src={it.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={it.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
                    <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 99, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{idx + 1}</span>
                    <button aria-label={`Remove ${it.name}`} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
                      style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                    {it.width > 1 && (
                      <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '1px 6px' }}>
                        {it.kind === 'video' ? `▶ ${it.duration ? Math.round(it.duration) + 's · ' : ''}` : ''}{ratioName(it.width / it.height)}
                      </span>
                    )}
                    {(it.status === 'preparing' || it.status === 'uploading') && (
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(255,255,255,.5)' }}>
                        <div style={{ width: `${Math.round(it.progress * 100)}%`, height: '100%', background: C.mint, transition: 'width .2s' }} />
                      </div>
                    )}
                    {it.status === 'error' && <div title={it.error} style={{ position: 'absolute', inset: 0, background: 'rgba(194,74,74,.88)', color: '#fff', fontSize: 11.5, padding: 8, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{it.error}</div>}
                  </div>
                ))}
                {items.length < MAX_ITEMS && (
                  <button onClick={() => fileInput.current?.click()} aria-label="Add more"
                    style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${C.rule2}`, background: 'transparent', color: C.mint, fontSize: 28, cursor: 'pointer' }}>+</button>
                )}
              </div>
            )}
          </div>
          {items.length > 1 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.ink2, cursor: 'pointer' }}>
                <Toggle on={split} onChange={(v) => { splitTouched.current = true; setSplitPref(v); setChoosingPlat(null) }} label="A different video for each platform" />
                <span><b style={{ color: C.ink }}>A different video for each platform</b>
                  {split ? (multi ? ` · ${MARKETS[active].flag} ${MARKETS[active].short} edition` : '') : ' · off: every platform gets the same media'}</span>
              </label>
              {split && multi && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {mkts.map((id) => (
                    <button key={id} onClick={() => { setActive(id); setChoosingPlat(null) }} aria-pressed={id === active}
                      style={{ border: `1.5px solid ${id === active ? C.ink : C.rule2}`, background: id === active ? C.ink : C.card, color: id === active ? C.paper : C.ink2, borderRadius: 99,
                               padding: '4px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: C.sans }}>{MARKETS[id].flag} {MARKETS[id].short}</button>
                  ))}
                </div>
              )}
              {split && PLATFORMS.map((p) => {
                const a = platAssign(active)[p.id], list = platItemsFor(active, p.id), on = dest[p.id].on, pool = itemsFor(active)
                const textOk = p.id === 'threads' || p.id === 'facebook'
                const how = a.how === 'tagged' ? `Named for ${p.name}` : a.how === 'shared' ? 'Shared file (no platform in its name)'
                  : a.how === 'borrowed' ? `No ${p.name} cut — using the ${PLATFORMS.find((x) => x.id === a.from)?.name} one`
                  : a.how === 'master' ? 'Only the master fits — check it has sound'
                  : list.length ? 'Picked by you' : textOk ? 'No media — text only' : 'Nothing yet — name a file for it, or pick one'
                const v = list.length === 1 ? list[0] : undefined
                return (
                  <div key={p.id} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, background: C.paper, border: `1px solid ${C.rule}`, opacity: on ? 1 : 0.55 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '112px auto minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13.5, minWidth: 0 }}><PlatformGlyph platform={p.id} size={17} />{p.name}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {list.slice(0, 4).map((i) => (
                          <span key={i.key} title={i.name} style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', background: C.card2, display: 'block' }}>
                            {i.src && (i.kind === 'video' ? <video src={i.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={i.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
                          </span>
                        ))}
                        {!list.length && <span style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px dashed ${C.rule2}`, display: 'block' }} />}
                      </div>
                      <div style={{ fontSize: 12, color: !list.length && on && !textOk ? C.amber : C.soft, lineHeight: 1.4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {how}{v && v.width > 1 ? ` · ${v.kind === 'video' && v.duration ? `${Math.round(v.duration)}s · ` : ''}${ratioName(v.width / v.height)}` : ''}{!on ? ' · not posting here' : ''}
                        {v && <><br /><span style={{ color: C.faint }}>{v.name}</span></>}
                      </div>
                      <button onClick={() => setChoosingPlat(choosingPlat === p.id ? null : p.id)}
                        style={{ border: 0, background: 'transparent', color: C.mint, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: C.sans }}>{choosingPlat === p.id ? 'Done' : 'Change'}</button>
                    </div>
                    {choosingPlat === p.id && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {pool.map((i) => {
                          const sel = list.some((x) => x.key === i.key)
                          return (
                            <button key={i.key} title={i.name} aria-pressed={sel}
                              onClick={() => setPlatPicked((pk) => {
                                const cur = list.map((x) => x.key)
                                const next = sel ? cur.filter((k) => k !== i.key) : pool.map((x) => x.key).filter((k) => k === i.key || cur.includes(k))
                                return { ...pk, [active]: { ...(pk[active] ?? {}), [p.id]: next } }
                              })}
                              style={{ width: 52, height: 52, borderRadius: 9, overflow: 'hidden', padding: 0, cursor: 'pointer', background: C.card2,
                                       border: `2.5px solid ${sel ? C.mint : 'transparent'}`, opacity: sel ? 1 : 0.55 }}>
                              {i.src && (i.kind === 'video' ? <video src={i.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={i.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
                            </button>
                          )
                        })}
                        {platPicked[active]?.[p.id] && <button onClick={() => setPlatPicked((pk) => { const mine = { ...(pk[active] ?? {}) }; delete mine[p.id]; return { ...pk, [active]: mine } })}
                          style={{ border: 0, background: 'transparent', color: C.soft, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: C.sans }}>Back to automatic</button>}
                      </div>
                    )}
                  </div>
                )
              })}
              {split && <span style={{ fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>
                Name each cut with its platform and it finds its own: “…_ig-reels.mp4”, “…_fb-reels.mp4”, “…_tiktok.mp4”, “…_threads.mp4”. A platform with no cut of its own borrows a sibling’s (Threads uses Instagram’s); a “master” file is only used if nothing else fits.
              </span>}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
        </section>

        {/* 3 · Countries & languages (apps that ship in more than one) */}
        {available.length > 1 && (
          <section style={card}>
            {step(3, 'Countries & languages', <span style={{ fontSize: 12.5, color: C.soft }}>{mkts.length} edition{mkts.length === 1 ? '' : 's'}</span>)}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {available.map((m) => {
                const on = mkts.includes(m.id)
                return (
                  <button key={m.id} aria-pressed={on} title={`${m.name} · ${m.langName}`}
                    onClick={() => setMkts((xs) => on ? (xs.length > 1 ? xs.filter((x) => x !== m.id) : xs) : available.map((a) => a.id).filter((id) => id === m.id || xs.includes(id)))}
                    style={{ border: `1.5px solid ${on ? C.mint : C.rule2}`, background: on ? C.mintTint : C.card, color: on ? C.ink : C.ink2, borderRadius: 99,
                             padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>
                    {m.flag} {m.short} <span style={{ fontWeight: 500, color: C.soft }}>{m.lang}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: multi ? 14 : 0 }}>
              {[
                { label: `All ${available.length}`, ids: available.map((m) => m.id) },
                { label: 'English-speaking', ids: available.filter((m) => m.lang.startsWith('en')).map((m) => m.id) },
                { label: 'Matching my files', ids: available.filter((m) => m.id === home || items.some((i) => assignMedia([i], [m.id], appId)[m.id].how === 'tagged')).map((m) => m.id) },
                { label: `${available[0].short} only`, ids: [home] },
              ].filter((q) => q.ids.length).map((q) => (
                <button key={q.label} onClick={() => setMkts(q.ids)}
                  style={{ border: 0, background: 'transparent', color: C.mint, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: C.sans }}>{q.label}</button>
              ))}
            </div>
            {multi && (
              <div style={{ display: 'grid', gap: 8 }}>
                {mkts.map((id) => {
                  const m = MARKETS[id], a = assignment[id], list = itemsFor(id)
                  const how = a?.how === 'tagged' ? 'Matched from the file name' : a?.how === 'universal' ? 'Shared file (no market in its name)'
                    : a?.how === 'picked' ? 'Picked by you' : a?.how === 'same-language' ? 'Borrowed' : items.length ? 'Nothing for this market yet' : 'Add media above'
                  return (
                    <div key={id} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, background: C.paper, border: `1px solid ${a?.note && wrongLanguage(a) ? C.red : C.rule}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px auto minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{m.flag} {m.name}</div>
                          <div style={{ fontSize: 11.5, color: C.soft }}>{m.langName}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {list.slice(0, 4).map((i) => (
                            <span key={i.key} title={i.name} style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', background: C.card2, display: 'block' }}>
                              {i.src && (i.kind === 'video' ? <video src={i.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={i.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
                            </span>
                          ))}
                          {!list.length && <span style={{ width: 38, height: 38, borderRadius: 8, border: `1.5px dashed ${C.rule2}`, display: 'block' }} />}
                        </div>
                        <div style={{ fontSize: 12, color: a?.note ? (wrongLanguage(a) ? C.red : C.amber) : C.soft, lineHeight: 1.4, minWidth: 0 }}>
                          {a?.note ?? how}
                          {mode === 'later' && localTime && <><br /><span style={{ color: C.ink2 }}>Goes out {inZone(localTimeIn(at, m.tz), m.tz)} local</span></>}
                        </div>
                        {items.length > 0 && (
                          <button onClick={() => setChoosing(choosing === id ? null : id)}
                            style={{ border: 0, background: 'transparent', color: C.mint, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: C.sans }}>{choosing === id ? 'Done' : 'Change'}</button>
                        )}
                      </div>
                      {choosing === id && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {items.map((i) => {
                            const on = list.some((x) => x.key === i.key)
                            return (
                              <button key={i.key} title={i.name} aria-pressed={on}
                                onClick={() => setPicked((pk) => { const cur = list.map((x) => x.key); const next = on ? cur.filter((k) => k !== i.key) : items.map((x) => x.key).filter((k) => k === i.key || cur.includes(k)); return { ...pk, [id]: next } })}
                                style={{ width: 52, height: 52, borderRadius: 9, overflow: 'hidden', padding: 0, cursor: 'pointer', background: C.card2,
                                         border: `2.5px solid ${on ? C.mint : 'transparent'}`, opacity: on ? 1 : 0.55 }}>
                                {i.src && (i.kind === 'video' ? <video src={i.src} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={i.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
                              </button>
                            )
                          })}
                          {picked[id] && <button onClick={() => setPicked((pk) => { const n = { ...pk }; delete n[id]; return n })}
                            style={{ border: 0, background: 'transparent', color: C.soft, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: C.sans }}>Back to automatic</button>}
                        </div>
                      )}
                    </div>
                  )
                })}
                <span style={{ fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>
                  Name files with their market and each edition finds its own: “Rolligan — UK.mp4”, “promo es-MX.mov”, “German cut.mp4”, “Borea fr-CA.mp4”. Files with no market in the name go to every edition that has nothing of its own.
                </span>
              </div>
            )}
          </section>
        )}

        {/* 3 · Caption */}
        <section style={card}>
          {step(3 + sx, multi ? 'Captions' : 'Caption', <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={writeWithAi} disabled={!ai?.ready || aiBusy || !targets.length || uploading}
              title={!ai?.ready ? 'AI captions need ANTHROPIC_API_KEY on Vercel' : !targets.length ? 'Pick where it’s going first' : uploading ? 'Wait for the upload' : 'Claude writes a caption for each platform'}
              style={{ ...btn('ghost'), fontSize: 13, padding: '7px 13px', opacity: !ai?.ready || !targets.length || uploading ? 0.5 : 1 }}>
              {aiBusy ? (multi ? `Writing ${mkts.length} editions…` : 'Writing…') : multi ? `✦ Write all ${mkts.length} with AI` : caption ? '✦ Rewrite with AI' : '✦ Write with AI'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink2, cursor: 'pointer' }}>
              Tailor per platform <Toggle on={tailor} onChange={setTailor} label="Tailor caption per platform" />
            </label>
          </div>)}
          {multi && (
            <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {mkts.map((id) => {
                const m = MARKETS[id], on = id === active, has = !!(eds[id]?.caption.trim())
                return (
                  <button key={id} role="tab" aria-selected={on} onClick={() => setActive(id)}
                    style={{ border: `1.5px solid ${on ? C.ink : C.rule2}`, background: on ? C.ink : C.card, color: on ? C.paper : C.ink2, borderRadius: 99,
                             padding: '5px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: C.sans }}>
                    {m.flag} {m.short}{has ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>
          )}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000}
            placeholder="What’s this post about? (optional — steers the AI, e.g. “new 3D dice, Friday game night vibe”)"
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '9px 12px', fontFamily: C.sans, fontSize: 13.5, color: C.ink, background: C.card, marginBottom: 10 }} />
          {aiNote && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: aiNote.ok ? C.mint : C.red }}>{aiNote.text}</p>}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6}
            placeholder={multi ? `${MARKETS[active].flag} ${MARKETS[active].langName} caption — or ✦ Write with AI for every edition` : `What's new with ${app?.name ?? 'the app'}? Hashtags and @mentions welcome.`}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${C.rule2}`, borderRadius: 12, padding: '12px 14px', fontFamily: C.sans, fontSize: 15, lineHeight: 1.5, color: C.ink, background: C.paper, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: C.soft, flexWrap: 'wrap' }}>
            <span style={{ color: strictest && caption.length > strictest.max ? C.red : C.soft }}>
              {caption.length.toLocaleString()}{strictest ? ` / ${strictest.max.toLocaleString()} (${pname(strictest.t.platform)})` : ''}
            </span>
            <span style={{ color: tags > 30 ? C.red : C.soft }}>{tags} hashtag{tags === 1 ? '' : 's'}</span>
            <span style={{ flex: 1 }} /><span>⌘↵ to {mode === 'repeat' ? 'start repeating' : schedule ? 'schedule' : 'post'}</span>
          </div>
          {tailor && targets.length > 0 && (
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {targets.map((t) => {
                const spec = PLATFORMS.find((p) => p.id === t.platform)!
                const effective = captionFor(t.platform, caption, overrides)
                return (
                  <div key={t.platform} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10 }}>
                    <div style={{ paddingTop: 10 }}><PlatformGlyph platform={t.platform} size={20} /></div>
                    <div>
                      <textarea value={overrides[t.platform] ?? ''} rows={2} onChange={(e) => setOverrides((o) => ({ ...o, [t.platform]: e.target.value }))}
                        placeholder={`${spec.name}: same as above — type to change it just here`}
                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '9px 12px', fontFamily: C.sans, fontSize: 14, color: C.ink, background: C.card }} />
                      <div style={{ fontSize: 11.5, color: effective.length > spec.captionMax ? C.red : C.soft, marginTop: 3 }}>{effective.length.toLocaleString()} / {spec.captionMax.toLocaleString()}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 4 · Destinations */}
        <section style={card}>
          {step(4 + sx, 'Where to post', <span style={{ fontSize: 12.5, color: C.soft }}>{targets.length} selected</span>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 10 }}>
            {PLATFORMS.map((p) => {
              const acc = account(p.id)
              const on = dest[p.id].on
              const pm = mediaOf(p.id)
              const oneVideo = pm.length === 1 && pm[0].kind === 'video'
              return (
                <div key={p.id} style={{ borderRadius: 14, padding: 14, border: `1.5px solid ${on ? C.mint : C.rule}`, background: on ? C.mintTint : acc?.ready ? C.card : C.paper, display: 'grid', gap: 10, transition: 'all .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: C.card, display: 'grid', placeItems: 'center', border: `1px solid ${C.rule}`, flexShrink: 0 }}>
                      <PlatformGlyph platform={p.id} size={19} color={acc?.ready ? undefined : C.faint} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: acc?.ready ? C.ink : C.soft }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: C.soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {acc?.handle ? (p.id === 'facebook' ? acc.handle : `@${acc.handle}`) : acc?.ready ? '' : 'Not set up yet'}
                      </div>
                    </div>
                    <Toggle on={on} disabled={!acc?.ready} label={`Post to ${p.name}`} onChange={(v) => setDest((d) => ({ ...d, [p.id]: { ...d[p.id], on: v } }))} />
                  </div>
                  {p.id === 'instagram' && acc?.ready && (
                    <Segmented<Format> value={dest.instagram.format} disabled={!on}
                      onChange={(f) => setDest((d) => ({ ...d, instagram: { ...d.instagram, format: f } }))}
                      options={[
                        { value: 'feed', label: 'Post', disabled: oneVideo, title: oneVideo ? 'A single video posts as a Reel' : 'Photo or carousel in the grid' },
                        { value: 'reel', label: 'Reel', disabled: !oneVideo, title: 'One video' },
                        { value: 'story', label: 'Story', disabled: pm.length > 1, title: 'One photo or video, gone in 24 hours' },
                      ]} />
                  )}
                  {p.id === 'facebook' && acc?.ready && oneVideo && (
                    <Segmented<Format> value={dest.facebook.format} disabled={!on}
                      onChange={(f) => setDest((d) => ({ ...d, facebook: { ...d.facebook, format: f } }))}
                      options={[
                        { value: 'post', label: 'Video', title: 'A regular video post on the Page' },
                        { value: 'reel', label: 'Reel', disabled: !fbReelOK(pm[0]), title: fbReelOK(pm[0]) ? 'Vertical, up to 90 seconds — Reels reach more people' : 'Reels need a vertical video of 3–90 seconds' },
                      ]} />
                  )}
                  {!acc?.ready && acc?.reason && <p style={{ margin: 0, fontSize: 12, color: C.ink2, lineHeight: 1.45 }}>{acc.reason}</p>}
                  {!acc?.ready && acc?.connect && (
                    <button onClick={() => connect(acc.connect!)} disabled={connecting} style={{ ...btn('solid'), justifySelf: 'start', fontSize: 13, padding: '8px 14px' }}>
                      {connecting ? `Opening ${p.name}…` : `Connect ${p.name}`}
                    </button>
                  )}
                  {p.id === 'tiktok' && acc?.ready && on && (
                    <TikTokPanel creator={creator.info} audited={creator.audited} loading={creator.loading} error={creator.error}
                      value={tt} onChange={setTt} duration={ttVideo?.duration} />
                  )}
                  {p.id === 'tiktok' && !acc?.ready && oneVideo && pm[0]?.url && pm[0].url !== 'https://pending' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.ink, width: '100%' }}>Post it yourself</span>
                      <button style={{ ...btn('ghost'), fontSize: 12.5, padding: '7px 12px' }}
                        onClick={() => { navigator.clipboard?.writeText(captionFor('tiktok', caption, tailor ? overrides : {})); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>
                        {copied ? 'Copied ✓' : 'Copy caption'}
                      </button>
                      <a href={pm[0].url} target="_blank" rel="noreferrer" download style={{ ...btn('ghost'), fontSize: 12.5, padding: '7px 12px', textDecoration: 'none' }}>Open video</a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Right rail: preview, checks, send */}
      <aside style={{ position: 'sticky', top: 24, display: 'grid', gap: 14 }}>
        <section style={{ ...card, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ ...label, marginRight: 6 }}>Preview{multi ? ` · ${MARKETS[active].flag} ${MARKETS[active].short}` : ''}</span>
            {targets.map((t) => (
              <button key={t.platform} onClick={() => setPreviewOn(t.platform)} aria-pressed={previewOn === t.platform} title={pname(t.platform)}
                style={{ width: 32, height: 32, borderRadius: 9, cursor: 'pointer', display: 'grid', placeItems: 'center',
                         border: `1.5px solid ${previewOn === t.platform ? C.ink : C.rule}`, background: previewOn === t.platform ? C.card : C.card2 }}>
                <PlatformGlyph platform={t.platform} size={16} />
              </button>
            ))}
            {(previewTarget?.platform === 'instagram' || previewTarget?.platform === 'facebook') && <span style={{ fontSize: 12, color: C.soft, marginLeft: 'auto' }}>{FORMAT_LABEL[previewTarget.format]}</span>}
          </div>
          {previewTarget ? (
            <Preview platform={previewTarget.platform} format={previewTarget.format} appName={app?.name ?? ''}
              handle={account(previewTarget.platform)?.handle} avatar={account(previewTarget.platform)?.avatar ?? app?.icon ?? ''}
              caption={previewTarget.format === 'story' ? '' : captionFor(previewTarget.platform, caption, tailor ? overrides : {})}
              media={platItemsFor(active, previewTarget.platform).filter((i) => i.src).map((i) => ({ src: i.src, kind: i.kind, width: i.width, height: i.height }))} />
          ) : <p style={{ color: C.soft, fontSize: 13.5, textAlign: 'center', margin: '30px 0' }}>Turn on a platform to preview it.</p>}
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 10 }}>
          <span style={label}>Checks</span>
          {targets.length === 0 ? <Check tone="muted" text="Pick at least one place to post." /> :
            issues.length === 0 ? <Check tone="ok" text={`Ready for ${targets.map((t) => pname(t.platform)).join(', ')}.`} /> :
              // Red only for real conflicts; anything not added yet is a neutral To do.
              [...issues].sort((a, b) => Number(!!a.todo) - Number(!!b.todo)).map((i, k) => <Check key={k} tone={i.todo ? 'todo' : i.level === 'error' ? 'bad' : 'warn'} platform={i.platform} text={i.text} />)}
          {uploading && <Check tone="muted" text="Uploading media…" />}
          {failedUploads && <Check tone="bad" text="Remove the media that failed to upload." />}
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
          <Segmented<'now' | 'later' | 'repeat'> value={mode} onChange={setMode}
            options={[{ value: 'now', label: 'Post now' }, { value: 'later', label: 'Schedule' },
              { value: 'repeat', label: 'Repeat', disabled: multi, title: multi ? 'Repeating posts go to one market — turn the other editions off to repeat' : undefined }]} />
          {mode === 'repeat' && (
            <RepeatPanel kind={repKind} setKind={setRepKind} days={days} setDays={setDays} times={times} setTimes={setTimes}
              dates={dates} setDates={setDates} endKind={endKind} setEndKind={setEndKind} endCount={endCount} setEndCount={setEndCount}
              endDate={endDate} setEndDate={setEndDate} fresh={fresh} setFresh={setFresh} aiReady={!!ai?.ready}
              problems={repeatProblems} next={nextTimes} tz={TZ} perWeek={perWeek} setPerWeek={setPerWeek} bt={bt} />
          )}
          {schedule && (
            <div style={{ display: 'grid', gap: 8 }}>
              <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)}
                style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '9px 12px', fontFamily: C.sans, fontSize: 14, color: C.ink, background: C.paper }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {bt?.best?.[0] && (() => {
                  const d = new Date(bt.best[0]); const active = at === localInput(d)
                  return <button title={bt.reason} onClick={() => setAt(localInput(d))}
                    style={{ border: `1px solid ${C.mint}`, background: active ? C.mint : C.mintTint, color: active ? '#fff' : C.mint, borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: C.sans }}>
                    ✦ Best: {d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}</button>
                })()}
                {quickTimes().map((q) => {
                  const active = at === localInput(q.d)
                  return (
                    <button key={q.label} onClick={() => setAt(localInput(q.d))}
                      style={{ border: `1px solid ${C.rule2}`, background: active ? C.ink : C.card, color: active ? C.paper : C.ink2, borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>{q.label}</button>
                  )
                })}
              </div>
              {multi && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: C.ink2, lineHeight: 1.45, cursor: 'pointer' }}>
                  <Toggle on={localTime} onChange={setLocalTime} label="Same local time in each country" />
                  <span><b style={{ color: C.ink }}>Same local time in each country</b><br />
                    {localTime ? mkts.map((id) => `${MARKETS[id].flag} ${inZone(localTimeIn(at, MARKETS[id].tz), MARKETS[id].tz)}`).join(' · ')
                      : 'Every edition goes out at the moment above.'}</span>
                </label>
              )}
              {!scheduleOk && !(multi && localTime) && <span style={{ fontSize: 12, color: C.red }}>Pick a time at least a minute from now.</span>}
              <span style={{ fontSize: 11.5, color: C.soft }}>Goes out within 5 minutes of this time.{bt ? ` ✦ ${bt.reason}` : ''}</span>
            </div>
          )}
          <button onClick={send} disabled={!canSend}
            style={{ ...btn('mint'), width: '100%', padding: '14px 18px', fontSize: 15.5, borderRadius: 12, opacity: canSend ? 1 : 0.45, cursor: canSend ? 'pointer' : 'not-allowed' }}>
            {sending ? (mode === 'repeat' ? 'Setting up…' : schedule ? 'Scheduling…' : 'Posting…')
              : multi ? `${schedule ? 'Schedule' : 'Post'} ${mkts.length} editions${schedule ? (localTime ? ' · local times' : ` · ${isNaN(scheduleDate.getTime()) ? '' : when(scheduleDate.toISOString())}`) : ' now'}`
              : mode === 'repeat' ? `Start repeating · ${describeRule(repeatSpec.rule)}`
              : schedule ? `Schedule · ${isNaN(scheduleDate.getTime()) ? '' : when(scheduleDate.toISOString())}`
              : targets.length ? `Post now to ${targets.length} ${targets.length === 1 ? 'place' : 'places'}` : 'Post now'}
          </button>
          {sending && mode === 'now' && <span style={{ fontSize: 12, color: C.soft, textAlign: 'center' }}>Videos can take a minute while {dest.tiktok.on ? 'Meta and TikTok process' : 'Meta processes'} them.</span>}
          {error && <span style={{ fontSize: 13, color: C.red }}>{error}</span>}
        </section>
      </aside>
      <style>{`@media (max-width: 1100px){ .composer{ grid-template-columns: 1fr !important } .composer aside{ position: static !important } }`}</style>
    </div>
  )
}

function Check({ tone, text, platform }: { tone: 'ok' | 'warn' | 'bad' | 'muted' | 'todo'; text: string; platform?: Platform }) {
  if (tone === 'todo') return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: C.ink2 }}>
      <span aria-label="To do" style={{ width: 18, height: 18, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: C.rule2 }} />
      </span>
      {platform && <span style={{ flexShrink: 0, paddingTop: 1 }}><PlatformGlyph platform={platform} size={15} color={C.soft} /></span>}<span>{text}</span>
    </div>
  )
  const color = tone === 'ok' ? C.mint : tone === 'warn' ? C.amber : tone === 'bad' ? C.red : C.soft
  const mark = tone === 'ok' ? '✓' : tone === 'warn' ? '!' : tone === 'bad' ? '×' : '·'
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: C.ink2 }}>
      <span style={{ width: 18, height: 18, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, color: '#fff', background: color }}>{mark}</span>
      {platform && <span style={{ flexShrink: 0, paddingTop: 1 }}><PlatformGlyph platform={platform} size={15} /></span>}<span>{text}</span>
    </div>
  )
}

function EditionsResult({ results, app, onNew }: { results: { market: MarketId; post: QueuedPost }[]; app?: PublishApp; onNew: () => void }) {
  return (
    <section style={{ ...card, maxWidth: 680, width: '100%', margin: '10px auto', padding: 30, display: 'grid', gap: 16, boxSizing: 'border-box' }}>
      <h2 style={{ fontFamily: C.serif, fontSize: 26, fontWeight: 900, margin: 0, textAlign: 'center' }}>{results.length} editions of {app?.name ?? 'the post'}</h2>
      <p style={{ margin: 0, color: C.ink2, textAlign: 'center' }}>Each one is its own post in the Queue, tagged with its country, so you can promote it to that market.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {results.map(({ market, post }) => {
          const m = MARKETS[market]
          const sched = post.status === 'scheduled'
          const ok = post.targets.filter((t) => t.status === 'published').length
          return (
            <div key={market} style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr)', gap: 12, padding: '10px 14px', borderRadius: 12, background: C.card2, alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>{m.flag} {m.name}</b>
              <span style={{ fontSize: 12.5, color: post.status === 'failed' ? C.red : C.ink2, minWidth: 0 }}>
                {sched && post.scheduled_at ? `Scheduled · ${inZone(new Date(post.scheduled_at), m.tz)} local (${when(post.scheduled_at)} yours)`
                  : post.status === 'publishing' ? 'Publishing — check the Queue'
                  : `${ok} of ${post.targets.length} posted`}
                {post.targets.filter((t) => t.permalink).map((t) => <a key={t.platform} href={t.permalink} target="_blank" rel="noreferrer" style={{ color: C.mint, fontWeight: 700, marginLeft: 8 }}>{PLATFORMS.find((p) => p.id === t.platform)?.name} ↗</a>)}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}><button style={btn('solid')} onClick={onNew}>New post</button></div>
    </section>
  )
}

function Result({ post, series, app, onNew }: { post: QueuedPost; series?: QueuedSeries | null; app?: PublishApp; onNew: () => void }) {
  const scheduled = post.status === 'scheduled'
  const all = post.targets.every((t) => t.status === 'published')
  const busy = post.status === 'publishing'
  return (
    <section style={{ ...card, maxWidth: 620, width: '100%', margin: '10px auto', padding: 30, display: 'grid', gap: 18, textAlign: 'center', justifyItems: 'center', boxSizing: 'border-box' }}>
      <div style={{ width: 58, height: 58, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 26, color: '#fff',
                    background: scheduled || all ? C.mint : busy ? C.amber : C.red }}>
        {scheduled ? '◷' : all ? '✓' : busy ? '…' : '!'}
      </div>
      <h2 style={{ fontFamily: C.serif, fontSize: 26, fontWeight: 900, margin: 0 }}>
        {series ? 'Repeating' : scheduled ? 'Scheduled' : all ? 'Posted everywhere' : busy ? 'Publishing…' : 'Some didn’t go through'}
      </h2>
      <p style={{ margin: 0, color: C.ink2 }}>
        {series && post.scheduled_at ? `${describeRule(series.rule)}. First one goes out ${when(post.scheduled_at)}${series.caption_mode === 'fresh' ? ', and every copy after that gets a fresh AI caption' : ''}. Pause or stop it from the Queue.`
          : scheduled && post.scheduled_at ? `${app?.name ?? 'It'} goes out ${when(post.scheduled_at)}. It’s in the queue if you change your mind.`
          : busy ? 'Still processing the media — this updates on its own.'
          : `${app?.name ?? ''} · ${post.targets.length} platform${post.targets.length === 1 ? '' : 's'}`}
      </p>
      {!scheduled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, width: '100%', textAlign: 'left' }}>
          {post.targets.map((t) => (
            <div key={t.platform} style={{ display: 'flex', alignItems: t.status === 'failed' ? 'flex-start' : 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: C.card2, minWidth: 0 }}>
              <span style={{ flexShrink: 0, paddingTop: t.status === 'failed' ? 1 : 0 }}><PlatformGlyph platform={t.platform} /></span>
              <b style={{ fontSize: 14, flexShrink: 0 }}>{PLATFORMS.find((p) => p.id === t.platform)?.name}</b>
              <span title={t.error} style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, paddingTop: t.status === 'failed' ? 1 : 0, color: t.status === 'failed' ? C.red : C.soft,
                                             ...(t.status === 'failed' ? { whiteSpace: 'normal', overflowWrap: 'anywhere' } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
                {t.status === 'published' ? (t.platform === 'tiktok' && t.tiktok?.mode === 'draft' ? 'In the TikTok app’s inbox — finish it there' : t.platform === 'tiktok' ? 'Posted — can take a few minutes to show on the profile' : 'Live')
                  : t.status === 'failed' ? t.error : 'Processing…'}
              </span>
              {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer" style={{ color: C.mint, fontWeight: 700, fontSize: 13 }}>View ↗</a>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={btn('solid')} onClick={onNew}>New post</button>
      </div>
    </section>
  )
}

// Repeat settings: weekdays + times, or hand-picked dates; when to stop; and
// whether each copy gets a fresh AI caption.
function RepeatPanel(p: {
  kind: 'weekly' | 'auto' | 'dates'; setKind: (k: 'weekly' | 'auto' | 'dates') => void
  perWeek: number; setPerWeek: (n: number) => void; bt: BestTime | null
  days: number[]; setDays: (d: number[]) => void; times: string[]; setTimes: (t: string[]) => void
  dates: string[]; setDates: (d: string[]) => void
  endKind: 'never' | 'count' | 'date'; setEndKind: (k: 'never' | 'count' | 'date') => void
  endCount: number; setEndCount: (n: number) => void; endDate: string; setEndDate: (d: string) => void
  fresh: boolean; setFresh: (v: boolean) => void; aiReady: boolean
  problems: string[]; next: Date[]; tz: string
}) {
  const input: React.CSSProperties = { border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '8px 11px', fontFamily: C.sans, fontSize: 14, color: C.ink, background: C.paper }
  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? C.ink : C.rule2}`, background: active ? C.ink : C.card, color: active ? C.paper : C.ink2,
    borderRadius: 99, padding: '5px 0', width: 40, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: C.sans,
  })
  const small: React.CSSProperties = { border: 0, background: 'transparent', color: C.mint, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: C.sans }
  const presets: { label: string; days: number[] }[] = [
    { label: 'Tue + Thu', days: [2, 4] }, { label: 'Mon/Wed/Fri', days: [1, 3, 5] }, { label: 'Weekdays', days: [1, 2, 3, 4, 5] }, { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  ]
  return (
    <div style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 14, background: C.paper, border: `1px solid ${C.rule}` }}>
      <Segmented<'weekly' | 'auto' | 'dates'> value={p.kind} onChange={p.setKind}
        options={[{ value: 'auto', label: '✦ Best times' }, { value: 'weekly', label: 'Every week' }, { value: 'dates', label: 'Custom dates' }]} />

      {p.kind === 'auto' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.ink2 }}>
            <input type="number" min={1} max={14} value={p.perWeek} onChange={(e) => p.setPerWeek(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} style={{ ...input, width: 66 }} /> posts a week, at the best hours
          </label>
          {p.bt && <Heatmap heat={p.bt.heat} />}
          <span style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5 }}>{p.bt ? p.bt.reason : 'Working out the best hours…'} Each copy’s time is picked when it’s made, so it keeps learning.</span>
        </div>
      ) : p.kind === 'weekly' ? (
        <>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {DAY_SHORT.map((d, i) => {
              const on = p.days.includes(i)
              return <button key={d} aria-pressed={on} style={chip(on)} onClick={() => p.setDays(on ? p.days.filter((x) => x !== i) : [...p.days, i])}>{d}</button>
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {p.bt && <button style={small} title={p.bt.reason} onClick={() => { p.setDays(p.bt!.weekly.days); p.setTimes(p.bt!.weekly.times) }}>✦ Suggest days & time</button>}
            {presets.map((x) => <button key={x.label} style={small} onClick={() => p.setDays(x.days)}>{x.label}</button>)}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={label}>At</span>
            {p.times.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="time" value={t} onChange={(e) => p.setTimes(p.times.map((x, j) => j === i ? e.target.value : x))} style={input} />
                {p.times.length > 1 && <button style={{ ...small, color: C.soft }} onClick={() => p.setTimes(p.times.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            {p.times.length < 4 && <button style={{ ...small, justifySelf: 'start' }} onClick={() => p.setTimes([...p.times, '18:00'])}>+ Another time each day</button>}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {p.dates.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="datetime-local" value={d} min={localInput(new Date())} onChange={(e) => p.setDates(p.dates.map((x, j) => j === i ? e.target.value : x))} style={{ ...input, flex: 1, minWidth: 0 }} />
              {p.dates.length > 1 && <button style={{ ...small, color: C.soft }} onClick={() => p.setDates(p.dates.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          ))}
          {p.dates.length < 60 && <button style={{ ...small, justifySelf: 'start' }} onClick={() => {
            const last = p.dates.length ? new Date(p.dates[p.dates.length - 1]) : new Date()
            const d = isNaN(last.getTime()) ? new Date() : last; d.setDate(d.getDate() + 7)
            p.setDates([...p.dates, localInput(d)])
          }}>+ Add a date</button>}
        </div>
      )}

      {p.kind !== 'dates' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={label}>Stop</span>
          <Segmented<'never' | 'count' | 'date'> value={p.endKind} onChange={p.setEndKind}
            options={[{ value: 'count', label: 'After' }, { value: 'date', label: 'On a date' }, { value: 'never', label: 'Never' }]} />
          {p.endKind === 'count' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.ink2 }}>
              <input type="number" min={1} max={500} value={p.endCount} onChange={(e) => p.setEndCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} style={{ ...input, width: 76 }} /> posts
            </label>
          )}
          {p.endKind === 'date' && <input type="date" value={p.endDate} onChange={(e) => p.setEndDate(e.target.value)} style={input} />}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: C.ink2, cursor: p.aiReady ? 'pointer' : 'not-allowed', lineHeight: 1.45 }}>
        <Toggle on={p.fresh && p.aiReady} disabled={!p.aiReady} onChange={p.setFresh} label="Fresh AI caption each time" />
        <span><b style={{ color: C.ink }}>Fresh caption each time</b><br />
          {p.aiReady ? 'The first post uses your caption; Claude writes a new one for every copy after, so feeds never see the same words twice. Each copy shows in the Queue a day or two ahead — rewrite or skip it there.'
            : 'Needs AI captions switched on (ANTHROPIC_API_KEY). Until then every copy reuses your caption.'}</span>
      </label>

      {p.problems.length > 0
        ? p.problems.map((x) => <span key={x} style={{ fontSize: 12, color: C.red }}>{x}</span>)
        : <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6 }}>
            <span style={label}>Next</span><br />
            {p.next.map((d) => shortWhen(d)).join(' · ')}{p.next.length === 4 ? ' …' : ''}
            {p.kind !== 'dates' && <><br /><span style={{ color: C.soft, fontSize: 11.5 }}>Times are {p.tz.replace('_', ' ')} time.</span></>}
          </div>}
    </div>
  )
}

// 7 × 24 "when your audience is around" grid, darker = better.
function Heatmap({ heat }: { heat: number[] }) {
  return (
    <div aria-label="Best hours of the week" style={{ display: 'grid', gap: 2 }}>
      {DAY_SHORT.map((d, di) => (
        <div key={d} style={{ display: 'grid', gridTemplateColumns: '28px repeat(24, 1fr)', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: C.soft, fontFamily: C.mono }}>{d}</span>
          {heat.slice(di * 24, di * 24 + 24).map((v, h) => (
            <span key={h} title={`${d} ${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`}
              style={{ height: 9, borderRadius: 2, background: C.mint, opacity: 0.08 + 0.92 * v * v }} />
          ))}
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(4, 1fr)', fontSize: 9.5, color: C.faint, fontFamily: C.mono }}>
        <span /><span>12a</span><span>6a</span><span>12p</span><span>6p</span>
      </div>
    </div>
  )
}
