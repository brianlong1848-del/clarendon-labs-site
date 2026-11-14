'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppTag, C, btn } from '@/components/AdminNav'
import { PLATFORMS, FORMAT_LABEL, captionFor, mediaFor, type Format, type MediaItem, type Platform } from '@/lib/publish/rules'
import { PlatformGlyph, allMediaOf, label, localInput, when, type PublishApp, type QueuedPost } from './shared'
import { MediaViewer, Thumb } from './MediaViewer'
import { CountryTag, marketOf } from './country'
import { uploadFile } from './upload'
import { inZone } from '@/lib/publish/markets'

// ─── Post detail drawer ──────────────────────────────────────────────────────
//
// Opens from a Queue row or a Calendar chip: the full caption per platform,
// the media (and each platform's own cut), stats once measured, and what can
// be done — Edit / Reschedule / Duplicate / Cancel for a scheduled post,
// Retry / Clear for a failed one, Duplicate / Promote for one that went out.

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  scheduled: { text: 'Scheduled', color: C.ink2, bg: C.card2 },
  publishing: { text: 'Publishing…', color: C.amber, bg: '#FBF0DD' },
  done: { text: 'Posted', color: C.mint, bg: C.mintTint },
  partial: { text: 'Partly posted', color: C.amber, bg: '#FBF0DD' },
  failed: { text: 'Failed', color: C.red, bg: '#FBE7E5' },
  canceled: { text: 'Canceled', color: C.soft, bg: C.card2 },
}
export const statusOf = (s: string) => STATUS[s] ?? STATUS.scheduled
const pname = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.name ?? p

type Props = {
  post: QueuedPost
  apps: PublishApp[]
  onClose: () => void
  /** The post as it is now (null = it left the queue). */
  onChanged: (post: QueuedPost | null) => void
  onDuplicate: (post: QueuedPost) => void
  onPromote?: (post: QueuedPost) => void
  /** Open straight into the editor / time picker. */
  start?: 'edit' | 'reschedule'
}

