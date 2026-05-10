import Link from 'next/link'
import Mark from './Mark'

export type NavActive =
  | 'Apps'
  | 'Rolligan'
  | 'Cruise Mate'
  | 'Secret Santa'
  | 'About'
  | 'Support'

type Item =
  | { label: NavActive; href: string; external?: false }
  | { label: NavActive; href: string; external: true }

const items: Item[] = [
  { label: 'Apps', href: '/#catalog' },
  { label: 'Rolligan', href: 'https://rolligan.com', external: true },
  { label: 'Cruise Mate', href: '/#catalog' },
  { label: 'Secret Santa', href: '/#catalog' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/support' },
]

export default function Nav({ active }: { active?: NavActive }) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'rgb(251 251 253 / 0.8)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderColor: 'rgb(0 0 0 / 0.05)',
      }}
    >
      <nav className="container-narrow h-11 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Clarendon Labs home"
          className="flex items-center gap-1.5 text-ink"
        >
          <Mark size={18} />
        </Link>

        <div className="hidden md:flex">
          {items.map((it) => {
            const cls = `text-[12px] px-2.5 h-11 inline-flex items-center transition-opacity ${
              active === it.label
                ? 'text-ink opacity-100'
                : 'text-ink-2 opacity-[0.88] hover:opacity-100'
            }`
            return it.external ? (
              <a
                key={it.label}
                href={it.href}
                target="_blank"
                rel="noreferrer"
                className={cls}
              >
                {it.label}
              </a>
            ) : (
              <Link key={it.label} href={it.href} className={cls}>
                {it.label}
              </Link>
            )
          })}
        </div>

        <a
          href="mailto:hello@clarendon.dev"
          className="text-[12px] text-ink-2 px-2.5 h-11 inline-flex items-center hover:text-ink transition-colors"
          aria-label="Contact"
        >
          Contact
        </a>
      </nav>
    </header>
  )
}
