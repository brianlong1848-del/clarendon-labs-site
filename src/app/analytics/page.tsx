'use client'
import { useCallback, useEffect, useState } from 'react'

// ─── /analytics — per-app data ───────────────────────────────────────────────
//
// Downloads + revenue (App Store Connect), followers + reach (Instagram Graph
// API), and ad spend/reach (TikTok Business API), one card per app. Same
// login as /admin — the studio password, in sessionStorage under the same
// key, so being signed into one signs you into both.
//
// Holds no third-party credentials itself: it sends the password to
// /api/analytics, which reads them server-side. See src/lib/analytics/ for
// what each data source needs — a source with nothing configured just shows
// "Not connected yet" instead of breaking the page.

type AppStoreMetrics = { downloads: number; proceeds: number; reportDate: string } | null
type InstagramMetrics = { followers: number; posts: number; reach30d: number | null } | null
type TikTokMetrics = { spend: number; impressions: number; clicks: number } | null
type AppRow = {
  id: string; name: string; accent: string
  appStore: AppStoreMetrics; instagram: InstagramMetrics; tiktok: TikTokMetrics
}

const C = {
  paper: '#0B0D11', card: '#12151D', card2: '#161A24',
  ink: '#EEF1F6', ink2: '#B7BDC9', soft: '#7E8595',
  rule: 'rgba(255,255,255,.08)', rule2: 'rgba(255,255,255,.14)',
  mint: '#53E6B4', amber: '#FBBF24', red: '#F0509A',
  mono: "'IBM Plex Mono','SF Mono',Menlo,monospace",
  sans: "'Archivo',-apple-system,'Helvetica Neue',Arial,sans-serif",
  serif: "'Besley',Georgia,serif",
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const num = (n: number) => n.toLocaleString('en-US')

export default function AnalyticsPage() {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem('clarendon:console')
    if (saved) { setPw(saved); setAuthed(true) }
  }, [])

  const load = useCallback(async (password: string) => {
    setLoading(true); setError(null)
    let res: Response
    try {
      res = await fetch('/api/analytics', { headers: { 'x-console-password': password } })
    } catch {
      setLoading(false); setError('Could not reach the analytics API.'); return
    }
    setLoading(false)
    if (res.status === 401) {
      setError('Wrong password.'); setAuthed(false)
      sessionStorage.removeItem('clarendon:console'); return
    }
    const data = await res.json()
    setApps(data.apps ?? [])
  }, [])

  useEffect(() => { if (authed && pw) load(pw) }, [authed, pw, load])

  const signIn = () => {
    sessionStorage.setItem('clarendon:console', entry)
    setPw(entry); setAuthed(true)
  }

  const input: React.CSSProperties = {
    background: 'rgba(255,255,255,.04)', border: `1px solid ${C.rule2}`,
    borderRadius: 10, padding: '12px 14px', color: C.ink,
    fontFamily: C.sans, fontSize: 15, width: '100%',
  }
  const btn = (kind: 'solid' | 'ghost' | 'mint'): React.CSSProperties => ({
    fontFamily: C.sans, fontWeight: 600, fontSize: 14, padding: '10px 18px',
    borderRadius: 10, cursor: 'pointer', lineHeight: 1.2,
    border: `1px solid ${kind === 'ghost' ? C.rule2 : 'transparent'}`,
    background: kind === 'mint' ? C.mint : kind === 'solid' ? C.ink : 'rgba(255,255,255,.03)',
    color: kind === 'ghost' ? C.ink : '#06251B',
  })
  const label: React.CSSProperties = {
    fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.14em',
    textTransform: 'uppercase', color: C.soft,
  }
  const stat = (value: string, caption: string) => (
    <div>
      <div style={{ fontFamily: C.serif, fontWeight: 900, fontSize: 26, letterSpacing: '-.01em' }}>
        {value}
      </div>
      <div style={{ ...label, marginTop: 4 }}>{caption}</div>
    </div>
  )
  const notConnected = (what: string) => (
    <p style={{ fontSize: 13.5, color: C.soft }}>Not connected yet — needs {what}.</p>
  )

  if (!authed) {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink,
                     display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em',
                      textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
          <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '10px 0 22px' }}>
            Analytics
          </h1>
          <input style={input} type="password" placeholder="Password" value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && entry) signIn() }} />
          <button style={{ ...btn('mint'), width: '100%', marginTop: 12 }}
            disabled={!entry} onClick={signIn}>Sign in</button>
          {error && <p style={{ color: C.soft, fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink,
                   fontFamily: C.sans, padding: '32px 20px 80px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: C.serif, fontSize: 34, fontWeight: 900 }}>Analytics</h1>
          <span style={{ ...label }}>
            {loading ? 'refreshing…' : `${apps.length} app${apps.length === 1 ? '' : 's'}`}
          </span>
          <button style={{ ...btn('ghost'), marginLeft: 'auto' }} onClick={() => load(pw)}>
            Refresh
          </button>
          <button style={btn('ghost')} onClick={() => {
            sessionStorage.removeItem('clarendon:console'); setAuthed(false); setPw('')
          }}>Sign out</button>
        </div>

        {error && <p style={{ color: C.soft, fontSize: 14, marginTop: 16 }}>{error}</p>}

        <div style={{ display: 'grid', gap: 20, marginTop: 28 }}>
          {apps.map((app) => (
            <section key={app.id} style={{ background: C.card, border: `1px solid ${C.rule}`,
                                            borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: app.accent,
                               boxShadow: `0 0 8px ${app.accent}` }} />
                <h2 style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 800 }}>{app.name}</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                            gap: 20, marginTop: 20 }}>
                <div style={{ background: C.card2, border: `1px solid ${C.rule}`,
                             borderRadius: 12, padding: 16 }}>
                  <div style={label}>App Store</div>
                  {app.appStore ? (
                    <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                      {stat(num(app.appStore.downloads), 'downloads')}
                      {stat(money(app.appStore.proceeds), 'proceeds')}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>{notConnected('an App Store Connect API key')}</div>
                  )}
                  {app.appStore && (
                    <p style={{ fontSize: 11.5, color: C.soft, marginTop: 10 }}>
                      Day of {app.appStore.reportDate}
                    </p>
                  )}
                </div>

                <div style={{ background: C.card2, border: `1px solid ${C.rule}`,
                             borderRadius: 12, padding: 16 }}>
                  <div style={label}>Instagram</div>
                  {app.instagram ? (
                    <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
                      {stat(num(app.instagram.followers), 'followers')}
                      {stat(num(app.instagram.posts), 'posts')}
                      {app.instagram.reach30d != null && stat(num(app.instagram.reach30d), '30d reach')}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>{notConnected('a Meta access token + account id')}</div>
                  )}
                </div>

                <div style={{ background: C.card2, border: `1px solid ${C.rule}`,
                             borderRadius: 12, padding: 16 }}>
                  <div style={label}>TikTok</div>
                  {app.tiktok ? (
                    <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
                      {stat(money(app.tiktok.spend), '30d spend')}
                      {stat(num(app.tiktok.impressions), 'impressions')}
                      {stat(num(app.tiktok.clicks), 'clicks')}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>{notConnected('a TikTok ad account + access token')}</div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
