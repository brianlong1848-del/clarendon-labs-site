import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 dark:border-gray-900 py-12 px-6 max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-xs text-gray-400">© 2026 Clarendon Labs LLC · Chicago, IL</p>
      <div className="flex gap-6 flex-wrap justify-center">
        <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms of Service</Link>
        <Link href="/support" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Support</Link>
        <a href="mailto:contact@clarendon.dev" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">contact@clarendon.dev</a>
      </div>
    </footer>
  )
}
