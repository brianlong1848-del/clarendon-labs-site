'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, btn } from '@/components/AdminNav'
import {
  PLATFORMS, FORMAT_LABEL, defaultFormat, fbReelOK, validate, captionFor, ratioName,
  type Format, type MediaItem, type Platform, type Target,
} from '@/lib/publish/rules'
import { Preview } from './Preview'
import { PlatformGlyph, Segmented, Toggle, card, label, when, type PublishApp, type QueuedPost } from './shared'

// ─── Composer ────────────────────────────────────────────────────────────────
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

const DRAFT_KEY = 'clarendon:post-draft'
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

export function Composer({ pw, apps, onPosted }: { pw: string; apps: PublishApp[]; onPosted: () => void }) {
  const [appId, setAppId] = useState(apps[0]?.id ?? '')
  const [items, setItems] = useState<Item[]>([])
  const [caption, setCaption] = useState('')
  const [tailor, setTailor] = useState(false)
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>({})
  const [dest, setDest] = useState<Dest>(initialDest)
  const [schedule, setSchedule] = useState(false)
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

  const connectThreads = async () => {
    setConnecting(true); setError(null)
    const res = await fetch(`/api/publish/threads/connect?app=${appId}`, { method: 'POST', headers: {} }).catch(() => null)
    const out = await res?.json().catch(() => ({})) ?? {}
    if (res?.ok && out.url) window.location.href = out.url
    else { setConnecting(false); setError(out.error ?? 'Couldn’t start the Threads sign-in.') }
  }

  const app = apps.find((a) => a.id === appId)
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

  const media: MediaItem[] = useMemo(() => items.map((i) => ({ url: i.url ?? 'https://pending', kind: i.kind, width: i.width, height: i.height, duration: i.duration, mime: i.mime })), [items])

  // Keep Instagram's format sensible as media changes.
  useEffect(() => {
    setDest((d) => {
      const f = d.instagram.format
      const oneVideo = media.length === 1 && media[0].kind === 'video'
      const ok = f === 'reel' ? oneVideo : f === 'story' ? media.length <= 1 : !oneVideo
      const next = ok ? d : { ...d, instagram: { ...d.instagram, format: defaultFormat('instagram', media) } }
      // New media → Facebook picks its default (a vertical clip becomes a Reel);
      // same media → keep your choice unless it no longer fits.
      const key = media.map((m) => `${m.kind}${m.width}x${m.height}:${Math.round(m.duration ?? 0)}`).join()
      const changed = key !== mediaKey.current
      mediaKey.current = key
      const fbValid = d.facebook.format === 'post' || (oneVideo && fbReelOK(media[0]))
      const fb = changed || !fbValid ? defaultFormat('facebook', media) : d.facebook.format
      return fb === next.facebook.format ? next : { ...next, facebook: { ...next.facebook, format: fb } }
    })
  }, [media])

  const targets: Target[] = PLATFORMS.filter((p) => dest[p.id].on).map((p) => ({ platform: p.id, format: dest[p.id].format }))
  const issues = validate(targets, media, caption, tailor ? overrides : {})
  const errors = issues.filter((i) => i.level === 'error')
  const uploading = items.some((i) => i.status === 'preparing' || i.status === 'uploading')
  const failedUploads = items.some((i) => i.status === 'error')
  const scheduleDate = new Date(at)
  const scheduleOk = !schedule || scheduleDate.getTime() > Date.now() + 60_000
  const canSend = !sending && targets.length > 0 && errors.length === 0 && !uploading && !failedUploads && scheduleOk

  const firstTarget = targets[0]?.platform
  useEffect(() => { if (firstTarget && !dest[previewOn]?.on) setPreviewOn(firstTarget) }, [dest, previewOn, firstTarget])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, 10)
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
  }, [pw, appId])

  const send = async () => {
    if (!canSend) return
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId, caption, overrides: tailor ? overrides : {}, targets,
          media: items.map((i) => ({ url: i.url, kind: i.kind, width: i.width, height: i.height, duration: i.duration, mime: i.mime })),
          scheduledAt: schedule ? scheduleDate.toISOString() : null,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Posting failed.')
      setResult(body.post); onPosted()
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

  const reset = () => { setItems([]); setCaption(''); setOverrides({}); setTailor(false); setResult(null); setSchedule(false) }
  const move = (from: string, to: string) => setItems((xs) => {
    const a = [...xs], i = a.findIndex((x) => x.key === from), j = a.findIndex((x) => x.key === to)
    if (i < 0 || j < 0) return xs
    const [m] = a.splice(i, 1); a.splice(j, 0, m); return a
  })

  const strictest = targets.map((t) => ({ t, max: PLATFORMS.find((p) => p.id === t.platform)!.captionMax })).sort((a, b) => a.max - b.max)[0]
  const tags = (caption.match(/(^|\s)#\w/g) ?? []).length
  const previewTarget = targets.find((t) => t.platform === previewOn) ?? targets[0]
  const pname = (p: Platform) => PLATFORMS.find((x) => x.id === p)!.name

  if (result) return <Result post={result} app={app} onNew={reset} />

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
                <span style={{ fontSize: 13, color: C.soft }}>JPEG, PNG, MP4 or MOV · up to 10 for a carousel · or post text only to Threads and Facebook</span>
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
                {items.length < 10 && (
                  <button onClick={() => fileInput.current?.click()} aria-label="Add more"
                    style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${C.rule2}`, background: 'transparent', color: C.mint, fontSize: 28, cursor: 'pointer' }}>+</button>
                )}
              </div>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
        </section>

        {/* 3 · Caption */}
        <section style={card}>
          {step(3, 'Caption', <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink2, cursor: 'pointer' }}>
            Tailor per platform <Toggle on={tailor} onChange={setTailor} label="Tailor caption per platform" />
          </label>)}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6}
            placeholder={`What's new with ${app?.name ?? 'the app'}? Hashtags and @mentions welcome.`}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${C.rule2}`, borderRadius: 12, padding: '12px 14px', fontFamily: C.sans, fontSize: 15, lineHeight: 1.5, color: C.ink, background: C.paper, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: C.soft, flexWrap: 'wrap' }}>
            <span style={{ color: strictest && caption.length > strictest.max ? C.red : C.soft }}>
              {caption.length.toLocaleString()}{strictest ? ` / ${strictest.max.toLocaleString()} (${pname(strictest.t.platform)})` : ''}
            </span>
            <span style={{ color: tags > 30 ? C.red : C.soft }}>{tags} hashtag{tags === 1 ? '' : 's'}</span>
            <span style={{ flex: 1 }} /><span>⌘↵ to {schedule ? 'schedule' : 'post'}</span>
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
          {step(4, 'Where to post', <span style={{ fontSize: 12.5, color: C.soft }}>{targets.length} selected</span>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 10 }}>
            {PLATFORMS.map((p) => {
              const acc = account(p.id)
              const on = dest[p.id].on
              const oneVideo = media.length === 1 && media[0].kind === 'video'
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
                        { value: 'story', label: 'Story', disabled: media.length > 1, title: 'One photo or video, gone in 24 hours' },
                      ]} />
                  )}
                  {p.id === 'facebook' && acc?.ready && oneVideo && (
                    <Segmented<Format> value={dest.facebook.format} disabled={!on}
                      onChange={(f) => setDest((d) => ({ ...d, facebook: { ...d.facebook, format: f } }))}
                      options={[
                        { value: 'post', label: 'Video', title: 'A regular video post on the Page' },
                        { value: 'reel', label: 'Reel', disabled: !fbReelOK(media[0]), title: fbReelOK(media[0]) ? 'Vertical, up to 90 seconds — Reels reach more people' : 'Reels need a vertical video of 3–90 seconds' },
                      ]} />
                  )}
                  {!acc?.ready && acc?.reason && <p style={{ margin: 0, fontSize: 12, color: C.ink2, lineHeight: 1.45 }}>{acc.reason}</p>}
                  {!acc?.ready && acc?.connect === 'threads' && (
                    <button onClick={connectThreads} disabled={connecting} style={{ ...btn('solid'), justifySelf: 'start', fontSize: 13, padding: '8px 14px' }}>
                      {connecting ? 'Opening Threads…' : 'Connect Threads'}
                    </button>
                  )}
                  {p.id === 'tiktok' && !acc?.ready && oneVideo && items[0]?.url && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.ink, width: '100%' }}>Post it yourself</span>
                      <button style={{ ...btn('ghost'), fontSize: 12.5, padding: '7px 12px' }}
                        onClick={() => { navigator.clipboard?.writeText(captionFor('tiktok', caption, tailor ? overrides : {})); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>
                        {copied ? 'Copied ✓' : 'Copy caption'}
                      </button>
                      <a href={items[0].url} target="_blank" rel="noreferrer" download style={{ ...btn('ghost'), fontSize: 12.5, padding: '7px 12px', textDecoration: 'none' }}>Open video</a>
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
            <span style={{ ...label, marginRight: 6 }}>Preview</span>
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
              media={items.filter((i) => i.src).map((i) => ({ src: i.src, kind: i.kind, width: i.width, height: i.height }))} />
          ) : <p style={{ color: C.soft, fontSize: 13.5, textAlign: 'center', margin: '30px 0' }}>Turn on a platform to preview it.</p>}
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 10 }}>
          <span style={label}>Checks</span>
          {targets.length === 0 ? <Check tone="muted" text="Pick at least one place to post." /> :
            issues.length === 0 ? <Check tone="ok" text={`Ready for ${targets.map((t) => pname(t.platform)).join(', ')}.`} /> :
              issues.map((i, k) => <Check key={k} tone={i.level === 'error' ? 'bad' : 'warn'} platform={i.platform} text={i.text} />)}
          {uploading && <Check tone="muted" text="Uploading media…" />}
          {failedUploads && <Check tone="bad" text="Remove the media that failed to upload." />}
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Toggle on={schedule} onChange={setSchedule} label="Schedule for later" /> Schedule for later
          </label>
          {schedule && (
            <div style={{ display: 'grid', gap: 8 }}>
              <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)}
                style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '9px 12px', fontFamily: C.sans, fontSize: 14, color: C.ink, background: C.paper }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {quickTimes().map((q) => {
                  const active = at === localInput(q.d)
                  return (
                    <button key={q.label} onClick={() => setAt(localInput(q.d))}
                      style={{ border: `1px solid ${C.rule2}`, background: active ? C.ink : C.card, color: active ? C.paper : C.ink2, borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>{q.label}</button>
                  )
                })}
              </div>
              {!scheduleOk && <span style={{ fontSize: 12, color: C.red }}>Pick a time at least a minute from now.</span>}
              <span style={{ fontSize: 11.5, color: C.soft }}>Goes out within 5 minutes of this time.</span>
            </div>
          )}
          <button onClick={send} disabled={!canSend}
            style={{ ...btn('mint'), width: '100%', padding: '14px 18px', fontSize: 15.5, borderRadius: 12, opacity: canSend ? 1 : 0.45, cursor: canSend ? 'pointer' : 'not-allowed' }}>
            {sending ? (schedule ? 'Scheduling…' : 'Posting…')
              : schedule ? `Schedule · ${isNaN(scheduleDate.getTime()) ? '' : when(scheduleDate.toISOString())}`
              : targets.length ? `Post now to ${targets.length} ${targets.length === 1 ? 'place' : 'places'}` : 'Post now'}
          </button>
          {sending && !schedule && <span style={{ fontSize: 12, color: C.soft, textAlign: 'center' }}>Videos can take a minute while Meta processes them.</span>}
          {error && <span style={{ fontSize: 13, color: C.red }}>{error}</span>}
        </section>
      </aside>
      <style>{`@media (max-width: 1100px){ .composer{ grid-template-columns: 1fr !important } .composer aside{ position: static !important } }`}</style>
    </div>
  )
}

