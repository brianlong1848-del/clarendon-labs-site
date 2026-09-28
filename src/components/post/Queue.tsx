'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react'
import { C, btn } from '@/components/AdminNav'
import { PLATFORMS, FORMAT_LABEL, type Format } from '@/lib/publish/rules'
import { PlatformGlyph, card, label, when, type PublishApp, type QueuedPost } from './shared'

// Everything scheduled, in flight, and recently sent — with the per-platform
// outcome, links to the live posts, and cancel / retry.

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  scheduled: { text: 'Scheduled', color: C.ink2, bg: C.card2 },
  publishing: { text: 'Publishing…', color: C.amber, bg: '#FBF0DD' },
  done: { text: 'Posted', color: C.mint, bg: C.mintTint },
  partial: { text: 'Partly posted', color: C.amber, bg: '#FBF0DD' },
  failed: { text: 'Failed', color: C.red, bg: '#FBE7E5' },
}

export function Queue({ pw, apps, refreshKey, onCount }: { pw: string; apps: PublishApp[]; refreshKey: number; onCount: (n: number) => void }) {
  const [posts, setPosts] = useState<QueuedPost[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/publish', { headers: { 'x-console-password': pw } })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setPosts(body.posts); onCount(body.posts.filter((p: QueuedPost) => p.status === 'scheduled').length); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [pw, onCount])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    if (!posts?.some((p) => p.status === 'publishing')) return
    const t = setInterval(() => { fetch('/api/publish/run', { method: 'POST' }).catch(() => {}); load() }, 10000)
    return () => clearInterval(t)
  }, [posts, load])

  const act = async (id: string, method: 'DELETE' | 'PATCH') => {
    setBusy(id)
    const res = await fetch(`/api/publish?id=${id}`, { method, headers: { 'x-console-password': pw } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); load()
  }

  if (error && !posts) return <p style={{ color: C.red }}>{error}</p>
  if (!posts) return <p style={{ color: C.soft }}>Loading the queue…</p>

  const scheduled = posts.filter((p) => p.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const rest = posts.filter((p) => p.status !== 'scheduled')

  const section = (title: string, list: QueuedPost[], empty: string) => (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>{title}</span><span style={{ flex: 1, height: 1, background: C.rule }} />
      </div>
      {list.length === 0 ? <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>{empty}</p> : list.map((p) => {
        const app = apps.find((a) => a.id === p.app_id)
        const s = STATUS[p.status] ?? STATUS.scheduled
        const first = p.media[0]
        return (
          <article key={p.id} style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '84px minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', background: C.card2, position: 'relative' }}>
              {first ? (first.kind === 'video'
                ? <video src={first.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <img src={first.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                : <div style={{ padding: 8, fontSize: 11, color: C.soft }}>Text only</div>}
              {p.media.length > 1 && <span style={{ position: 'absolute', right: 5, top: 5, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '1px 6px' }}>{p.media.length}</span>}
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {app && <img src={app.icon} alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                <b style={{ fontSize: 14 }}>{app?.name ?? p.app_id}</b>
                <span style={{ fontSize: 12.5, color: C.soft }}>{p.scheduled_at ? when(p.scheduled_at) : when(p.created_at)}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px' }}>{s.text}</span>
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
              {p.status === 'scheduled' && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => act(p.id, 'DELETE')}>Cancel</button>}
              {(p.status === 'failed' || p.status === 'partial') && <button style={btn('solid')} disabled={busy === p.id} onClick={() => act(p.id, 'PATCH')}>{busy === p.id ? 'Retrying…' : 'Retry failed'}</button>}
            </div>
          </article>
        )
      })}
    </section>
  )

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {section('Up next', scheduled, 'Nothing scheduled. Posts you schedule land here.')}
      {section('Recent', rest, 'Nothing posted from Studio yet.')}
    </div>
  )
}
