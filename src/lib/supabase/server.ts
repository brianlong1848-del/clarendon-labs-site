import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Supabase client for route handlers / server components (cookie session).
 *  This is the studio auth project (clarendon-studio) — separate from the
 *  SUPABASE_URL used by the publishing store. */
export function supabaseServer() {
  const store = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* read-only context */ }
        },
      },
    },
  )
}
