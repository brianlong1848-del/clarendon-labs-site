// ─── Studio money database (clarendon-studio Supabase) ───────────────────────
//
// SERVER ONLY. Service-role access for ingestion jobs and webhooks — they have
// no user session. Never import from a client component. The browser/admin UI
// reads money data through the signed-in user's session (RLS), not this.
//
// Env: NEXT_PUBLIC_STUDIO_SUPABASE_URL, STUDIO_SUPABASE_SERVICE_KEY (secret),
//      STUDIO_OWNER_ID (Brian's auth user id — every money row is owned by it).

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export function studioDb() {
  const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL
  const key = process.env.STUDIO_SUPABASE_SERVICE_KEY
  const owner = process.env.STUDIO_OWNER_ID
  if (!url || !key || !owner) return null
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  async function call<T>(path: string, init: RequestInit, prefer?: string): Promise<Result<T>> {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init, cache: 'no-store',
      headers: { ...h, ...(prefer ? { Prefer: prefer } : {}) },
    })
    if (!res.ok) return { ok: false, error: `${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` }
    const text = await res.text()
    return { ok: true, data: (text ? JSON.parse(text) : null) as T }
  }

  return {
    owner,
    /** GET with a PostgREST query string, e.g. select('rules', 'select=*&order=priority'). */
    select: <T = Record<string, unknown>[]>(table: string, query = 'select=*') => call<T>(`${table}?${query}`, { method: 'GET' }),
    /** Insert-or-update rows keyed on a unique constraint. */
    upsert: (table: string, rows: object[], onConflict: string) =>
      rows.length ? call<null>(`${table}?on_conflict=${encodeURIComponent(onConflict)}`,
        { method: 'POST', body: JSON.stringify(rows) }, 'resolution=merge-duplicates,return=minimal')
        : Promise.resolve({ ok: true, data: null } as Result<null>),
    /** Insert rows, silently skipping ones whose unique key already exists. */
    insertIgnore: (table: string, rows: object[], onConflict: string) =>
      rows.length ? call<null>(`${table}?on_conflict=${encodeURIComponent(onConflict)}`,
        { method: 'POST', body: JSON.stringify(rows) }, 'resolution=ignore-duplicates,return=minimal')
        : Promise.resolve({ ok: true, data: null } as Result<null>),
    patch: (table: string, filter: string, body: object) =>
      call<null>(`${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(body) }, 'return=minimal'),
    remove: (table: string, filter: string) =>
      call<null>(`${table}?${filter}`, { method: 'DELETE' }, 'return=minimal'),
    rpc: <T = unknown>(fn: string, args: object) => call<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
  }
}
export type StudioDb = NonNullable<ReturnType<typeof studioDb>>
