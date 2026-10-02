'use client'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { Composer } from '@/components/post/Composer'
import { Queue } from '@/components/post/Queue'
import { PlatformGlyph, type PublishApp } from '@/components/post/shared'

// ─── /post — write once, publish everywhere ─────────────────────────────────
//
// Same studio password as /admin and /analytics (sessionStorage, same key).
// Compose on the left, queue on the second tab. The Studio iOS app has the
// same composer on its Grow tab; both talk to /api/publish.

export default function PostPage() {
  const [pw, setPw] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<PublishApp[] | null>(null)
  const [tab, setTab] = useState<'compose' | 'queue' | 'accounts'>('compose')
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [queued, setQueued] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setPw('session') }, [])
  // Back from the Threads sign-in: say how it went, then tidy the URL.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('threads')
    if (!t) return
    const m = t.match(/^connected:([^:]+):(.*)$/)
    setNotice(m ? { ok: true, text: `Threads connected${m[2] ? ` as @${m[2]}` : ''} for ${m[1]}.` } : { ok: false, text: t })
    if (m) setTab('accounts')
    window.history.replaceState(null, '', '/post')
  }, [])

  const load = useCallback(async (password: string) => {
    setError(null)
    const res = await fetch('/api/publish/accounts', { headers: {} }).catch(() => null)
    if (!res) { setError('Could not reach clarendon.dev.'); return }
    if (res.status === 401) { (window.location.href = '/login'); setPw(''); setError('Wrong password.'); return }
    setApps((await res.json()).apps ?? [])
  }, [])
  useEffect(() => { if (pw) load(pw) }, [pw, load])

  const onCount = useCallback((n: number) => setQueued(n), [])

  if (pw === null) return null
  if (!pw) {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans, color: C.ink }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
          <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '10px 0 22px' }}>Post</h1>
          <input type="password" placeholder="Password" value={entry} onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && entry) { sessionStorage.setItem('clarendon:console', entry); setPw(entry) } }}
            style={{ background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
          <button style={{ ...btn('mint'), width: '100%', marginTop: 12 }} disabled={!entry}
            onClick={() => { sessionStorage.setItem('clarendon:console', entry); setPw(entry) }}>Sign in</button>
          {error && <p style={{ color: C.soft, fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    )
  }

  const tabBtn = (id: 'compose' | 'queue' | 'accounts', text: string) => (
    <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{ border: 0, cursor: 'pointer', borderRadius: 9, padding: '8px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: C.sans,
               background: tab === id ? C.card : 'transparent', color: tab === id ? C.ink : C.soft, boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
      {text}
    </button>
  )

  return (
    <AdminShell
      title="Post"
      subtitle="Write it once. Publish to Instagram, Facebook, Threads and TikTok — now or on a schedule."
      actions={<div role="tablist" style={{ display: 'flex', background: C.card2, borderRadius: 11, padding: 3 }}>
        {tabBtn('compose', 'Compose')}{tabBtn('queue', queued ? `Queue · ${queued}` : 'Queue')}{tabBtn('accounts', 'Accounts')}
      </div>}
    >
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {notice && (
        <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                                    background: notice.ok ? C.mintTint : '#FBE7E5', color: notice.ok ? C.mint : C.red }}>
          <span style={{ flex: 1 }}>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ all: 'unset', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}
      {!apps ? <p style={{ color: C.soft }}>Checking which accounts are connected…</p> : (
        <>
          <div style={{ display: tab === 'compose' ? 'block' : 'none' }}>
            <Composer pw={pw} apps={apps} onPosted={() => setRefreshKey((k) => k + 1)} />
          </div>
          {tab === 'accounts' && <Accounts apps={apps} onRefresh={() => pw && load(pw)} />}
          <div style={{ display: tab === 'queue' ? 'block' : 'none' }}>
            <Queue pw={pw} apps={apps} refreshKey={refreshKey} onCount={onCount} />
          </div>
        </>
      )}
    </AdminShell>
  )
}

// Every app × every platform: what's connected, and the one thing to do
// about anything that isn't.
function Accounts({ apps, onRefresh }: { apps: PublishApp[]; onRefresh: () => void }) {
  const NAMES = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', tiktok: 'TikTok' } as const
  const ready = apps.reduce((n, a) => n + a.accounts.filter((x) => x.ready).length, 0)
  const total = apps.reduce((n, a) => n + a.accounts.length, 0)
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, color: C.ink2 }}><b>{ready}</b> of {total} accounts can post right now.</span>
        <span style={{ flex: 1 }} />
        <button style={btn('ghost')} onClick={onRefresh}>Check again</button>
      </div>
      {apps.map((a) => (
        <section key={a.id} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.icon} alt="" width={30} height={30} style={{ borderRadius: 8 }} />
            <b style={{ fontFamily: C.serif, fontSize: 18 }}>{a.name}</b>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {a.accounts.map((x) => (
              <div key={x.platform} style={{ borderRadius: 12, padding: 12, background: x.ready ? C.mintTint : C.paper, border: `1px solid ${x.ready ? C.mint : C.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlatformGlyph platform={x.platform} size={16} color={x.ready ? undefined : C.faint} />
                  <b style={{ fontSize: 13.5 }}>{NAMES[x.platform]}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: x.ready ? C.mint : C.soft }}>{x.ready ? 'Ready' : 'Not yet'}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 6, lineHeight: 1.45 }}>
                  {x.ready ? (x.handle ? (x.platform === 'facebook' ? x.handle : `@${x.handle}`) : 'Connected') : x.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
