'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { GeoMap } from '@/components/GeoMap'

// ─── /analytics/<app> — one app, mapped ──────────────────────────────────────
//
// "Where should I advertise next?" for a single app. World map coloured by
// downloads, money (App Store proceeds, incl. in-app purchases and
// subscriptions) or Instagram audience; click a country to drop into its
// states/provinces. Same data as the Studio app's App detail screen — both
// read /api/analytics and /api/analytics/geo.

type Metric = 'installs' | 'proceeds' | 'followers'
type CountryRow = { code: string; installs: number; proceeds: number; followers: number }
type GeoWorld = { countries: CountryRow[]; audienceStatus: string; reportDate: string | null; ads: { status: string; note: string } }
type Region = { code: string; name: string; followers: number; cities: { name: string; followers: number }[] }
type GeoCountry = {
  country: string; regionType: string
  appStore: { installs: number; proceeds: number; note: string }
  instagram: { status: string; followers: number; mappedFollowers: number }
  regions: Region[]; ads: { status: string; note: string }
}
type AppRow = {
  id: string; name: string; accent: string
  appStore: { last30: { installs: number; proceeds: number }; reportDate: string } | null
  instagram: { followers: number; posts: number; reach30d: number | null } | null
  facebook: { name: string; followers: number; posts30d: number | null } | null
  tiktok: { spend: number; impressions: number; clicks: number } | null
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const num = (n: number) => n.toLocaleString('en-US')
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
const countryName = (cc: string) => regionNames?.of(cc) ?? cc
const plural = (t: string) => (/y$/i.test(t) ? t.replace(/y$/i, 'ies') : t.endsWith('s') ? t : t + 's').toLowerCase()

const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: 'installs', label: 'Downloads', hint: 'First-time App Store installs, last 30 days' },
  { key: 'proceeds', label: 'Money', hint: 'App Store proceeds (USD) — purchases, in-app buys and subscriptions, last 30 days' },
  { key: 'followers', label: 'Audience', hint: 'Where the app’s Instagram followers live' },
]

