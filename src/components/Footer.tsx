import Link from 'next/link'

type Item = { label: string; href: string; external?: boolean }
type Col = { heading: string; items: Item[] }

const cols: Col[] = [
  {
    heading: 'Apps',
    items: [
      { label: 'Rolligan', href: 'https://rolligan.com', external: true },
      { label: 'Cruise Mate', href: '/#catalog' },
      { label: 'Secret Santa', href: '/#catalog' },
      { label: 'Catalog', href: '/#catalog' },
    ],
  },
  {
    heading: 'Clarendon',
    items: [
      { label: 'About', href: '/about' },
      { label: 'Newsroom', href: '/#changelog' },
      { label: 'Contact', href: 'mailto:hello@clarendon.dev' },
    ],
  },
  {
    heading: 'Stay in touch',
    items: [
      { label: 'Email the studio', href: 'mailto:hello@clarendon.dev' },
      { label: 'Newsletter', href: 'mailto:hello@clarendon.dev?subject=Newsletter' },
    ],
  },
  {
    heading: 'For developers',
    items: [{ label: 'Built with Next.js', href: 'https://nextjs.org', external: true }],
  },
  {
    heading: 'About Clarendon',
    items: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Support', href: '/support' },
    ],
  },
]

function Col({ col }: { col: Col }) {
  return (
    <div>
      <div className="text-ink text-[12px] font-semibold mb-2.5">{col.heading}</div>
      <ul className="flex flex-col gap-2">
        {col.items.map((i) => (
          <li key={i.label}>
            {i.external ? (
              <a
                href={i.href}
                target="_blank"
                rel="noreferrer"
                className="text-ink-3 hover:underline"
              >
                {i.label}
              </a>
            ) : (
              <Link href={i.href} className="text-ink-3 hover:underline">
                {i.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Footer() {
  return (
    <footer
      className="border-t"
      style={{
        background: 'rgb(var(--bg-3))',
        color: 'rgb(var(--ink-3))',
        borderColor: 'rgb(var(--line-soft))',
        fontSize: 12,
        lineHeight: 1.33,
      }}
    >
      <div className="container-narrow pt-6">
        <p
          className="pb-[18px] max-w-[760px]"
          style={{ borderBottom: '1px solid rgb(var(--line-soft))' }}
        >
          A note on availability: Rolligan is shipping on the App Store. Apps
          described as &ldquo;in development&rdquo; or &ldquo;coming&rdquo; do
          not yet have firm release dates and may change.
        </p>
      </div>

      <div className="container-narrow py-6 grid grid-cols-2 md:grid-cols-5 gap-8">
        {cols.map((c) => (
          <Col key={c.heading} col={c} />
        ))}
      </div>

      <div
        className="container-narrow py-3.5 flex flex-wrap justify-between gap-3"
        style={{ borderTop: '1px solid rgb(var(--line-soft))' }}
      >
        <span>Copyright © 2026 Clarendon Labs LLC. All rights reserved.</span>
        <span className="flex gap-3.5">
          <Link href="/privacy" className="text-ink-3">
            Privacy
          </Link>
          <span className="text-line">|</span>
          <Link href="/terms" className="text-ink-3">
            Terms
          </Link>
          <span className="text-line">|</span>
          <Link href="/support" className="text-ink-3">
            Support
          </Link>
        </span>
        <span>Chicago, IL · United States</span>
      </div>
    </footer>
  )
}
