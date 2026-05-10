import Nav from '@/components/Nav'
import Ribbon from '@/components/Ribbon'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Privacy Policy — Clarendon Labs',
}

export default function Privacy() {
  return (
    <main>
      <Ribbon />
      <Nav />

      <section className="bg-bg px-6 pt-24 pb-12 text-center">
        <div className="eyebrow mb-2">Legal</div>
        <h1 className="display mb-3" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>
          Privacy Policy
        </h1>
        <p className="text-[14px] text-ink-3">Last updated · April 18, 2026</p>
      </section>

      <section className="bg-bg px-6 pb-24">
        <div className="container-narrow max-w-[760px] workbench-prose">
          <h2>Overview</h2>
          <p>
            Clarendon Labs LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) operates the clarendon.dev website and publishes
            apps on the Apple App Store. This Privacy Policy explains how we
            handle your information. The short version: we collect as little
            as possible and never sell your data.
          </p>

          <h2>Information we collect</h2>
          <p>
            Our apps are designed to work without collecting personal
            information. We do not require account creation, and we do not
            track your behavior across apps or websites.
          </p>
          <p>
            If you contact us via email, we receive your email address and the
            contents of your message. We use this only to respond to you.
          </p>

          <h2>Data storage</h2>
          <p>
            App data is stored locally on your device. We do not operate
            servers that store your personal information.
          </p>

          <h2>Third-party services</h2>
          <p>
            Our apps may be distributed through the Apple App Store, which has
            its own privacy practices. We encourage you to review Apple&apos;s
            Privacy Policy at apple.com/privacy.
          </p>

          <h2>Children&apos;s privacy</h2>
          <p>
            Our apps are not directed at children under 13. We do not knowingly
            collect information from children.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If we make material changes to this policy, we will update the
            date at the top of this page. Continued use of our apps after
            changes constitutes acceptance.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about privacy? Email us at{' '}
            <a href="mailto:hello@clarendon.dev">hello@clarendon.dev</a> or
            write to:
          </p>
          <address className="not-italic mono text-[15px] text-ink-2 mt-2">
            Clarendon Labs LLC
            <br />
            4016 N Clarendon Ave, Unit 4N
            <br />
            Chicago, IL 60613
          </address>
        </div>
      </section>

      <Footer />
    </main>
  )
}