export default function AppAnalyticsPage() {
  const { app: appId } = useParams<{ app: string }>()
  const [pw, setPw] = useState<string | null>(null)
  const [app, setApp] = useState<AppRow | null>(null)
  const [world, setWorld] = useState<GeoWorld | null>(null)
  const [metric, setMetric] = useState<Metric>('installs')
  const [country, setCountry] = useState<string | null>(null)
  const [detail, setDetail] = useState<GeoCountry | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setPw(sessionStorage.getItem('clarendon:console') ?? '') }, [])

  const get = useCallback(async (path: string) => {
    const res = await fetch(path, { headers: { 'x-console-password': pw ?? '' } })
    if (res.status === 401) throw new Error('signin')
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
    return res.json()
  }, [pw])

  useEffect(() => {
    if (!pw) return
    setError(null)
    get('/api/analytics').then((d) => setApp((d.apps ?? []).find((a: AppRow) => a.id === appId) ?? null)).catch((e) => setError(e.message))
    get(`/api/analytics/geo?app=${appId}`).then(setWorld).catch((e) => setError(e.message))
  }, [pw, appId, get])

  useEffect(() => {
    if (!pw || !country) { setDetail(null); return }
    setDetail(null)
    get(`/api/analytics/geo?app=${appId}&country=${country}`).then(setDetail).catch((e) => setError(e.message))
  }, [pw, appId, country, get])

  const rows = useMemo(() => (world?.countries ?? []).filter((c) => c[metric] > 0).sort((a, b) => b[metric] - a[metric]), [world, metric])
  const total = rows.reduce((n, c) => n + c[metric], 0)
  const fmt = metric === 'proceeds' ? money : num
  const accent = app?.accent ?? C.mint

  if (pw === '' || error === 'signin') {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', display: 'grid', placeItems: 'center', fontFamily: C.sans }}>
        <p style={{ color: C.soft }}>Signed out — <Link href="/analytics" style={{ color: C.mint }}>sign in on Analytics</Link>.</p>
      </main>
    )
  }

  const label: React.CSSProperties = { fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, padding: 22 }
  const big = (v: string, cap: string, sub?: string) => (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={label}>{cap}</div>
      <div style={{ fontFamily: C.serif, fontSize: 28, fontWeight: 900, marginTop: 8 }}>{v}</div>
      {sub && <div style={{ fontSize: 12, color: C.soft, marginTop: 4 }}>{sub}</div>}
    </div>
  )
  const empty = metric === 'followers'
    ? world?.audienceStatus === 'too_small'
      ? 'Instagram shares follower locations once an account passes 100 followers.'
      : world?.audienceStatus === 'not_connected' ? 'Instagram isn’t connected for this app yet.' : 'No audience location data yet.'
    : 'No App Store sales in the last 30 days yet.'

  return (
    <AdminShell
      title={app?.name ?? 'App'}
      subtitle="Where people download, pay and follow — click a country to see its states and provinces."
      actions={<Link href="/analytics" style={{ ...btn('ghost'), textDecoration: 'none' }}>← All apps</Link>}
    >
      {error && error !== 'signin' && <p style={{ color: C.red, fontSize: 14, margin: 0 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
        {big(app?.appStore ? num(app.appStore.last30.installs) : '—', 'Downloads · 30d')}
        {big(app?.appStore ? money(app.appStore.last30.proceeds) : '—', 'Money · 30d', 'Proceeds after Apple’s cut')}
        {big(app?.instagram ? num(app.instagram.followers) : '—', 'Instagram followers', app?.instagram?.reach30d != null ? `${num(app.instagram.reach30d)} reached · 30d` : undefined)}
        {big(app?.facebook ? num(app.facebook.followers) : '—', 'Facebook followers', app?.facebook?.posts30d != null ? `${app.facebook.posts30d} posts · 30d` : app?.facebook ? undefined : 'Page not linked yet')}
      </div>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: C.serif, fontSize: 20, fontWeight: 800 }}>
            <button onClick={() => setCountry(null)} style={{ all: 'unset', cursor: country ? 'pointer' : 'default', color: country ? C.soft : C.ink }}>World</button>
            {country && <><span style={{ color: C.faint }}>›</span><span>{countryName(country)}</span></>}
          </nav>
          <span style={{ flex: 1 }} />
          {!country && (
            <div role="tablist" style={{ display: 'flex', background: C.card2, borderRadius: 10, padding: 3 }}>
              {METRICS.map((m) => (
                <button key={m.key} role="tab" aria-selected={metric === m.key} title={m.hint} onClick={() => setMetric(m.key)}
                  style={{ border: 0, cursor: 'pointer', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: C.sans,
                           background: metric === m.key ? C.card : 'transparent', color: metric === m.key ? C.ink : C.soft,
                           boxShadow: metric === m.key ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{m.label}</button>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: C.soft, margin: '6px 0 16px' }}>
          {country
            ? `${detail ? plural(detail.regionType) : 'Regions'} shaded by Instagram followers. Apple only reports downloads and money per country.`
            : METRICS.find((m) => m.key === metric)!.hint + (world?.reportDate ? ` · through ${world.reportDate}` : '')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 22, alignItems: 'start' }} className="geo-grid">
          <GeoMap
            scope={country ?? 'world'}
            accent={accent}
            height={country ? 420 : 380}
            values={country
              ? (detail?.regions ?? []).map((r) => ({ code: r.code, value: r.followers }))
              : (world?.countries ?? []).map((c) => ({ code: c.code, value: c[metric] }))}
            format={country ? (n) => `${num(n)} followers` : fmt}
            selected={null}
            onSelect={country ? undefined : (code) => setCountry(code)}
          />

          <aside style={{ display: 'grid', gap: 10 }}>
            {!country ? (
              rows.length === 0 ? <p style={{ fontSize: 13.5, color: C.soft }}>{empty}</p> : rows.slice(0, 12).map((c, i) => (
                <button key={c.code} onClick={() => setCountry(c.code)}
                  style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', fontSize: 13.5 }}>
                    <span style={{ fontWeight: i === 0 ? 800 : 600 }}>{countryName(c.code)}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: C.serif, fontWeight: 800 }}>{fmt(c[metric])}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: C.card2 }}>
                    <div style={{ height: 6, borderRadius: 99, width: `${Math.max(3, (c[metric] / total) * 100)}%`, background: accent, opacity: i === 0 ? 1 : 0.55 }} />
                  </div>
                </button>
              ))
            ) : !detail ? <p style={{ fontSize: 13.5, color: C.soft }}>Loading {countryName(country)}…</p> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><div style={label}>Downloads</div><div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 900 }}>{num(detail.appStore.installs)}</div></div>
                  <div><div style={label}>Money</div><div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 900 }}>{money(detail.appStore.proceeds)}</div></div>
                  <div><div style={label}>IG followers</div><div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 900 }}>{num(detail.instagram.followers)}</div></div>
                  <div><div style={label}>Ad results</div><div style={{ fontSize: 13, color: C.soft, marginTop: 6 }}>No ads yet</div></div>
                </div>
                <div style={{ height: 1, background: C.rule, margin: '4px 0' }} />
                <div style={label}>By {detail.regionType.toLowerCase()}</div>
                {detail.regions.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.soft, lineHeight: 1.5 }}>
                    {detail.instagram.status === 'too_small'
                      ? `Instagram shares follower cities once the account passes 100 followers. ${detail.ads.note}`
                      : `No follower cities here yet. ${detail.ads.note}`}
                  </p>
                ) : detail.regions.slice(0, 12).map((r) => (
                  <div key={r.code} title={r.cities.map((c) => `${c.name} ${c.followers}`).join(' · ')} style={{ display: 'flex', fontSize: 13.5 }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span><span style={{ flex: 1 }} />
                    <span style={{ fontFamily: C.serif, fontWeight: 800 }}>{num(r.followers)}</span>
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
        <style>{`@media (max-width: 860px){ .geo-grid{ grid-template-columns: 1fr !important } }`}</style>
      </section>
    </AdminShell>
  )
}
