import Nav from '@/components/Nav'
import Ribbon from '@/components/Ribbon'
import Hero from '@/components/Hero'
import FeaturedRolligan from '@/components/FeaturedRolligan'
import StudioThesis from '@/components/StudioThesis'
import Catalog from '@/components/Catalog'
import PrivacyTile from '@/components/PrivacyTile'
import Changelog from '@/components/Changelog'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Ribbon />
      <Nav active="Apps" />
      <Hero />
      <FeaturedRolligan />
      <StudioThesis />
      <Catalog />
      <PrivacyTile />
      <Changelog />
      <Footer />
    </main>
  )
}
