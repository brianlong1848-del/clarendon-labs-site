import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="relative section-divider px-6 py-12 md:py-14">
      <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-accent"
            style={{ boxShadow: '0 0 0 4px rgba(110, 120, 214, 0.18)' }}
            aria-hidden
          />
          <span className="text-sm font-bold tracking-tight text-ink">
            Clarendon Labs
          </span>
          <span className="text-sm text-ink-dim ml-2">
            © 2026 Clarendon Labs LLC · Chicago
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <a
            href="mailto:hello@clarendon.dev"
            className="text-ink-mid hover:text-ink transition-colors"
          >
            hello@clarendon.dev
          </a>
          <Link
            href="/privacy"
            className="text-ink-dim hover:text-ink transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-ink-dim hover:text-ink transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/support"
            className="text-ink-dim hover:text-ink transition-colors"
          >
            Support
          </Link>
        </div>
      </div>
    </footer>
  )
}
