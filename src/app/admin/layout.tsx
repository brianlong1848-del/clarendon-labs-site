import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

// Not a public page. This won't stop anyone determined (the sign-in does that),
// but there's no reason for it to sit in a search index.
export const metadata: Metadata = {
  title: 'Console — Clarendon Labs',
  // Lets "Add to Home Screen" on iPhone open the admin full-screen like an app.
  appleWebApp: { capable: true, title: 'Clarendon Admin', statusBarStyle: 'default' },
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [
      { url: '/brand/clarendon-icon.svg', type: 'image/svg+xml' },
      { url: '/brand/clarendon-favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/brand/clarendon-apple-touch-icon.png',
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
