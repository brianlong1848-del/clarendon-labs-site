/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { STORE_APPS } from '@/lib/ads/store'

// ─── /get/<app> — the "Download" link in ads ────────────────────────────────
// A real page (so Meta accepts it as a website link) that sends people
// straight on to the App Store. iPhone/iPad visitors are forwarded at once;
// everyone else sees the app and a Download on the App Store button.

// Campaign tracking (FEAT-CLA-021): ads link to /get/<app>?ct=<campaign>, e.g.
// ?ct=tt-gag-traffic-oct26. The token is passed on to the App Store as Apple's
// campaign token, so App Store Connect → App Analytics → Sources → Campaigns
// shows page views, downloads and proceeds per ad. Apple only counts it when the
// team's provider token (pt) is present: set APP_STORE_PROVIDER_TOKEN in Vercel
// (App Store Connect → App Analytics → Campaigns → Generate Campaign Link shows it).

type Props = { params: Promise<{ app: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Apple campaign token: letters, digits, - _ . only, max 40 chars (Apple's limit). */
const cleanToken = (v: unknown) => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) : '')

function storeLink(store: string, ct: string) {
  if (!ct) return store
  const u = new URL(store)
  const pt = process.env.APP_STORE_PROVIDER_TOKEN
  if (pt) u.searchParams.set('pt', pt)
  u.searchParams.set('ct', ct)
  u.searchParams.set('mt', '8')
  return u.toString()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = STORE_APPS[(await params).app]
  if (!a) return {}
  return { title: `Get ${a.name} — Clarendon Labs`, description: `${a.name}: ${a.tagline} Free on the App Store.`, robots: { index: false } }
}

export default async function GetApp({ params, searchParams }: Props) {
  const id = (await params).app
  const a = STORE_APPS[id]
  if (!a) notFound()
  const q = await searchParams
  const store = storeLink(a.store, cleanToken(q.ct ?? q.utm_campaign))
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B0D11', color: '#EEF1F6', fontFamily: '-apple-system, Helvetica, Arial, sans-serif', padding: 24 }}>
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(store)})` }} />
      <div style={{ textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
        <img src={`/icons/${id}.png`} alt="" width={96} height={96} style={{ borderRadius: 22 }} />
        <h1 style={{ margin: 0, fontSize: 30 }}>{a.name}</h1>
        <p style={{ margin: 0, color: '#B7BDC9' }}>{a.tagline}</p>
        <a href={store} style={{ marginTop: 8, display: 'inline-block', lineHeight: 0 }}>
          <img src="/assets/app-store-badge.svg" alt="Download on the App Store" height={48} style={{ height: 48, width: 'auto' }} />
        </a>
        <p style={{ margin: 0, fontSize: 13, color: '#7E8595' }}>Opening the App Store…</p>
      </div>
    </main>
  )
}
