import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

/** Supabase client for route handlers / server components.
 *  This is the studio auth project (clarendon-studio) — separate from the
 *  SUPABASE_URL used by the publishing store.
 *
 *  Browser requests carry the signed-in session in cookies. The native Studio
 *  app has no cookies; it sends "Authorization: Bearer <access token>", so the
 *  client acts as that user and row-level security still decides what's visible.
 *  (Routes have already checked consoleAuthed() before they read any data.) */
export async function supabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY!

  const authHeader = (await headers()).get('authorization')
  if (authHeader && /^Bearer\s+\S+$/i.test(authHeader)) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authHeader } },
    })
  }

  const store = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* read-only context */ }
      },
    },
  }) as unknown as SupabaseClient
}
