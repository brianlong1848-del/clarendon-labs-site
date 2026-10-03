import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/supabase/guard'
import { supabaseServer } from '@/lib/supabase/server'

// Server-side page guard. The middleware already turns away anyone without an
// aal2 admin session, but pages must not rely on it alone: if a middleware
// bypass ever ships again (it has, in Next.js), this still refuses to render.
// Call it from a server layout/page that wraps the client UI.
export async function requireAdmin(): Promise<void> {
  const ok = await isAdmin(await supabaseServer()).catch(() => false)
  if (!ok) redirect('/login')
}
