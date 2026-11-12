import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { analyticsRegistry, withInstagram } from '@/lib/analytics/registry'
import { fetchTikTok } from '@/lib/analytics/tiktok'
import { fetchInstagram } from '@/lib/analytics/instagram'
import { fetchAppStore } from '@/lib/analytics/appstore'
import { fetchFacebook } from '@/lib/analytics/facebook'
import { shared } from '@/lib/sharedCache'
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

/** Built once and shared by every server instance (src/lib/sharedCache.ts). */
async function build() {
  const apps = await withInstagram(analyticsRegistry())
  const rows = await Promise.all(
    apps.map(async (app) => {
      const [appStore, instagram, facebook, tiktok] = await Promise.all([
        fetchAppStore(app.appStoreId),
        fetchInstagram(app.instagramAccountId),
        fetchFacebook(app.instagramAccountId, process.env[`${app.id.toUpperCase()}_FB_PAGE_ID`] || PUBLISH_APPS.find((p) => p.id === app.id)?.pageId),
        fetchTikTok(app.tiktokAdvertiserId),
      ])
      return { id: app.id, name: app.name, accent: app.accent, appStore, instagram, facebook, tiktok }
    }),
  )

  return rows
}

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()

  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  const { value: rows, at } = await shared('analytics-v1', build, { ttl: 120, maxStale: 30 * 60, fresh })
  return NextResponse.json({ apps: rows, cached_at: new Date(at).toISOString() })
}
