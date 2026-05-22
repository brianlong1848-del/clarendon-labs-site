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
        <p className="text-[14px] text-ink-3">Last updated · May 22, 2026</p>
      </section>

      <section className="bg-bg px-6 pb-24">
        <div className="container-narrow max-w-[760px] workbench-prose">
          <h2>Overview</h2>
          <p>
            Clarendon Labs LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) operates the clarendon.dev website and publishes
            apps on the Apple App Store. This Privacy Policy explains how we
            handle your information. The short version: we collect only what an
            app needs to work, we never sell your data, and we don&apos;t use
            advertising or cross-app tracking.
          </p>

          <h2>How our apps differ</h2>
          <p>
            Our apps handle data in two different ways, depending on what the
            app does:
          </p>
          <ul>
            <li>
              <strong>On-device apps</strong> (for example, Rolligan) run
              entirely on your device. There is no account, we operate no
              servers for them, and your data never leaves your phone.
            </li>
            <li>
              <strong>Account-based apps</strong> (for example, YulePick) are
              shared, multiplayer experiences. They require an account and sync
              data between participants, so some information is stored on our
              backend. The sections below describe what that involves.
            </li>
          </ul>

          <h2>Information we collect</h2>
          <p>
            <strong>On-device apps.</strong> We do not collect personal
            information. Everything stays on your device.
          </p>
          <p>
            <strong>Account-based apps (YulePick).</strong> To make a shared
            gift exchange work, we collect: your email address (used to sign you
            in with a one-time code), the display name you choose, the exchanges
            you create or join, the wishlist links and notes you add, and your
            gift-draw assignment. We collect this only to operate the exchange
            you&apos;re participating in.
          </p>
          <p>
            <strong>Contacting us.</strong> If you email us, we receive your
            email address and the contents of your message, and use them only to
            respond to you.
          </p>

          <h2>How we store and protect your data</h2>
          <p>
            For on-device apps, data is stored only on your device. For
            account-based apps, data is stored on managed cloud infrastructure
            provided by our hosting and authentication provider (see
            &ldquo;Third-party services&rdquo; below). Data is transmitted over
            encrypted connections, and access is restricted so that participants
            can only see the exchanges they belong to.
          </p>

          <h2>What we don&apos;t do</h2>
          <p>
            We do not sell or rent your personal information. Our apps do not
            include third-party advertising, and we do not track your behavior
            across other apps or websites.
          </p>

          <h2>Third-party services</h2>
          <p>
            Our account-based apps rely on third-party providers that process
            data on our behalf:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> &mdash; database hosting and
              authentication for account-based apps.
            </li>
            <li>
              <strong>Resend</strong> &mdash; delivery of the one-time sign-in
              codes we email you.
            </li>
            <li>
              <strong>Apple App Store</strong> &mdash; distribution of our apps,
              subject to Apple&apos;s own privacy practices
              (apple.com/privacy).
            </li>
          </ul>

          <h2>Data retention &amp; deletion</h2>
          <p>
            For account-based apps, we keep your data while your account and
            exchanges are active. You can request deletion of your account and
            associated data at any time by emailing{' '}
            <a href="mailto:hello@clarendon.dev">hello@clarendon.dev</a>.
            On-device apps store nothing for us to delete; removing the app
            removes its data.
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
