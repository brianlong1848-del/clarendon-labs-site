// ─── Studio money database (clarendon-studio Supabase) ───────────────────────
//
// SERVER ONLY. Service-role access for ingestion jobs and webhooks — they have
// no user session. Never import from a client component. The browser/admin UI
// reads money data through the signed-in user's session (RLS), not this.
//
// Env: NEXT_PUBLIC_STUDIO_SUPABASE_URL, STUDIO_SUPABASE_SERVICE_KEY (secret),
//      STUDIO_OWNER_ID (Brian's auth user id — every money row is owned by it).

export function studioDb() {
  const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL
  const key = process.env.STUDIO_SUPABASE_SERVICE_KEY
  const owner = process.env.STUDIO_OWNER_ID
  if (!url || !key || !owner) return null
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  return {
    owner,
    /** Insert-or-update rows, keyed on a unique constraint. */
    async upsert(table: string, rows: object[], onConflict: string) {
      if (!rows.length) return { ok: true as const, count: 0 }
      const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
        cache: 'no-store',
      })
      if (!res.ok) return { ok: false as const, error: `${table}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` }
      return { ok: true as const, count: rows.length }
    },
  }
}
