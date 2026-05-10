import Link from 'next/link'

type Col = { heading: string; items: { label: string; href: string; external?: boolean }[] }

const cols: Col[] = [
  {
    heading: 'Catalog',
    items: [
      { label: 'Rolligan', href: 'https://rolligan.com', external: true },
      { label: 'Roadmap', href: '/#catalog' },
      { label: 'Changelog', href: '/#changelog' },
    ],
  },
  {
    heading: 'Studio',
    items: [
      { label: 'About', href: '/about' },
      { label: 'Manifesto', href: '/#manifesto' },
      { label: 'Contact', href: 'mailto:hello@clarendon.dev' },
    ],
  },
  {
    heading: 'Help',
    items: [
      { label: 'Support', href: '/support' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
  {
    heading: 'Elsewhere',
    items: [
      { label: 'App Store', href: 'https://rolligan.com', external: true },
      { label: 'Email', href: 'mailto:hello@clarendon.dev' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-line mt-10">
      <div className="px-8 py-12 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-8">
        <div>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span
              className="w-[22px] h-[22px] bg-ink rounded flex items-center justify-center font-semibold text-[13px]"
              style={{ color: 'var(--accent)' }}
              aria-hidden
            >
              C
            </span>
            <span className="text-sm font-medium">clarendon/labs</span>
          </div>
          <p className="mono text-[12px] text-mute leading-[1.55] max-w-[280px]">
            Independent iOS studio.
            <br />
            Chicago, IL · est. 2025.
            <br />
            Clarendon Labs LLC.
          </p>
        </div>

        {cols.map((col) => (
          <div key={col.heading}>
            <div className="micro mb-3.5">{col.heading}</div>
            <ul className="flex flex-col gap-2">
              {col.items.map((i) =>
                i.external ? (
                  <li key={i.label}>
                    <a
                      href={i.href}
                      target="_blank"
                      rel="noreferrer"
                      className="nav-link"
                    >
                      {i.label}
                    </a>
                  </li>
                ) : (
                  <li key={i.label}>
                    <Link href={i.href} className="nav-link">
                      {i.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-8 py-3.5 flex flex-col md:flex-row gap-2 md:gap-0 justify-between">
        <span className="micro">© 2026 CLARENDON LABS LLC · ALL RIGHTS RESERVED</span>
        <span className="micro">BUILT IN CHICAGO · DEPLOYED FROM A LAPTOP</span>
      </div>
    </footer>
  )
}
