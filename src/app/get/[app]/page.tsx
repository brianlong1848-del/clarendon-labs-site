/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { STORE_APPS } from '@/lib/ads/store'

// ─── /get/<app> — the "Download" link in ads ────────────────────────────────
// A real page (so Meta accepts it as a website link) that sends people
// straight on to the App Store. iPhone/iPad visitors are forwarded at once;
// everyone else sees the app and a Download on the App Store button.

type Props = { params: Promise<{ app: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = STORE_APPS[(await params).app]
  if (!a) return {}
  return { title: `Get ${a.name} — Clarendon Labs`, description: `${a.name}: ${a.tagline} Free on the App Store.`, robots: { index: false } }
}

export default async function GetApp({ params }: Props) {
  const id = (await params).app
  const a = STORE_APPS[id]
  if (!a) notFound()
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B0D11', color: '#EEF1F6', fontFamily: '-apple-system, Helvetica, Arial, sans-serif', padding: 24 }}>
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(a.store)})` }} />
      <div style={{ textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
        <img src={`/icons/${id}.png`} alt="" width={96} height={96} style={{ borderRadius: 22 }} />
        <h1 style={{ margin: 0, fontSize: 30 }}>{a.name}</h1>
        <p style={{ margin: 0, color: '#B7BDC9' }}>{a.tagline}</p>
        <a href={a.store} style={{ marginTop: 8, display: 'inline-block', lineHeight: 0 }}>
          <img src="/assets/app-store-badge.svg" alt="Download on the App Store" height={48} style={{ height: 48, width: 'auto' }} />
        </a>
        <p style={{ margin: 0, fontSize: 13, color: '#7E8595' }}>Opening the App Store…</p>
      </div>
    </main>
  )
}
