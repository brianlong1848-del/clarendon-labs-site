import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clarendon Labs — An independent iOS studio',
  description:
    'Clarendon Labs is a small iOS studio in Chicago building two kinds of software: games you play with friends, and lifestyle tools you keep on your home screen.',
  metadataBase: new URL('https://clarendon.dev'),
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
