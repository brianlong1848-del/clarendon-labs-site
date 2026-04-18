import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Clarendon Labs — Apps for real life',
  description: 'Independent app studio based in Chicago. We make games, home tools, and everyday utilities. One well-made app at a time.',
  metadataBase: new URL('https://clarendon.dev'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
