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

export function Preview({ platform, format, media, caption, handle, avatar, appName }: {
  platform: Platform; format: Format; media: PreviewMedia[]; caption: string; handle?: string; avatar: string; appName: string
}) {
  const [index, setIndex] = useState(0)
  const i = Math.min(index, Math.max(0, media.length - 1))
  const current = media[i]
  const name = handle ?? appName

  if (platform === 'instagram' && (format === 'story' || format === 'reel')) {
    return (
      <div style={{ width: 260, aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 22, overflow: 'hidden', position: 'relative', background: '#111', boxShadow: '0 12px 30px rgba(0,0,0,.18)' }}>
        {current ? <Media m={current} fit="cover" /> : <Empty dark />}
        {format === 'story' && <div style={{ position: 'absolute', top: 8, left: 10, right: 10, height: 2.5, borderRadius: 9, background: 'rgba(255,255,255,.45)' }}><div style={{ width: '35%', height: '100%', background: '#fff', borderRadius: 9 }} /></div>}
        <div style={{ position: 'absolute', top: format === 'story' ? 18 : 'auto', bottom: format === 'reel' ? 16 : 'auto', left: 12, right: 12, color: '#fff', display: 'grid', gap: 8, textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
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
      <div style={{ position: 'absolute', left: 12, right: 50, bottom: 16, color: '#fff', fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
        <b>@{name}</b><p style={{ margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{caption}</p>
      </div>
      <div style={{ position: 'absolute', right: 10, bottom: 70 }}><PlatformGlyph platform="tiktok" color="#fff" size={22} /></div>
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
