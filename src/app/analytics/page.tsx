'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { GeoExplorer } from '@/components/GeoExplorer'
import { GeoMap } from '@/components/GeoMap'

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

type StoreTally = { installs: number; redownloads: number; updates: number; proceeds: number }
type AppStoreMetrics = {
  reportDate: string
  day: StoreTally
  last30: StoreTally & { days: number }
  otherCurrencies: string[]
  series: { date: string; installs: number; proceeds: number }[]
  countries?: { code: string; installs: number; proceeds: number }[]
  history?: {
    ytd: { installs: number; proceeds: number; from: string; to: string }
    prevYtd: { installs: number; proceeds: number; from: string; to: string }
    months: { month: string; installs: number; proceeds: number }[]
    allTime: { installs: number; proceeds: number }
  }
} | null

type Range = '30d' | 'ytd' | 'yoy'
const RANGE_LABEL: Record<Range, string> = { '30d': '30 days', ytd: 'Year to date', yoy: 'Year over year' }
/** Installs + proceeds for the chosen range; `prev` is last year's same stretch (YoY only). */
function pick(s: AppStoreMetrics, r: Range): { installs: number; proceeds: number; prev?: { installs: number; proceeds: number } } | null {
  if (!s) return null
  if (r === '30d' || !s.history) return { installs: s.last30.installs, proceeds: s.last30.proceeds }
  return r === 'ytd' ? s.history.ytd : { ...s.history.ytd, prev: s.history.prevYtd }
}
const change = (now: number, before: number) =>
  before > 0 ? `${now >= before ? '+' : '−'}${Math.round(Math.abs(now - before) / before * 100)}% vs last year` : now > 0 ? 'new this year' : 'no sales either year'
