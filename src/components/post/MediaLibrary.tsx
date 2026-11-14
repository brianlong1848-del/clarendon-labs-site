'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, btn } from '@/components/AdminNav'
import { Segmented, allMediaOf, label, when, type QueuedPost } from './shared'

// ─── Media library picker ────────────────────────────────────────────────────
//
// "From Drive": browse Marketing/Assets (opens at the app's 05_Exports, like
// Studio's picker) through /api/publish/drive, pick files, and they come
// through /api/publish/drive/file as ordinary Files — the composer prepares
// and uploads them exactly like a drop. "Past posts": reuse the media of an
// earlier post of this app (already on studio-media, nothing re-uploaded).

type DriveEntry = { id: string; name: string; mimeType: string; folder: boolean; size?: number; width?: number; height?: number; duration?: number }
type DriveListing = { folder: { id: string; name: string }; parent: { id: string; name: string } | null; root: string; entries: DriveEntry[] }
export type ReuseMedia = QueuedPost['media'][number] & { name: string }

/** The name a studio-media file had before upload (paths are <uuid>-<name>). */
export const nameFromUrl = (u: string) => decodeURIComponent(u.split('/').pop()?.split('?')[0] ?? 'media').replace(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-/i, '')

export function MediaLibrary({ appId, appName, start = 'drive', onClose, onFiles, onReuse }: {
  appId: string; appName: string; start?: 'drive' | 'past'
  onClose: () => void
  /** Drive picks, downloaded — the composer prepares + uploads them. */
  onFiles: (files: File[]) => void
  /** Past-post media, already uploaded. */
  onReuse: (media: ReuseMedia[]) => void
}) {
  const [tab, setTab] = useState<'drive' | 'past'>(start)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Media library" style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', padding: 16, fontFamily: C.sans, color: C.ink }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,21,.32)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: 'min(880px, 100%)', maxHeight: 'min(760px, calc(100dvh - 32px))', background: C.card, borderRadius: 18, boxShadow: '0 30px 80px rgba(15,17,21,.3)', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${C.rule}` }}>
          <b style={{ fontSize: 16 }}>Add media · {appName}</b>
          <Segmented<'drive' | 'past'> value={tab} onChange={setTab} options={[{ value: 'drive', label: 'From Drive' }, { value: 'past', label: 'Past posts' }]} />
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', fontSize: 22, width: 40, height: 40, display: 'grid', placeItems: 'center', color: C.soft }}>×</button>
        </div>
        {tab === 'drive' ? <Drive appId={appId} onFiles={(f) => { onFiles(f); onClose() }} /> : <Past appId={appId} onReuse={(m) => { onReuse(m); onClose() }} />}
      </div>
    </div>,
    document.body,
  )
}

