import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { analyticsRegistry, withInstagram } from '@/lib/analytics/registry'
import { fetchTikTok } from '@/lib/analytics/tiktok'
import { fetchInstagram } from '@/lib/analytics/instagram'
import { fetchAppStore } from '@/lib/analytics/appstore'
import { fetchFacebook } from '@/lib/analytics/facebook'
import { fetchPlayCached, playConfigured, type PlayMetrics } from '@/lib/analytics/googleplay'
import { PLAY_PACKAGE_IDS } from '@/lib/ads/store'
import { DAY, shared } from '@/lib/sharedCache'
import { PUBLISH_APPS } from '@/lib/publish/platforms'

// ─── /api/analytics ──────────────────────────────────────────────────────────
//
// Same gate as /api/console (the one studio password — see src/lib/console.ts)
// and the same shape of graceful degradation as its registry: a data source
// with no credentials configured yet returns null for every app rather than
// failing the whole request, so this route works today and each source lights
// up on its own the moment its env vars are set. See the three files under
// src/lib/analytics/ for exactly what each one needs.

export const dynamic = 'force-dynamic'

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })

/** Google Play (FEAT-CLA-025): installs + estimated proceeds from the Play reports
 *  bucket. null = the app isn't on Play; `{ error }` = it is, but the read failed
 *  (or the bucket isn't configured) — the page says which. The `daily` run is
 *  dropped from the response: the cards use series/last30/history. */
export type GooglePlayMetrics = (Omit<PlayMetrics, 'daily'> & { package: string }) | { package: string; error: string } | null
async function googlePlayFor(appId: string): Promise<GooglePlayMetrics> {
  const pkg = PLAY_PACKAGE_IDS[appId]
  if (!pkg) return null
  if (!playConfigured()) return { package: pkg, error: 'Play reports bucket isn’t set up (PLAY_REPORTS_BUCKET / PLAY_REPORTS_SA_JSON)' }
  const m = await fetchPlayCached(pkg)
  if ('error' in m) return { package: pkg, error: m.error }
  const { daily: _daily, ...rest } = m
  void _daily
  return { package: pkg, ...rest }
}

/** Built once and shared by every server instance (src/lib/sharedCache.ts). */
async function build() {
  const apps = await withInstagram(analyticsRegistry())
  const rows = await Promise.all(
    apps.map(async (app) => {
      const [appStore, googlePlay, instagram, facebook, tiktok] = await Promise.all([
        fetchAppStore(app.appStoreId),
        googlePlayFor(app.id),
        fetchInstagram(app.instagramAccountId),
        fetchFacebook(app.instagramAccountId, process.env[`${app.id.toUpperCase()}_FB_PAGE_ID`] || PUBLISH_APPS.find((p) => p.id === app.id)?.pageId),
        fetchTikTok(app.tiktokAdvertiserId),
      ])
      return { id: app.id, name: app.name, accent: app.accent, appStore, googlePlay, instagram, facebook, tiktok }
    }),
  )

  return rows
}

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()

  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  // v2: adds googlePlay per app (2026-11-20); a new key so a stale v1 copy never hides the new field.
  const { value: rows, at } = await shared('analytics-v2', build, { ttl: 120, maxStale: DAY, fresh })
  return NextResponse.json({ apps: rows, cached_at: new Date(at).toISOString() })
}