function Check({ tone, text, platform }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; text: string; platform?: Platform }) {
  const color = tone === 'ok' ? C.mint : tone === 'warn' ? C.amber : tone === 'bad' ? C.red : C.soft
  const mark = tone === 'ok' ? '✓' : tone === 'warn' ? '!' : tone === 'bad' ? '×' : '·'
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: C.ink2 }}>
      <span style={{ width: 18, height: 18, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, color: '#fff', background: color }}>{mark}</span>
      {platform && <span style={{ flexShrink: 0, paddingTop: 1 }}><PlatformGlyph platform={platform} size={15} /></span>}<span>{text}</span>
    </div>
  )
}

function Result({ post, app, onNew }: { post: QueuedPost; app?: PublishApp; onNew: () => void }) {
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
        {scheduled ? 'Scheduled' : all ? 'Posted everywhere' : busy ? 'Publishing…' : 'Some didn’t go through'}
      </h2>
      <p style={{ margin: 0, color: C.ink2 }}>
        {scheduled && post.scheduled_at ? `${app?.name ?? 'It'} goes out ${when(post.scheduled_at)}. It’s in the queue if you change your mind.`
          : busy ? 'Meta is still processing the media — this updates on its own.'
          : `${app?.name ?? ''} · ${post.targets.length} platform${post.targets.length === 1 ? '' : 's'}`}
      </p>
      {!scheduled && (
        <div style={{ display: 'grid', gap: 8, width: '100%', textAlign: 'left' }}>
          {post.targets.map((t) => (
            <div key={t.platform} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: C.card2 }}>
              <PlatformGlyph platform={t.platform} />
              <b style={{ fontSize: 14 }}>{PLATFORMS.find((p) => p.id === t.platform)?.name}</b>
              <span title={t.error} style={{ flex: 1, fontSize: 12.5, color: t.status === 'failed' ? C.red : C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.status === 'published' ? 'Live' : t.status === 'failed' ? t.error : 'Processing…'}
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