function Drive({ appId, onFiles }: { appId: string; onFiles: (f: File[]) => void }) {
  const [list, setList] = useState<DriveListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [sel, setSel] = useState<DriveEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setError(null)
    fetch(`/api/publish/drive?${folder ? `folder=${encodeURIComponent(folder)}` : `app=${appId}`}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => { if (!live) return; if (ok) setList(b); else setError(b.error ?? 'Couldn’t open Drive.') })
      .catch(() => { if (live) setError('Couldn’t reach Drive.') })
    return () => { live = false }
  }, [appId, folder])

  const add = async () => {
    const files: File[] = []
    for (const [i, e] of sel.entries()) {
      setBusy(`Downloading ${i + 1} of ${sel.length}…`)
      const res = await fetch(`/api/publish/drive/file?id=${encodeURIComponent(e.id)}`).catch(() => null)
      if (!res?.ok) { setError(`Couldn’t download ${e.name}.`); setBusy(null); return }
      files.push(new File([await res.blob()], e.name, { type: e.mimeType }))
    }
    setBusy(null); onFiles(files)
  }
  const files = list?.entries.filter((e) => !e.folder) ?? []
  const folders = list?.entries.filter((e) => e.folder) ?? []
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', minHeight: 0 }}>
      <div style={{ padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
        {list?.parent && <button style={{ ...btn('ghost'), padding: '6px 11px', fontSize: 12.5 }} onClick={() => setFolder(list.parent!.id)}>‹ {list.parent.name}</button>}
        <b>{list?.folder.name ?? 'Drive'}</b>
        {folders.map((f) => <button key={f.id} onClick={() => setFolder(f.id)} style={{ border: `1px solid ${C.rule2}`, background: C.card2, borderRadius: 99, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans, color: C.ink2 }}>📁 {f.name}</button>)}
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 20px 16px' }}>
        {error ? <p style={{ color: C.red, fontSize: 13.5 }}>{error}</p>
          : !list ? <p style={{ color: C.soft, fontSize: 13.5 }}>Opening Drive…</p>
          : !files.length ? <p style={{ color: C.soft, fontSize: 13.5 }}>No photos or videos in this folder — open a sub-folder above.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {files.map((f) => {
                const on = sel.some((x) => x.id === f.id)
                return (
                  <button key={f.id} aria-pressed={on} onClick={() => setSel((s) => on ? s.filter((x) => x.id !== f.id) : [...s, f])}
                    style={{ all: 'unset', cursor: 'pointer', borderRadius: 12, padding: 10, background: on ? C.mintTint : C.card2, outline: on ? `2px solid ${C.mint}` : 'none', display: 'grid', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 26 }} aria-hidden>{f.mimeType.startsWith('video/') ? '🎬' : '🖼️'}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{f.name}</span>
                    <span style={{ fontSize: 11.5, color: C.soft }}>
                      {f.width && f.height ? `${f.width}×${f.height}` : ''}{f.duration ? ` · ${Math.round(f.duration)}s` : ''}{f.size ? ` · ${(f.size / 1e6).toFixed(1)} MB` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
      </div>
      <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: C.soft, flex: 1 }}>{busy ?? (sel.length ? `${sel.length} picked — they upload like a drop` : 'Pick one or more files')}</span>
        <button style={{ ...btn('mint'), opacity: sel.length ? 1 : 0.45 }} disabled={!sel.length || !!busy} onClick={add}>{sel.length ? `Add ${sel.length}` : 'Add'}</button>
      </div>
    </div>
  )
}

function Past({ appId, onReuse }: { appId: string; onReuse: (m: ReuseMedia[]) => void }) {
  const [posts, setPosts] = useState<QueuedPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/publish').then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => ok ? setPosts((b.posts as QueuedPost[]).filter((p) => p.app_id === appId && allMediaOf(p).length)) : setError(b.error ?? 'Couldn’t load past posts.'))
      .catch(() => setError('Couldn’t load past posts.'))
  }, [appId])
  return (
    <div style={{ overflowY: 'auto', padding: '14px 20px 20px', display: 'grid', gap: 10, alignContent: 'start' }}>
      <span style={label}>Pick a post to reuse its media</span>
      {error ? <p style={{ color: C.red, fontSize: 13.5 }}>{error}</p>
        : !posts ? <p style={{ color: C.soft, fontSize: 13.5 }}>Loading…</p>
        : !posts.length ? <p style={{ color: C.soft, fontSize: 13.5 }}>No earlier posts with media for this app yet.</p>
        : posts.map((p) => {
          const media = allMediaOf(p)
          return (
            <button key={p.id} onClick={() => onReuse(media.map((m) => ({ ...m, name: nameFromUrl(m.url) })))}
              style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, border: `1px solid ${C.rule}` }}>
              <span style={{ display: 'flex', gap: 4 }}>
                {media.slice(0, 3).map((m) => (
                  <span key={m.url} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: C.card2, display: 'block' }}>
                    {m.kind === 'video' ? <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </span>
                ))}
              </span>
              <span style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, color: C.soft }}>{when(p.scheduled_at ?? p.created_at)} · {media.length} file{media.length === 1 ? '' : 's'}</span>
                <span style={{ fontSize: 13, color: C.ink2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.caption || 'No caption'}</span>
              </span>
            </button>
          )
        })}
    </div>
  )
}
