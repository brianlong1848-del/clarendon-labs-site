'use client'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { Composer } from '@/components/post/Composer'
import { Queue } from '@/components/post/Queue'
import type { PublishApp } from '@/components/post/shared'

// ─── /post — write once, publish everywhere ─────────────────────────────────
//
// Same studio password as /admin and /analytics (sessionStorage, same key).
// Compose on the left, queue on the second tab. The Studio iOS app has the
// same composer on its Grow tab; both talk to /api/publish.

export default function PostPage() {
  const [pw, setPw] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<PublishApp[] | null>(null)
  const [tab, setTab] = useState<'compose' | 'queue'>('compose')
  const [queued, setQueued] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setPw(sessionStorage.getItem('clarendon:console') ?? '') }, [])

  const load = useCallback(async (password: string) => {
    setError(null)
    const res = await fetch('/api/publish/accounts', { headers: { 'x-console-password': password } }).catch(() => null)
    if (!res) { setError('Could not reach clarendon.dev.'); return }
    if (res.status === 401) { sessionStorage.removeItem('clarendon:console'); setPw(''); setError('Wrong password.'); return }
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

  const tabBtn = (id: 'compose' | 'queue', text: string) => (
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
        {tabBtn('compose', 'Compose')}{tabBtn('queue', queued ? `Queue · ${queued}` : 'Queue')}
      </div>}
    >
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {!apps ? <p style={{ color: C.soft }}>Checking which accounts are connected…</p> : (
        <>
          <div style={{ display: tab === 'compose' ? 'block' : 'none' }}>
            <Composer pw={pw} apps={apps} onPosted={() => setRefreshKey((k) => k + 1)} />
          </div>
          <div style={{ display: tab === 'queue' ? 'block' : 'none' }}>
            <Queue pw={pw} apps={apps} refreshKey={refreshKey} onCount={onCount} />
          </div>
        </>
      )}
    </AdminShell>
  )
}
