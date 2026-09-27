import type { Metadata } from 'next'

// Not a public page. This won't stop anyone determined (the password does
// that), but there's no reason for it to sit in a search index.
export const metadata: Metadata = {
  title: 'Analytics — Clarendon Labs',
  robots: { index: false, follow: false, nocache: true },
}

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
