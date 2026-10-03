import { createBrowserClient } from '@supabase/ssr'

// Passkeys are an opt-in (experimental) feature of supabase-js, so the browser
// client turns it on explicitly.
export const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY!,
    { auth: { experimental: { passkey: true } } },
  )