type InstagramMetrics = { followers: number; posts: number; reach30d: number | null } | null
type FacebookMetrics = { name: string; followers: number; posts30d: number | null } | null
type TikTokMetrics = { spend: number; impressions: number; clicks: number } | null
type AppRow = {
  id: string; name: string; accent: string
  appStore: AppStoreMetrics; instagram: InstagramMetrics; facebook?: FacebookMetrics; tiktok: TikTokMetrics
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const num = (n: number) => n.toLocaleString('en-US')

export default function AnalyticsPage() {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<Range>('30d')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = 'session'
    if (saved) { setPw(saved); setAuthed(true) }
  }, [])

  const load = useCallback(async (password: string) => {
    setLoading(true); setError(null)
    let res: Response
    try {
      res = await fetch('/api/analytics', { headers: {} })
    } catch {
      setLoading(false); setError('Could not reach the analytics API.'); return
    }
    setLoading(false)
    if (res.status === 401) {
      window.location.href = '/login'; return
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
    background: C.card2, border: `1px solid ${C.rule2}`,
    borderRadius: 10, padding: '12px 14px', color: C.ink,
    fontFamily: C.sans, fontSize: 15, width: '100%',
  }
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

  // Totals across every app — the first thing an owner looks for, ahead of
  // any single app's breakdown. Only sums the sources that are actually
  // connected, so a source nobody's wired up yet doesn't read as zero.
  const totals = apps.reduce(
    (acc, a) => ({
      proceeds: acc.proceeds + (pick(a.appStore, range)?.proceeds ?? 0),
      installs: acc.installs + (pick(a.appStore, range)?.installs ?? 0),
      prevProceeds: acc.prevProceeds + (pick(a.appStore, range)?.prev?.proceeds ?? 0),
      prevInstalls: acc.prevInstalls + (pick(a.appStore, range)?.prev?.installs ?? 0),
      spend: acc.spend + (a.tiktok?.spend ?? 0),
      impressions: acc.impressions + (a.tiktok?.impressions ?? 0),
    }),
    { proceeds: 0, installs: 0, prevProceeds: 0, prevInstalls: 0, spend: 0, impressions: 0 },
  )
  const anyAppStore = apps.some((a) => a.appStore)
  const anyTikTok = apps.some((a) => a.tiktok)

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
    <AdminShell
      title="Analytics"
      subtitle="Revenue and growth across every Clarendon Labs app, in one place."
      actions={<>
        <span style={{ ...label }}>
          {loading ? 'refreshing…' : `${apps.length} app${apps.length === 1 ? '' : 's'}`}
        </span>
        <button style={btn('ghost')} onClick={() => load(pw)}>Refresh</button>
        <button style={btn('ghost')} onClick={() => {
          fetch('/auth/signout', { method: 'POST' }).finally(() => { window.location.href = '/login' })
        }}>Sign out</button>
      </>}
    >
        {error && <p style={{ color: C.soft, fontSize: 14, margin: 0 }}>{error}</p>}

        {/* Totals first — the number a business owner checks before any single
            app's breakdown. Shown only once at least one source is connected. */}
        {anyAppStore && (
          <div role="radiogroup" aria-label="Time range" style={{ display: 'inline-flex', justifySelf: 'start', background: C.card2, borderRadius: 10, padding: 3 }}>
            {(['30d', 'ytd', 'yoy'] as Range[]).map((r) => (
              <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)}
                style={{ border: 0, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: C.sans, cursor: 'pointer',
                         background: range === r ? C.card : 'transparent', color: range === r ? C.ink : C.soft, boxShadow: range === r ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
        {(anyAppStore || anyTikTok) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
            {anyAppStore && (
              <>
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 22px' }}>
                  <div style={label}>Revenue · {RANGE_LABEL[range === 'yoy' ? 'ytd' : range].toLowerCase()}</div>
                  <div style={{ fontFamily: C.serif, fontSize: 29, fontWeight: 900, marginTop: 8 }}>{money(totals.proceeds)}</div>
                  {range === 'yoy' && <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 4 }}>{money(totals.prevProceeds)} same time last year · {change(totals.proceeds, totals.prevProceeds)}</div>}
                  {/* Which app it came from — so a studio total never needs guessing. */}
                  <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
                    {apps.filter((a) => (pick(a.appStore, range)?.proceeds ?? 0) > 0).sort((a, b) => (pick(b.appStore, range)!.proceeds) - (pick(a.appStore, range)!.proceeds)).map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/icons/${a.id}.png`} alt="" width={16} height={16} style={{ borderRadius: 4 }} />
                        <span style={{ flex: 1 }}>{a.name}</span>
                        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(pick(a.appStore, range)!.proceeds)}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 22px' }}>
                  <div style={label}>New installs · {RANGE_LABEL[range === 'yoy' ? 'ytd' : range].toLowerCase()}</div>
                  <div style={{ fontFamily: C.serif, fontSize: 29, fontWeight: 900, marginTop: 8 }}>{num(totals.installs)}</div>
                  {range === 'yoy' && <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 4 }}>{num(totals.prevInstalls)} same time last year · {change(totals.installs, totals.prevInstalls)}</div>}
                </div>
              </>
            )}
            {anyTikTok && (
              <>
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 22px' }}>
                  <div style={label}>Total ad spend</div>
                  <div style={{ fontFamily: C.serif, fontSize: 29, fontWeight: 900, marginTop: 8 }}>{money(totals.spend)}</div>
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 22px' }}>
                  <div style={label}>Total impressions</div>
                  <div style={{ fontFamily: C.serif, fontSize: 29, fontWeight: 900, marginTop: 8 }}>{num(totals.impressions)}</div>
                </div>
              </>
            )}
          </div>
        )}

        {anyAppStore && <GeoExplorer pw={pw} app="all" title="All apps · world" />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11.5, letterSpacing: '.18em', textTransform: 'uppercase', color: C.soft }}>By app</span>
          <span style={{ flex: 1, height: 1, background: C.rule }} />
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {apps.map((app) => (
            <section key={app.id} style={{ background: C.card, border: `1px solid ${C.rule}`,
                                            borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/icons/${app.id}.png`} alt="" width={44} height={44}
                     style={{ borderRadius: 11, boxShadow: '0 4px 12px rgba(20,20,19,.14)', flexShrink: 0 }} />
                <h2 style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 800 }}>{app.name}</h2>
                <span style={{ flex: 1 }} />
                <Link href={`/analytics/${app.id}`} style={{ ...btn('ghost'), textDecoration: 'none', fontSize: 13 }}>Map & details →</Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                            gap: 20, marginTop: 20 }}>
                <div style={{ background: C.card2, border: `1px solid ${C.rule}`,
                             borderRadius: 12, padding: 16 }}>
                  <div style={label}>App Store</div>
                  {app.appStore ? (
                    <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                      {(() => { const v = pick(app.appStore, range)!; const tag = range === '30d' ? '30d' : 'ytd'; return <>
                        {stat(num(v.installs), `installs · ${tag}`)}
                        {stat(money(v.proceeds), `proceeds · ${tag}`)}
                        {v.prev && stat(change(v.proceeds, v.prev.proceeds), `vs ${Number(app.appStore.history!.prevYtd.from.slice(0, 4))}`)}
                      </> })()}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>{notConnected('an App Store Connect API key')}</div>
                  )}
                  {app.appStore && (
                    <p style={{ fontSize: 11.5, color: C.soft, marginTop: 10, lineHeight: 1.5 }}>
                      {app.appStore.reportDate}: {num(app.appStore.day.installs)} new ·{' '}
                      {num(app.appStore.day.redownloads)} re-downloads · {num(app.appStore.day.updates)} updates
                      {(() => {
                        const cs = app.appStore.countries ?? []
                        const total = cs.reduce((n, c) => n + c.installs, 0)
                        if (!total) return null
                        const regions = typeof Intl.DisplayNames === 'function'
                          ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
                        return <><br />Top countries (30d): {cs.slice(0, 3).map((c) =>
                          `${regions?.of(c.code) ?? c.code} ${Math.round((c.installs / total) * 100)}%`).join(' · ')}</>
                      })()}
                      {app.appStore.otherCurrencies.length > 0 &&
                        <><br />USD only — also sold in {app.appStore.otherCurrencies.join(', ')}</>}
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
                  <div style={label}>Facebook</div>
                  {app.facebook ? (
                    <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
                      {stat(num(app.facebook.followers), 'followers')}
                      {app.facebook.posts30d != null && stat(num(app.facebook.posts30d), 'posts · 30d')}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>{notConnected('its Instagram linked to a Facebook Page')}</div>
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

              {(app.appStore?.countries?.length ?? 0) > 0 && (
                <Link href={`/analytics/${app.id}`} aria-label={`${app.name} map`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 18, alignItems: 'center', marginTop: 20, textDecoration: 'none', color: C.ink }}>
                  <GeoMap scope="world" height={170} accent={app.accent}
                    values={(app.appStore?.countries ?? []).map((c) => ({ code: c.code, value: c.installs }))} />
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft }}>Installs by country · 30d</div>
                    {(app.appStore?.countries ?? []).slice(0, 4).map((c) => (
                      <div key={c.code} style={{ display: 'flex', fontSize: 13 }}>
                        <span>{typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }).of(c.code) : c.code}</span>
                        <span style={{ flex: 1 }} /><b>{num(c.installs)}</b>
                      </div>
                    ))}
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.mint }}>Open map, money & states →</span>
                  </div>
                </Link>
              )}
            </section>
          ))}
        </div>
    </AdminShell>
  )
}
