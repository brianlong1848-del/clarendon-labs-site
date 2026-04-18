import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Terms of Service — Clarendon Labs',
}

export default function Terms() {
  return (
    <>
      <Nav />
      <div className="max-w-2xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-12">Last updated: April 18, 2026</p>
        <div className="space-y-8 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Acceptance</h2>
            <p>By downloading or using any Clarendon Labs app, you agree to these terms. If you don&apos;t agree, don&apos;t use the app.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Use of our apps</h2>
            <p>Our apps are licensed, not sold. We grant you a personal, non-transferable license to use the app on devices you own. You may not copy, modify, reverse engineer, or redistribute our apps.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Disclaimer of warranties</h2>
            <p>Our apps are provided &quot;as is&quot; without warranty of any kind. We don&apos;t guarantee they&apos;ll be error-free or uninterrupted.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Limitation of liability</h2>
            <p>Clarendon Labs LLC is not liable for any indirect, incidental, or consequential damages arising from your use of our apps.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Governing law</h2>
            <p>These terms are governed by the laws of the State of Illinois.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Contact</h2>
            <p>Questions? Email <a href="mailto:contact@clarendon.dev" className="text-blue-600 hover:underline">contact@clarendon.dev</a></p>
          </section>
        </div>
      </div>
      <Footer />
    </>
  )
}
