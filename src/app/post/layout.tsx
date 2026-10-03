import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/supabase/requireAdmin'

export const metadata: Metadata = {
  title: 'Post — Clarendon Labs',
  robots: { index: false, follow: false, nocache: true },
}

export default async function PostLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
