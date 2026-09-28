// ─── Console registry ────────────────────────────────────────────────────────
//
// SERVER ONLY. Never import this from a client component.
//
// THE ARCHITECTURE, because it's the part that matters:
//
// This console does NOT hold any app's Supabase service-role key. Each app
// exposes its own small admin API (see gagorder-web/app/api/admin), keeps its
// own service key inside its own deployment, and this site holds only a bearer
// token per app. The tokens are scoped to whatever endpoints that app chose to
// expose — so a compromise here cannot write arbitrary rows in three databases,
// and a schema change in one app never becomes an edit to the studio site.
//
// The tempting alternative — put every service-role key in one console — is why
// this file exists to say: don't.
//
// Adding an app is two env vars and one entry below.

export type ConsoleApp = {
  id: string
  name: string
  /** Brand colour, matching the studio site's per-app accents. */
  accent: string
  /** Origin of the app's own admin API, e.g. https://gagorder.app */
  baseUrl: string
  token: string
}

/** Configured apps only. An app with no URL/token is simply absent from the
 *  console rather than rendering a broken panel. */
const DEFS: Omit<ConsoleApp, 'baseUrl' | 'token'>[] = [
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A' },
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4' },
]

/** Every studio app, configured or not — for "connect this" placeholders. */
export const allApps = () => DEFS.map((d) => ({ ...d }))

export function registry(): ConsoleApp[] {
  const defs = DEFS
  return defs
    .map((d) => ({
      ...d,
      baseUrl: process.env[`${d.id.toUpperCase()}_ADMIN_URL`] ?? '',
      token: process.env[`${d.id.toUpperCase()}_ADMIN_TOKEN`] ?? '',
    }))
    .filter((a) => a.baseUrl && a.token)
}

/** The console's own password. Unset means locked, never open — the usual way a
 *  page like this leaks is defaulting to open when config is missing. */
export function consoleAuthed(req: Request): boolean {
  const expected = process.env.CONSOLE_PASSWORD
  if (!expected) return false
  const given = req.headers.get('x-console-password') ?? ''
  return given.length > 0 && given === expected
}
