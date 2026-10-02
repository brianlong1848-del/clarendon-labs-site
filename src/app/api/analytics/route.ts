import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { analyticsRegistry } from '@/lib/analytics/registry'
import { fetchTikTok } from '@/lib/analytics/tiktok'
import { fetchInstagram } from '@/lib/analytics/instagram'
import { fetchAppStore } from '@/lib/analytics/appstore'
import { fetchFacebook } from '@/lib/analytics/facebook'

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

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()

  const apps = analyticsRegistry()
  const rows = await Promise.all(
    apps.map(async (app) => {
      const [appStore, instagram, facebook, tiktok] = await Promise.all([
        fetchAppStore(app.appStoreId),
        fetchInstagram(app.instagramAccountId),
        fetchFacebook(app.instagramAccountId),
        fetchTikTok(app.tiktokAdvertiserId),
      ])
      return { id: app.id, name: app.name, accent: app.accent, appStore, instagram, facebook, tiktok }
    }),
  )

  return NextResponse.json({ apps: rows })
}
