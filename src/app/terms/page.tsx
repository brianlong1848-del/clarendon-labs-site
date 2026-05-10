import Nav from '@/components/Nav'
import StatusBar from '@/components/StatusBar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Terms of Service — Clarendon Labs',
}

export default function Terms() {
  return (
    <main>
      <StatusBar />
      <Nav />

      <section className="px-8 py-14 border-b border-line">
        <span className="micro">{"// "}terms of service</span>
        <h1 className="text-[2.75rem] sm:text-[3.25rem] mt-3 mb-3">
          Terms of Service
        </h1>
        <p className="mono text-[12px] text-mute">LAST UPDATED · APRIL 18, 2026</p>
      </section>

      <section className="px-8 py-12">
        <div className="max-w-[720px] workbench-prose">
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
            Our apps are provided “as is” without warranty of any kind. We
            don&apos;t guarantee they&apos;ll be error-free or uninterrupted.
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
