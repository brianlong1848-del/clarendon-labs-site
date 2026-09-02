import type { Metadata } from 'next'
import BoreaShell from './shell'
import { en, EN_URL, FR_URL, BOREA_ICONS } from './copy'

export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
  // The root layout's metadataBase is clarendon.dev, which would resolve the
  // preview image to the wrong host. Borea has its own domain now.
  metadataBase: new URL('https://boreaapp.com'),
  icons: BOREA_ICONS,
  alternates: {
    canonical: EN_URL,
    languages: { en: EN_URL, 'fr-CA': FR_URL, 'x-default': EN_URL },
  },
  openGraph: {
    title: en.meta.title,
    description: en.meta.ogDescription,
    url: EN_URL,
    siteName: 'Borea',
    locale: 'en_US',
    alternateLocale: ['fr_CA'],
    // The card itself comes from opengraph-image.tsx beside this file, which
    // Next wires up automatically — listing images here would override it.
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: en.meta.title,
    description: en.meta.ogDescription,
  },
}

export default function BoreaPage() {
  return <BoreaShell c={en} />
}