export function PostDrawer({ post, apps, onClose, onChanged, onDuplicate, onPromote, start }: Props) {
  const app = apps.find((a) => a.id === post.app_id)
  const [mode, setMode] = useState<'view' | 'edit' | 'reschedule'>(start ?? 'view')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ media: QueuedPost['media']; index: number } | null>(null)
  const s = statusOf(post.status)
  const mk = marketOf(post)
  const at = post.scheduled_at ?? post.created_at
  const every = allMediaOf(post)
  const scheduled = post.status === 'scheduled'

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !viewing) onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose, viewing])
  useEffect(() => { setMode(start ?? 'view'); setError(null) }, [post.id, start])

  const call = async (what: string, url: string, init: RequestInit) => {
    setBusy(what); setError(null)
    const res = await fetch(url, init).catch(() => null)
    const body = await res?.json().catch(() => ({})) ?? {}
    setBusy(null)
    if (!res?.ok) { setError(body.error ?? 'Something went wrong.'); return null }
    return body as { post?: QueuedPost }
  }
  const cancel = async () => {
    if (!confirm(post.series_id ? 'Skip this copy of the repeating post?' : 'Cancel this post? It won’t go out.')) return
    const out = await call('cancel', `/api/publish?id=${post.id}`, { method: 'DELETE' })
    if (out) { onChanged(null); onClose() }
  }
  const retry = async () => { const out = await call('retry', `/api/publish?id=${post.id}`, { method: 'PATCH' }); if (out?.post) onChanged(out.post) }
  const clear = async () => { const out = await call('clear', `/api/publish?id=${post.id}`, { method: 'DELETE' }); if (out) { onChanged(out.post && out.post.status !== 'canceled' ? out.post : null); if (!out.post || out.post.status === 'canceled') onClose() } }
  const save = async (patch: Record<string, unknown>) => {
    const out = await call('save', `/api/publish?id=${post.id}&action=edit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (out?.post) { onChanged(out.post); setMode('view') }
  }

  const small: React.CSSProperties = { ...btn('ghost'), padding: '8px 13px', fontSize: 13 }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Post details" className="pd-root" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', fontFamily: C.sans, color: C.ink }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,21,.28)', backdropFilter: 'blur(2px)' }} />
      <aside className="pd-panel" style={{ position: 'relative', width: 'min(520px, 100vw)', height: '100%', background: C.paper, boxShadow: '-20px 0 60px rgba(15,17,21,.18)', overflowY: 'auto', display: 'grid', alignContent: 'start' }}>
        <div style={{ height: 4, background: app?.accent ?? C.mint }} />
        <header style={{ padding: '18px 22px 14px', display: 'grid', gap: 8, background: C.card, borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AppTag id={post.app_id} name={app?.name} size={26} style={{ fontWeight: 800, fontSize: 16 }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px' }}>{s.text}</span>
            <span style={{ flex: 1 }} />
            <button onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: C.soft, width: 40, height: 40, display: 'grid', placeItems: 'center' }}>×</button>
          </div>
          <div style={{ fontSize: 13.5, color: C.ink2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span><b style={{ color: C.ink }}>{when(at)}</b>{scheduled ? '' : ''}</span>
            {mk && <CountryTag m={mk} size={11.5} />}
            {mk && mk.tz !== 'America/Chicago' && <span style={{ fontSize: 12, color: C.soft }}>{inZone(new Date(at), mk.tz)} there</span>}
            {post.series_id && <span style={{ fontSize: 12, color: C.soft }}>↻ copy #{post.occurrence ?? '?'}</span>}
            {post.caption_by === 'ai' && <span style={{ fontSize: 12, fontWeight: 700, color: C.mint }}>✦ AI caption</span>}
          </div>
          {/* Actions — one primary per region. */}
          {mode === 'view' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {scheduled && <button style={{ ...btn('mint'), padding: '8px 14px', fontSize: 13 }} onClick={() => setMode('edit')}>Edit</button>}
              {scheduled && <button style={small} onClick={() => setMode('reschedule')}>Reschedule</button>}
              {(post.status === 'failed' || post.status === 'partial') && <button style={{ ...btn('solid'), padding: '8px 14px', fontSize: 13 }} disabled={!!busy} onClick={retry}>{busy === 'retry' ? 'Retrying…' : 'Retry failed'}</button>}
              {onPromote && (post.status === 'done' || post.status === 'partial') && <button style={{ ...btn('mint'), padding: '8px 14px', fontSize: 13 }} onClick={() => onPromote(post)}>Promote</button>}
              <button style={small} onClick={() => onDuplicate(post)}>Duplicate</button>
              {scheduled && <button style={{ ...small, color: C.red }} disabled={!!busy} onClick={cancel}>{busy === 'cancel' ? 'Canceling…' : post.series_id ? 'Skip this one' : 'Cancel post'}</button>}
              {(post.status === 'failed' || post.status === 'partial') && <button style={small} disabled={!!busy} onClick={clear}>{post.status === 'partial' ? 'Clear failures' : 'Clear'}</button>}
            </div>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
        </header>

        {mode === 'reschedule' && <Reschedule post={post} busy={busy === 'save'} onCancel={() => setMode('view')} onSave={(iso) => save({ scheduledAt: iso })} />}
        {mode === 'edit' && <Editor post={post} busy={busy === 'save'} onCancel={() => setMode('view')} onSave={save} onError={setError} />}

        {mode === 'view' && (
          <div style={{ padding: 22, display: 'grid', gap: 18 }}>
            {every.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                {every.map((m, i) => (
                  <div key={m.url} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: C.card2 }}>
                    <Thumb item={m} onOpen={() => setViewing({ media: every, index: i })} />
                  </div>
                ))}
              </div>
            )}
            {post.targets.map((t) => {
              const text = captionFor(t.platform, post.caption, post.overrides ?? {})
              const cut = mediaFor(t.platform, post.media as MediaItem[], post.media_overrides as never)
              const st = post.stats?.[t.platform]
              const tone = t.status === 'published' ? C.mint : t.status === 'failed' ? C.red : C.ink2
              return (
                <section key={t.platform} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlatformGlyph platform={t.platform} size={17} />
                    <b style={{ fontSize: 14 }}>{pname(t.platform)}</b>
                    {(t.platform === 'instagram' || t.platform === 'facebook') && <span style={{ fontSize: 12, color: C.soft }}>{FORMAT_LABEL[t.format as Format]}</span>}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: tone }}>{t.status === 'published' ? 'Live' : t.status === 'failed' ? 'Failed' : t.status === 'processing' ? 'Processing' : t.status === 'skipped' ? 'Skipped' : 'Waiting'}</span>
                    {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer" style={{ color: C.mint, fontWeight: 700, fontSize: 12.5 }}>View ↗</a>}
                  </div>
                  {t.format === 'story' ? <span style={{ fontSize: 12.5, color: C.soft }}>Stories don’t show captions.</span>
                    : <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text || <i style={{ color: C.soft }}>No caption</i>}</p>}
                  {post.media_overrides?.[t.platform] && <span style={{ fontSize: 12, color: C.soft }}>Its own cut · {cut.length} file{cut.length === 1 ? '' : 's'}</span>}
                  {st && <span style={{ fontSize: 12.5, color: C.ink2 }}><b>{st.reach.toLocaleString()}</b> reached · <b>{st.engagement.toLocaleString()}</b> engaged</span>}
                  {t.error && <span style={{ fontSize: 12.5, color: C.red, overflowWrap: 'anywhere' }}>{t.error}</span>}
                </section>
              )
            })}
            {post.notes && <div><span style={label}>Brief</span><p style={{ margin: '4px 0 0', fontSize: 13, color: C.ink2 }}>{post.notes}</p></div>}
          </div>
        )}
      </aside>
      {viewing && <MediaViewer media={viewing.media} start={viewing.index} onClose={() => setViewing(null)} />}
      <style>{`@keyframes pd-in{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}} .pd-panel{animation:pd-in .25s cubic-bezier(.2,.7,.2,1)} @media (prefers-reduced-motion: reduce){.pd-panel{animation:none}}`}</style>
    </div>,
    document.body,
  )
}

function Reschedule({ post, busy, onCancel, onSave }: { post: QueuedPost; busy: boolean; onCancel: () => void; onSave: (iso: string) => void }) {
  const [at, setAt] = useState(() => localInput(new Date(post.scheduled_at ?? Date.now())))
  const d = new Date(at)
  const ok = !isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000
  const nudge = (min: number) => setAt(localInput(new Date((isNaN(d.getTime()) ? Date.now() : d.getTime()) + min * 60_000)))
  return (
    <div style={{ padding: 22, display: 'grid', gap: 12 }}>
      <span style={label}>New time</span>
      <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)}
        style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontFamily: C.sans, fontSize: 15, color: C.ink, background: C.card }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[[-60, '−1 h'], [60, '+1 h'], [24 * 60, '+1 day'], [7 * 24 * 60, '+1 week']].map(([m, l]) => (
          <button key={l} onClick={() => nudge(m as number)} style={{ border: `1px solid ${C.rule2}`, background: C.card, borderRadius: 99, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans, color: C.ink2 }}>{l}</button>
        ))}
      </div>
      {!ok && <span style={{ fontSize: 12.5, color: C.red }}>Pick a time at least a minute from now.</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...btn('mint'), opacity: ok ? 1 : 0.45 }} disabled={!ok || busy} onClick={() => onSave(d.toISOString())}>{busy ? 'Saving…' : `Move to ${ok ? when(d.toISOString()) : '…'}`}</button>
        <button style={btn('ghost')} onClick={onCancel}>Back</button>
      </div>
    </div>
  )
}

type EditMedia = QueuedPost['media'][number] & { key: string; uploading?: number; error?: string }

function Editor({ post, busy, onCancel, onSave, onError }: { post: QueuedPost; busy: boolean; onCancel: () => void; onSave: (patch: Record<string, unknown>) => void; onError: (e: string | null) => void }) {
  const [caption, setCaption] = useState(post.caption)
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>(post.overrides ?? {})
  const [at, setAt] = useState(() => localInput(new Date(post.scheduled_at ?? Date.now())))
  const [media, setMedia] = useState<EditMedia[]>(() => post.media.map((m, i) => ({ ...m, key: `${i}-${m.url}` })))
  const file = useRef<HTMLInputElement>(null)
  const hasCuts = Object.keys(post.media_overrides ?? {}).length > 0
  const d = new Date(at)
  const timeOk = !isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000
  const uploading = media.some((m) => m.uploading !== undefined)
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontFamily: C.sans, fontSize: 14, color: C.ink, background: C.card, resize: 'vertical' }

  const add = async (files: FileList) => {
    for (const f of Array.from(files).filter((x) => /^(image|video)\//.test(x.type))) {
      const key = crypto.randomUUID()
      setMedia((xs) => [...xs, { key, url: '', kind: f.type.startsWith('video/') ? 'video' : 'image', width: 0, height: 0, uploading: 0 }])
      try {
        const up = await uploadFile(post.app_id, f, (p) => setMedia((xs) => xs.map((x) => x.key === key ? { ...x, uploading: p } : x)))
        setMedia((xs) => xs.map((x) => x.key === key ? { key, url: up.url, kind: up.kind, width: up.width, height: up.height, ...(up.duration ? { duration: up.duration } : {}) } : x))
      } catch (e) {
        setMedia((xs) => xs.filter((x) => x.key !== key)); onError((e as Error).message)
      }
    }
  }
  const submit = () => {
    const patch: Record<string, unknown> = {}
    if (caption !== post.caption) patch.caption = caption
    if (JSON.stringify(overrides) !== JSON.stringify(post.overrides ?? {})) patch.overrides = overrides
    if (timeOk && d.toISOString() !== new Date(post.scheduled_at ?? 0).toISOString()) patch.scheduledAt = d.toISOString()
    const list = media.filter((m) => m.url).map((m) => ({ url: m.url, kind: m.kind, width: m.width, height: m.height, ...((m as { duration?: number }).duration ? { duration: (m as { duration?: number }).duration } : {}) }))
    if (JSON.stringify(list.map((m) => m.url)) !== JSON.stringify(post.media.map((m) => m.url))) patch.media = list
    if (!Object.keys(patch).length) { onCancel(); return }
    onSave(patch)
  }
  const move = (i: number, by: number) => setMedia((xs) => { const a = [...xs]; const j = i + by; if (j < 0 || j >= a.length) return xs; [a[i], a[j]] = [a[j], a[i]]; return a })

  return (
    <div style={{ padding: 22, display: 'grid', gap: 16 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={label}>Goes out</span>
        <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)} style={input} />
        {!timeOk && <span style={{ fontSize: 12.5, color: C.red }}>Pick a time at least a minute from now.</span>}
      </label>
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={label}>Photos & video{hasCuts ? ' · shared (each platform’s own cut stays as it is)' : ''}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {media.map((m, i) => (
            <div key={m.key} style={{ position: 'relative', width: 84, height: 84, borderRadius: 8, overflow: 'hidden', background: C.card2 }}>
              {m.url ? (m.kind === 'video' ? <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                : <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: C.rule }}><div style={{ width: `${Math.round((m.uploading ?? 0) * 100)}%`, height: '100%', background: C.mint }} /></div>}
              <button aria-label="Remove" onClick={() => setMedia((xs) => xs.filter((x) => x.key !== m.key))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
              {media.length > 1 && <span style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 2 }}>
                {i > 0 && <button aria-label="Move earlier" onClick={() => move(i, -1)} style={{ width: 20, height: 20, borderRadius: 6, border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>‹</button>}
                {i < media.length - 1 && <button aria-label="Move later" onClick={() => move(i, 1)} style={{ width: 20, height: 20, borderRadius: 6, border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>›</button>}
              </span>}
            </div>
          ))}
          <button onClick={() => file.current?.click()} aria-label="Add media" style={{ width: 84, height: 84, borderRadius: 8, border: `1.5px dashed ${C.rule2}`, background: 'transparent', color: C.mint, fontSize: 26, cursor: 'pointer' }}>+</button>
          <input ref={file} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
        </div>
      </div>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={label}>Caption</span>
        <textarea value={caption} rows={6} onChange={(e) => setCaption(e.target.value)} style={{ ...input, fontSize: 14.5, lineHeight: 1.5 }} />
      </label>
      {post.targets.filter((t) => t.format !== 'story').map((t) => (
        <label key={t.platform} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, alignItems: 'start' }}>
          <span style={{ paddingTop: 10 }}><PlatformGlyph platform={t.platform} size={18} /></span>
          <textarea value={overrides[t.platform] ?? ''} rows={2} placeholder={`${pname(t.platform)}: same as above — type to change it just here`}
            onChange={(e) => setOverrides((o) => ({ ...o, [t.platform]: e.target.value }))} style={{ ...input, fontSize: 13.5 }} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: C.paper, padding: '10px 0' }}>
        <button style={{ ...btn('mint'), opacity: timeOk && !uploading ? 1 : 0.45 }} disabled={busy || !timeOk || uploading} onClick={submit}>{busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save changes'}</button>
        <button style={btn('ghost')} onClick={onCancel}>Back</button>
      </div>
    </div>
  )
}
