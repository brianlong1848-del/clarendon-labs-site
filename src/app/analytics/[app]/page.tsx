'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { GeoExplorer } from '@/components/GeoExplorer'

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

  useEffect(() => { setPw('session') }, [])

  const get = useCallback(async (path: string) => {
    const res = await fetch(path, { headers: {} })
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

      {pw && <GeoExplorer pw={pw} app={appId} accent={accent} title="World" />}
    </AdminShell>
  )
}
