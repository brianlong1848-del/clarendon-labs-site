import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clarendon Labs — An independent iOS studio',
  description:
    'Clarendon Labs is an independent iOS studio in Chicago. We build a short list of useful apps — games, home tools, and daily utilities — one well-made app at a time.',
  metadataBase: new URL('https://clarendon.dev'),
}

export const viewport: Viewport = {
  themeColor: '#fafaf7',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
