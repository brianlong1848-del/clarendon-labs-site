import { NextResponse } from 'next/server'
import { registry, allApps, consoleAuthed } from '@/lib/console'
import { DAY, forget, shared } from '@/lib/sharedCache'
import { consoleCards } from '@/lib/consoleSummary'

// ─── /api/console ────────────────────────────────────────────────────────────
//
// The federation layer. The browser talks only to this route with the console
// password; this route talks to each app's own admin API with that app's token.
// No Supabase credentials exist on this site at all.

export const dynamic = 'force-dynamic'

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })

/** Everything the Console shows, built once and shared (src/lib/sharedCache.ts):
 *  a minute old at most when someone is looking, and never rebuilt per server
 *  instance. Each app's admin API is asked once; `apps` is the same answer in
 *  the older shape. */
async function build() {
  const missing = allApps().filter((a) => !registry().some((x) => x.id === a.id))
  const { cards, summary } = await consoleCards()
  const apps = cards.filter((c) => c.server.connected).map((c) => ({
    id: c.id, name: c.name, accent: c.accent, ms: c.server.ms ?? 0, ok: !!c.server.ok, error: c.server.error,
    pending: c.server.pending ?? [], live: c.server.live ?? [], stats: c.server.stats, recent: c.server.recent,
  }))
  return { apps, missing, cards, summary }
}
const KEY = 'console-v1'

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()
  // `apps` / `missing` keep the old shape for the suggestion review + Studio
  // builds already in the field; `cards` + `summary` are the one-card-per-app
  // console (src/lib/consoleSummary.ts): store, ads, top action, server.
  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  const { value, at } = await shared(KEY, build, { ttl: 60, maxStale: DAY, fresh })
  return NextResponse.json({ ...value, cached_at: new Date(at).toISOString(), hint: registry().length ? undefined : 'No apps configured. Set <APP>_ADMIN_URL and <APP>_ADMIN_TOKEN.' })
}

/** Forward an action to the app that owns it. This route deliberately does not
 *  understand card packs or tiers — it authenticates and relays, so each app
 *  stays the only place its own rules live. */
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()

  let body: { appId?: string; [k: string]: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const app = registry().find((a) => a.id === body.appId)
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })

  const { appId: _drop, ...payload } = body
  try {
    const res = await fetch(`${app.baseUrl}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': app.token },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    // The app's lists just changed; the next read must not be the old copy.
    forget(KEY)
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: `${app.name} did not respond` }, { status: 502 })
  }
}
