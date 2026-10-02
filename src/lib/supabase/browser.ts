import { createBrowserClient } from '@supabase/ssr'

export const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY!,
  )
