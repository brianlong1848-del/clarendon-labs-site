'use client'
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react'
import { C } from '@/components/AdminNav'
import type { Format, Platform } from '@/lib/publish/rules'
import { PlatformGlyph } from './shared'

// Live previews — close enough to each platform's real layout that crops,
// caption truncation and "which item leads the carousel" are obvious before
// anything is sent. Not pixel copies of their apps.

export type PreviewMedia = { src: string; kind: 'image' | 'video'; width: number; height: number }

const Media = ({ m, fit, style }: { m: PreviewMedia; fit: 'cover' | 'contain'; style?: React.CSSProperties }) =>
  m.kind === 'video'
    ? <video src={m.src} muted loop autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', background: '#000', ...style }} />
    : <img src={m.src} alt="" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...style }} />

function Avatar({ src, size = 30 }: { src: string; size?: number }) {
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 99, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.rule}` }} />
}

function Caption({ handle, text, clamp = 2 }: { handle?: string; text: string; clamp?: number }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const long = text.split('\n').length > clamp || text.length > 120
  return (
    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                ...(open || !long ? {} : { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
      {handle && <b>{handle} </b>}{text.split(/(\s+)/).map((w, i) => /^[#@]\w/.test(w) ? <span key={i} style={{ color: '#285FAB' }}>{w}</span> : w)}
      {long && !open && <button onClick={() => setOpen(true)} style={{ all: 'unset', color: C.soft, cursor: 'pointer', marginLeft: 4 }}>… more</button>}
    </p>
  )
}

type PreviewProps = { platform: Platform; format: Format; media: PreviewMedia[]; caption: string; handle?: string; avatar: string; appName: string }

// Approximate keep-clear margins (% of the frame) for full-screen vertical placements.
// Based on Meta's published Reels/Stories guidance and TikTok's ad safe-zone template;
// apps change their UI, so treat as a guide and confirm in the real app.
const ZONES: Record<string, { top: number; bottom: number; left: number; right: number; note: string }> = {
  'instagram:reel': { top: 14, bottom: 35, left: 6, right: 14, note: 'Instagram Reel' },
  'facebook:reel': { top: 14, bottom: 35, left: 6, right: 14, note: 'Facebook Reel' },
  'instagram:story': { top: 14, bottom: 20, left: 6, right: 6, note: 'Instagram Story' },
  'tiktok:video': { top: 7, bottom: 25, left: 5, right: 12, note: 'TikTok' },
}
const zoneKey = (platform: string, format: string) => (platform === 'tiktok' ? 'tiktok:video' : `${platform}:${format}`)

function SafeZones({ platform, format }: { platform: string; format: string }) {
  const z = ZONES[zoneKey(platform, format)]
  if (!z) return null
  const shade = 'repeating-linear-gradient(45deg, rgba(220,38,38,.38) 0 5px, rgba(220,38,38,.18) 5px 10px)'
  const dot = (size: number) => <span style={{ width: size, height: size, borderRadius: 99, background: 'rgba(255,255,255,.9)', display: 'block' }} />
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontSize: 9, fontWeight: 700, color: '#fff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${z.top}%`, background: shade }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${z.bottom}%`, background: shade }} />
      <div style={{ position: 'absolute', top: `${z.top}%`, bottom: `${z.bottom}%`, left: 0, width: `${z.left}%`, background: shade }} />
      <div style={{ position: 'absolute', top: `${z.top}%`, bottom: `${z.bottom}%`, right: 0, width: `${z.right}%`, background: shade }} />
      <div style={{ position: 'absolute', top: `${z.top}%`, bottom: `${z.bottom}%`, left: `${z.left}%`, right: `${z.right}%`, border: '1.5px dashed rgba(78,205,196,.95)' }} />
      {/* Stand-ins for the app's own UI */}
      <div style={{ position: 'absolute', top: '3%', left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>
        <span>{z.note} · top bar</span>{dot(14)}
      </div>
      <div style={{ position: 'absolute', right: 8, bottom: `${z.bottom + 2}%`, display: platform === 'instagram' && format === 'story' ? 'none' : 'grid', gap: 10, justifyItems: 'center' }}>
        {[22, 22, 22, 22].map((n, k) => <span key={k}>{dot(n)}</span>)}
      </div>
      <div style={{ position: 'absolute', left: 10, right: platform === 'tiktok' ? 54 : 50, bottom: '3%', display: 'grid', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>
        <span style={{ height: 6, background: 'rgba(255,255,255,.85)', borderRadius: 9, width: '60%' }} />
        <span style={{ height: 6, background: 'rgba(255,255,255,.7)', borderRadius: 9, width: '90%' }} />
        <span>{platform === 'instagram' && format === 'story' ? 'reply bar / stickers' : 'username · caption · audio · CTA'}</span>
      </div>
    </div>
  )
}

// Instagram's profile grid shows a centered 3:4 crop of every feed post.
function GridCrop({ ratio }: { ratio: number }) {
  const keep = Math.min(1, 0.75 / ratio) * 100 // % of width kept
  const side = (100 - keep) / 2
  const shade = 'repeating-linear-gradient(45deg, rgba(220,38,38,.38) 0 5px, rgba(220,38,38,.18) 5px 10px)'
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {side > 0 && <>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${side}%`, background: shade }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${side}%`, background: shade }} />
      </>}
      {ratio < 0.75 && <>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${(1 - ratio / 0.75) * 50}%`, background: shade }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(1 - ratio / 0.75) * 50}%`, background: shade }} />
      </>}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${side}%`, right: `${side}%`, border: '1.5px dashed rgba(78,205,196,.95)' }} />
    </div>
  )
}

