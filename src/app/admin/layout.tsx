import type { Metadata } from 'next'

// Not a public page. This won't stop anyone determined (the password does that),
// but there's no reason for it to sit in a search index.
export const metadata: Metadata = {
  title: 'Console — Clarendon Labs',
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [
      { url: '/brand/clarendon-icon.svg', type: 'image/svg+xml' },
      { url: '/brand/clarendon-favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/brand/clarendon-apple-touch-icon.png',
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
