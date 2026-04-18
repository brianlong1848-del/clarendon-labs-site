import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Privacy Policy — Clarendon Labs',
}

export default function Privacy() {
  return (
    <>
      <Nav />
      <div className="max-w-2xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-12">Last updated: April 18, 2026</p>
        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Overview</h2>
            <p>Clarendon Labs LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the clarendon.dev website and publishes apps on the Apple App Store. This Privacy Policy explains how we handle your information. The short version: we collect as little as possible and never sell your data.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Information we collect</h2>
            <p>Our apps are designed to work without collecting personal information. We do not require account creation, and we do not track your behavior across apps or websites.</p>
            <p className="mt-3">If you contact us via email, we receive your email address and the contents of your message. We use this only to respond to you.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Data storage</h2>
            <p>App data is stored locally on your device. We do not operate servers that store your personal information.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Third-party services</h2>
            <p>Our apps may be distributed through the Apple App Store, which has its own privacy practices. We encourage you to review Apple&apos;s Privacy Policy at apple.com/privacy.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Children&apos;s privacy</h2>
            <p>Our apps are not directed at children under 13. We do not knowingly collect information from children.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Changes to this policy</h2>
            <p>If we make material changes to this policy, we will update the date at the top of this page. Continued use of our apps after changes constitutes acceptance.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Contact</h2>
            <p>Questions about privacy? Email us at <a href="mailto:contact@clarendon.dev" className="text-blue-600 hover:underline">contact@clarendon.dev</a> or write to:</p>
            <address className="mt-3 not-italic text-gray-600 dark:text-gray-400">
              Clarendon Labs LLC<br />
              4016 N Clarendon Ave, Unit 4N<br />
              Chicago, IL 60613
            </address>
          </section>
        </div>
      </div>
      <Footer />
    </>
  )
}
