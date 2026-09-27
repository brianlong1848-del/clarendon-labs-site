import { NextResponse } from 'next/server'
import { registry, consoleAuthed, type ConsoleApp } from '@/lib/console'

// ─── /api/console ────────────────────────────────────────────────────────────
//
// The federation layer. The browser talks only to this route with the console
// password; this route talks to each app's own admin API with that app's token.
// No Supabase credentials exist on this site at all.

export const dynamic = 'force-dynamic'

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })

/** One app's admin API. Reachability IS the health signal — if this fails, that
 *  app's admin surface is down, which is exactly what the console should say. */
async function pull(app: ConsoleApp) {
  const started = Date.now()
  try {
    const res = await fetch(`${app.baseUrl}/api/admin`, {
      headers: { 'x-admin-token': app.token },
      cache: 'no-store',
      // A slow app must not hang the whole dashboard.
      signal: AbortSignal.timeout(8000),
    })
    const ms = Date.now() - started
    if (!res.ok) {
      return {
        id: app.id, name: app.name, accent: app.accent, ms, ok: false,
        error: res.status === 401
          ? 'Token rejected — check this app’s ADMIN_TOKEN matches.'
          : `HTTP ${res.status}`,
        pending: [], live: [],
      }
    }
    const data = await res.json()
    return {
      id: app.id, name: app.name, accent: app.accent, ms, ok: true,
      pending: data.pending ?? [], live: data.live ?? [],
    }
  } catch (err) {
    return {
      id: app.id, name: app.name, accent: app.accent, ms: Date.now() - started,
      ok: false,
      error: err instanceof Error && err.name === 'TimeoutError'
        ? 'No response in 8s' : 'Unreachable',
      pending: [], live: [],
    }
  }
}

export async function GET(req: Request) {
  if (!consoleAuthed(req)) return deny()
  const apps = registry()
  if (!apps.length) {
    return NextResponse.json({
      apps: [],
      hint: 'No apps configured. Set <APP>_ADMIN_URL and <APP>_ADMIN_TOKEN.',
    })
  }
  // In parallel: one slow app shouldn't decide how fast the console loads.
  return NextResponse.json({ apps: await Promise.all(apps.map(pull)) })
}

/** Forward an action to the app that owns it. This route deliberately does not
 *  understand card packs or tiers — it authenticates and relays, so each app
 *  stays the only place its own rules live. */
export async function POST(req: Request) {
  if (!consoleAuthed(req)) return deny()

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
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: `${app.name} did not respond` }, { status: 502 })
  }
}
