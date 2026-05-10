import Link from 'next/link'

type NavProps = { active?: 'Apps' | 'Rolligan' | 'Changelog' | 'About' | 'Support' }

const links: { label: NavProps['active']; href: string; external?: boolean }[] = [
  { label: 'Apps', href: '/#catalog' },
  { label: 'Rolligan', href: 'https://rolligan.com', external: true },
  { label: 'Changelog', href: '/#changelog' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/support' },
]

export default function Nav({ active }: NavProps) {
  return (
    <header className="border-b border-line bg-bg px-8 py-3.5 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3">
        <span
          className="w-[22px] h-[22px] bg-ink rounded flex items-center justify-center font-semibold text-[13px]"
          style={{ color: 'var(--accent)' }}
          aria-hidden
        >
          C
        </span>
        <span className="text-sm font-medium text-ink">clarendon</span>
        <span className="mono text-mute text-[13px]">/labs</span>
      </Link>

      <nav className="hidden md:flex gap-7">
        {links.map((l) =>
          l.external ? (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className={`nav-link${active === l.label ? ' active' : ''}`}
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.label}
              href={l.href}
              className={`nav-link${active === l.label ? ' active' : ''}`}
            >
              {l.label}
            </Link>
          )
        )}
      </nav>

      <div className="flex items-center gap-2.5">
        <span className="chip hidden sm:inline-flex">
          <span className="dot" /> v2026.05 · spring
        </span>
        <a href="mailto:hello@clarendon.dev" className="btn btn-primary">
          Get in touch <span className="ascii">→</span>
        </a>
      </div>
    </header>
  )
}
