import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Support — Clarendon Labs',
}

export default function Support() {
  return (
    <>
      <Nav />
      <div className="max-w-2xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Support</h1>
        <p className="text-lg text-gray-500 mb-12">We&apos;re a small studio and we read every message. You&apos;ll hear back from a real person.</p>
        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold mb-3">Get in touch</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">For app support, bug reports, or general questions, email us at:</p>
            <a href="mailto:contact@clarendon.dev" className="text-2xl font-semibold text-blue-600 hover:underline">contact@clarendon.dev</a>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">What to include</h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li>• The name of the app you&apos;re using</li>
              <li>• Your device model and iOS version</li>
              <li>• A description of the issue or question</li>
              <li>• A screenshot if relevant</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">Response time</h2>
            <p className="text-gray-600 dark:text-gray-400">We typically respond within 1–2 business days.</p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  )
}
