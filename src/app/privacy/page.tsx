import Nav from '@/components/Nav'
import StatusBar from '@/components/StatusBar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Privacy Policy — Clarendon Labs',
}

export default function Privacy() {
  return (
    <main>
      <StatusBar />
      <Nav />

      <section className="px-8 py-14 border-b border-line">
        <span className="micro">{"// "}privacy policy</span>
        <h1 className="text-[2.75rem] sm:text-[3.25rem] mt-3 mb-3">
          Privacy Policy
        </h1>
        <p className="mono text-[12px] text-mute">LAST UPDATED · APRIL 18, 2026</p>
      </section>

      <section className="px-8 py-12">
        <div className="max-w-[720px] workbench-prose">
          <h2>Overview</h2>
          <p>
            Clarendon Labs LLC (“we,” “us,” or “our”) operates the
            clarendon.dev website and publishes apps on the Apple App Store.
            This Privacy Policy explains how we handle your information. The
            short version: we collect as little as possible and never sell your
            data.
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
          <address className="not-italic mono text-[13px] text-mute mt-2">
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