export function Preview(props: PreviewProps) {
  const [zones, setZones] = useState(false)
  const isGrid = props.platform === 'instagram' && props.format === 'feed'
  const canZone = isGrid || !!ZONES[zoneKey(props.platform, props.format)]
  return (
    <div>
      <PreviewInner {...props} zones={zones && canZone} />
      {canZone && (
        <div style={{ marginTop: 14, display: 'grid', gap: 6, justifyItems: 'center' }}>
          <button onClick={() => setZones((v) => !v)} aria-pressed={zones}
            style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${zones ? C.ink : C.rule}`, background: zones ? C.ink : C.card2, color: zones ? C.card : C.ink }}>
            {zones ? (isGrid ? 'Hide grid crop' : 'Hide safe zones') : (isGrid ? 'Show profile-grid crop' : 'Show safe zones')}
          </button>
          {zones && isGrid && <p style={{ margin: 0, fontSize: 11.5, color: C.soft, textAlign: 'center', maxWidth: 270, lineHeight: 1.4 }}>Instagram&apos;s profile grid shows a centered 3:4 crop. Keep key content inside the dashed box; red areas are cut off in the grid.</p>}
          {zones && !isGrid && <p style={{ margin: 0, fontSize: 11.5, color: C.soft, textAlign: 'center', maxWidth: 270, lineHeight: 1.4 }}>Keep faces, text, app screens and CTAs inside the dashed box. Red areas are covered by the app&apos;s UI. Approximate — confirm in the real app.</p>}
        </div>
      )}
    </div>
  )
}

function PreviewInner({ platform, format, media, caption, handle, avatar, appName, zones }: PreviewProps & { zones: boolean }) {
  const [index, setIndex] = useState(0)
  const i = Math.min(index, Math.max(0, media.length - 1))
  const current = media[i]
  const name = handle ?? appName

  if (platform === 'instagram' && (format === 'story' || format === 'reel')) {
    return (
      <div style={{ width: 260, aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 22, overflow: 'hidden', position: 'relative', background: '#111', boxShadow: '0 12px 30px rgba(0,0,0,.18)' }}>
        {current ? <Media m={current} fit="cover" /> : <Empty dark />}
        {zones && <SafeZones platform={platform} format={format} />}
        {format === 'story' && <div style={{ position: 'absolute', top: 8, left: 10, right: 10, height: 2.5, borderRadius: 9, background: 'rgba(255,255,255,.45)' }}><div style={{ width: '35%', height: '100%', background: '#fff', borderRadius: 9 }} /></div>}
        <div style={{ position: 'absolute', top: format === 'story' ? 18 : 'auto', bottom: format === 'reel' ? 16 : 'auto', left: 12, right: 12, color: '#fff', display: zones ? 'none' : 'grid', gap: 8, textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
            <Avatar src={avatar} size={26} />{name}{format === 'story' && <span style={{ fontWeight: 400, opacity: .8 }}>now</span>}
          </div>
          {format === 'reel' && caption && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{caption}</p>}
        </div>
      </div>
    )
  }

  if (platform === 'instagram') {
    const r = media[0] ? Math.min(1.91, Math.max(0.8, media[0].width / media[0].height)) : 1
    return (
      <Phone>
        <Row avatar={avatar} name={name} />
        <div style={{ position: 'relative', aspectRatio: String(r), background: C.card2 }}>
          {current ? <Media m={current} fit="cover" /> : <Empty />}
          {zones && <GridCrop ratio={r} />}
          {media.length > 1 && <Carousel n={media.length} i={i} setIndex={setIndex} />}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '10px 12px 6px' }}>
          {['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', 'M21 12a8 8 0 0 1-11.6 7.2L4 20l1-4.4A8 8 0 1 1 21 12z', 'M22 3 11 14M22 3l-7 19-4-8-8-4z'].map((d) => (
            <svg key={d} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8" strokeLinejoin="round"><path d={d} /></svg>
          ))}
        </div>
        <div style={{ padding: '0 12px 14px' }}><Caption handle={name} text={caption} /></div>
      </Phone>
    )
  }

  if (platform === 'threads') {
    return (
      <Phone>
        <div style={{ display: 'flex', gap: 10, padding: 14 }}>
          <Avatar src={avatar} size={34} />
          <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{name} <span style={{ color: C.soft, fontWeight: 400 }}>now</span></div>
            <Caption text={caption} clamp={8} />
            {media.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {media.map((m, k) => <div key={k} style={{ height: 180, aspectRatio: String(m.width / m.height), borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><Media m={m} fit="cover" /></div>)}
              </div>
            )}
          </div>
        </div>
      </Phone>
    )
  }

  if (platform === 'facebook' && format === 'reel') {
    return (
      <div style={{ width: 260, aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 22, overflow: 'hidden', position: 'relative', background: '#111', boxShadow: '0 12px 30px rgba(0,0,0,.18)' }}>
        {current ? <Media m={current} fit="cover" /> : <Empty dark />}
        {zones && <SafeZones platform="facebook" format="reel" />}
        <div style={{ display: zones ? 'none' : undefined, position: 'absolute', bottom: 16, left: 12, right: 12, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}><Avatar src={avatar} size={26} />{name}</div>
          {caption && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{caption}</p>}
        </div>
      </div>
    )
  }

  if (platform === 'facebook') {
    return (
      <Phone>
        <Row avatar={avatar} name={name} sub="Just now · Public" />
        <div style={{ padding: '0 12px 10px' }}><Caption text={caption} clamp={4} /></div>
        {media.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: media.length > 1 ? '1fr 1fr' : '1fr', gap: 2 }}>
            {media.slice(0, 4).map((m, k) => (
              <div key={k} style={{ position: 'relative', aspectRatio: media.length > 1 ? '1' : String(Math.max(0.8, m.width / m.height)) }}>
                <Media m={m} fit="cover" />
                {k === 3 && media.length > 4 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800 }}>+{media.length - 4}</div>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '9px 0', borderTop: `1px solid ${C.rule}`, fontSize: 12.5, color: C.soft, fontWeight: 600 }}>
          <span>Like</span><span>Comment</span><span>Share</span>
        </div>
      </Phone>
    )
  }

  return (
    <div style={{ width: 260, aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 22, overflow: 'hidden', position: 'relative', background: '#111' }}>
      {current ? <Media m={current} fit="cover" /> : <Empty dark />}
      {zones && <SafeZones platform="tiktok" format="video" />}
      <div style={{ display: zones ? 'none' : undefined, position: 'absolute', left: 12, right: 50, bottom: 16, color: '#fff', fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
        <b>@{name}</b><p style={{ margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{caption}</p>
      </div>
      <div style={{ display: zones ? 'none' : undefined, position: 'absolute', right: 10, bottom: 70 }}><PlatformGlyph platform="tiktok" color="#fff" size={22} /></div>
    </div>
  )
}

const Phone = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 300, margin: '0 auto', background: C.card, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.rule}`, boxShadow: '0 12px 30px rgba(20,20,19,.10)' }}>{children}</div>
)
const Row = ({ avatar, name, sub }: { avatar: string; name: string; sub?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px' }}>
    <Avatar src={avatar} />
    <div><div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>{sub && <div style={{ fontSize: 11.5, color: C.soft }}>{sub}</div>}</div>
  </div>
)
const Empty = ({ dark }: { dark?: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: dark ? 'rgba(255,255,255,.5)' : C.faint, fontSize: 12.5 }}>Your photo or video</div>
)
function Carousel({ n, i, setIndex }: { n: number; i: number; setIndex: (k: number) => void }) {
  const arrow = (dir: -1 | 1) => (
    <button aria-label={dir < 0 ? 'Previous' : 'Next'} onClick={() => setIndex(Math.min(n - 1, Math.max(0, i + dir)))}
      style={{ position: 'absolute', top: '50%', [dir < 0 ? 'left' : 'right']: 8, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 99, border: 0,
               background: 'rgba(255,255,255,.85)', cursor: 'pointer', fontWeight: 900, opacity: (dir < 0 ? i === 0 : i === n - 1) ? 0 : 1 }}>{dir < 0 ? '‹' : '›'}</button>
  )
  return (
    <>
      {arrow(-1)}{arrow(1)}
      <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '2px 8px' }}>{i + 1}/{n}</div>
      <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {Array.from({ length: n }, (_, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 9, background: k === i ? '#3897F0' : C.faint }} />)}
      </div>
    </>
  )
}
