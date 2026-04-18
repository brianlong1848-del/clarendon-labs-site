import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Apps from '@/components/Apps'
import Pillars from '@/components/Pillars'
import About from '@/components/About'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Apps />
      <Pillars />
      <About />
      <Footer />
    </main>
  )
}
