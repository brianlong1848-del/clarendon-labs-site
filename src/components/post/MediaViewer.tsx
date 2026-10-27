/* eslint-disable @next/next/no-img-element -- platform CDN images (Meta / TikTok / studio-media) */
'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { btn } from '@/components/AdminNav'

// ─── Media thumbnail + full-size player ──────────────────────────────────────
//
// Shared by the Post queue, the Campaigns card and Money → Ads: the same
// thumbnail tile and the same portal player, so a boost's video opens exactly
// like the post it came from. `refresh` lets a caller swap in a fresh URL when
// a platform's media link has expired (Meta/TikTok CDN links 403 after a
// while): the player asks once, then plays the new URL.

export type ViewerMedia = { url: string; kind: 'image' | 'video' }

/** Thumbnail: shows a video's first frame (preload metadata + #t) or the
 *  image, and opens the full player on click. Videos get a ▶ badge so it
 *  reads as playable; `badge` adds a small label (e.g. "+2" more ads). */
export function Thumb({ item, onOpen, poster, badge, title }: { item: ViewerMedia; onOpen: () => void; poster?: string; badge?: string; title?: string }) {
  return (
    <button onClick={onOpen} aria-label={item.kind === 'video' ? 'Play video' : 'View image'} title={title}
      style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', height: '100%', position: 'relative' }}>
      {item.kind === 'video' && !poster
        ? <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        : <img src={poster ?? item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      {item.kind === 'video' && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <span style={{ width: 30, height: 30, borderRadius: 99, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="#fff" /></svg>
          </span>
        </span>
      )}
      {badge && <span aria-hidden style={{ position: 'absolute', top: 3, right: 3, fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: 99, padding: '1px 5px' }}>{badge}</span>}
    </button>
  )
}

/** Full-size player for a post's media: video with controls (autoplays with
 *  sound — the click is the user gesture), images, arrows for carousels,
 *  Esc / ← / → on the keyboard. */
export function MediaViewer({ media, start, onClose, refresh }: { media: ViewerMedia[]; start: number; onClose: () => void; refresh?: (url: string) => Promise<string | null> }) {
  const [i, setI] = useState(start)
  const [swapped, setSwapped] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<string | null>(null)
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
  const url = swapped[m.url] ?? m.url
  const onError = async () => {
    if (!refresh || swapped[m.url] || failed === m.url) { setFailed(m.url); return }
    const fresh = await refresh(m.url).catch(() => null)
    if (fresh && fresh !== m.url) setSwapped((s) => ({ ...s, [m.url]: fresh })); else setFailed(m.url)
  }
  const arrow = (dir: -1 | 1) => (
    <button onClick={(e) => { e.stopPropagation(); setI((x) => x + dir) }} aria-label={dir < 0 ? 'Previous' : 'Next'}
      style={{ border: 0, width: 40, height: 40, borderRadius: 99, background: 'rgba(255,255,255,.9)', cursor: 'pointer', fontSize: 18 }}>{dir < 0 ? '‹' : '›'}</button>
  )
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Post media" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,12,.82)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%' }}>
        {media.length > 1 && (i > 0 ? arrow(-1) : <span style={{ width: 40 }} />)}
        {failed === m.url
          ? <p style={{ color: '#fff', fontSize: 14, maxWidth: 360, textAlign: 'center' }}>This video can’t be played here any more (the platform’s link expired). Open it on the platform instead.</p>
          : m.kind === 'video'
            ? <video key={url} src={url} controls autoPlay playsInline onError={onError} style={{ maxHeight: '86vh', maxWidth: 'min(90vw, 720px)', borderRadius: 12, background: '#000' }} />
            : <img key={url} src={url} alt="" onError={onError} style={{ maxHeight: '86vh', maxWidth: 'min(90vw, 900px)', borderRadius: 12 }} />}
        {media.length > 1 && (i < media.length - 1 ? arrow(1) : <span style={{ width: 40 }} />)}
      </div>
      <button onClick={onClose} style={{ position: 'fixed', top: 16, right: 16, ...btn('ghost') }}>Close</button>
      {media.length > 1 && <span style={{ position: 'fixed', bottom: 18, color: '#fff', fontSize: 13 }}>{i + 1} / {media.length}</span>}
    </div>
  , document.body)
}
