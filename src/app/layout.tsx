import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Clarendon Labs — An independent app studio',
  description:
    'Chicago-based independent app studio. We make games, home tools, and everyday utilities — one well-made app at a time.',
  metadataBase: new URL('https://clarendon.dev'),
}

export const viewport: Viewport = {
  themeColor: '#0B0B0F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className={`${inter.className} bg-bg text-ink`}>{children}</body>
    </html>
  )
}
