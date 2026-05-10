import Nav from '@/components/Nav'
import Ribbon from '@/components/Ribbon'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Terms of Service — Clarendon Labs',
}

export default function Terms() {
  return (
    <main>
      <Ribbon />
      <Nav />

      <section className="bg-bg px-6 pt-24 pb-12 text-center">
        <div className="eyebrow mb-2">Legal</div>
        <h1 className="display mb-3" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>
          Terms of Service
        </h1>
        <p className="text-[14px] text-ink-3">Last updated · April 18, 2026</p>
      </section>

      <section className="bg-bg px-6 pb-24">
        <div className="container-narrow max-w-[760px] workbench-prose">
          <h2>Acceptance</h2>
          <p>
            By downloading or using any Clarendon Labs app, you agree to these
            terms. If you don&apos;t agree, don&apos;t use the app.
          </p>

          <h2>Use of our apps</h2>
          <p>
            Our apps are licensed, not sold. We grant you a personal,
            non-transferable license to use the app on devices you own. You may
            not copy, modify, reverse engineer, or redistribute our apps.
          </p>

          <h2>Disclaimer of warranties</h2>
          <p>
            Our apps are provided &ldquo;as is&rdquo; without warranty of any
            kind. We don&apos;t guarantee they&apos;ll be error-free or
            uninterrupted.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            Clarendon Labs LLC is not liable for any indirect, incidental, or
            consequential damages arising from your use of our apps.
          </p>

          <h2>Governing law</h2>
          <p>These terms are governed by the laws of the State of Illinois.</p>

          <h2>Contact</h2>
          <p>
            Questions? Email{' '}
            <a href="mailto:hello@clarendon.dev">hello@clarendon.dev</a>.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
