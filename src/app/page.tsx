import Nav from '@/components/Nav'
import StatusBar from '@/components/StatusBar'
import Hero from '@/components/Hero'
import Apps from '@/components/Apps'
import Pillars from '@/components/Pillars'
import Changelog from '@/components/Changelog'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <StatusBar />
      <Nav active="Apps" />
      <Hero />
      <Apps />
      <Pillars />
      <Changelog />
      <Footer />
    </main>
  )
}
