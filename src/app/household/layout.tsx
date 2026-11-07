import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

// Household (FEAT-CLA-027): the two members' personal accounts, holdings and
// the Claude advisor. Lives at /household, not under /admin (that is the
// business books), but behind the same guard: the middleware matcher covers
// /household/:path* and this layout re-checks on the server.
export const metadata: Metadata = {
  title: 'Household — Clarendon Labs',
  appleWebApp: { capable: true, title: 'Household', statusBarStyle: 'default' },
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [
      { url: '/brand/clarendon-icon.svg', type: 'image/svg+xml' },
      { url: '/brand/clarendon-favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/brand/clarendon-apple-touch-icon.png',
  },
}

export default async function HouseholdLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
