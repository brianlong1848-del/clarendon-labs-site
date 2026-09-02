import type { Metadata } from 'next'
import BoreaShell from '../shell'
import { fr, EN_URL, FR_URL } from '../copy'

// The French page. Served at boreaapp.com/fr through a rewrite in
// next.config.mjs, and directly at clarendon.dev/borea/fr.

export const metadata: Metadata = {
  title: fr.meta.title,
  description: fr.meta.description,
  metadataBase: new URL('https://boreaapp.com'),
  alternates: {
    canonical: FR_URL,
    languages: { en: EN_URL, 'fr-CA': FR_URL, 'x-default': EN_URL },
  },
  openGraph: {
    title: fr.meta.title,
    description: fr.meta.ogDescription,
    url: FR_URL,
    siteName: 'Borea',
    locale: 'fr_CA',
    alternateLocale: ['en_US'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: fr.meta.title,
    description: fr.meta.ogDescription,
  },
}

export default function BoreaPageFr() {
  return <BoreaShell c={fr} />
}
