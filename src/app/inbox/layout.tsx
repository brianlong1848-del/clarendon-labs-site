import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export const metadata: Metadata = {
  title: 'Inbox — Clarendon Labs',
  robots: { index: false, follow: false, nocache: true },
}

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
