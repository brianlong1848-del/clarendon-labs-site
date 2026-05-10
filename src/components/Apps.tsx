import Link from 'next/link'

type Row = {
  n: string
  name: string
  desc: string
  category: string
  status: string
  ship: string
  href?: string
  active?: boolean
}

const rows: Row[] = [
  {
    n: '001',
    name: 'Rolligan',
    desc: 'The dice party game. Pass-and-play.',
    category: 'Games',
    status: 'Live',
    ship: 'Q2 2026',
    href: 'https://rolligan.com',
    active: true,
  },
  {
    n: '002',
    name: 'LOG',
    desc: 'A quiet logbook for things you fix at home.',
    category: 'Home',
    status: 'Design',
    ship: 'Q4 2026',
  },
  {
    n: '003',
    name: 'WEEK',
    desc: 'Shared week planner for households.',
    category: 'Routines',
    status: 'Concept',
    ship: '2027',
  },
  {
    n: '004',
    name: '—',
    desc: 'Untitled card game.',
    category: 'Games',
    status: 'Playtest',
    ship: 'TBD',
  },
]

export default function Apps() {
  return (
    <section id="catalog" className="px-8 pt-16 lg:pt-[72px] pb-12">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
        <div>
          <span className="micro">{"// "}01 — Catalog</span>
          <h2 className="text-[40px] mt-2">
            Everything we&apos;ve made and everything we&apos;re making.
          </h2>
        </div>
        <Link
          href="/#changelog"
          className="nav-link inline-flex gap-1.5"
        >
          View changelog <span className="ascii">→</span>
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div
          className="hidden md:grid px-5 py-3 border-b border-line bg-bg-2"
          style={{ gridTemplateColumns: '80px 2fr 1.5fr 1fr 1fr 1fr 80px' }}
        >
          {['#', 'Name', 'Description', 'Category', 'Status', 'Ship', '—'].map(
            (h, i) => (
              <span key={i} className="micro">
                {h}
              </span>
            )
          )}
        </div>

        {rows.map((r) => {
          const inner = (
            <div
              className="grid grid-cols-1 md:grid-cols-[80px_2fr_1.5fr_1fr_1fr_1fr_80px] px-5 py-4 border-b border-line items-center gap-3 last:border-b-0"
            >
              <span className="mono text-[13px] text-mute">{r.n}</span>
              <span className="text-[16px] font-medium">{r.name}</span>
              <span className="text-[13.5px] text-mute">{r.desc}</span>
              <span className="mono text-[12px]">{r.category}</span>
              <span
                className="chip w-fit"
                style={
                  r.active
                    ? {
                        background: 'var(--accent)',
                        borderColor: 'oklch(0.7 0.17 145)',
                        color: 'var(--accent-ink)',
                      }
                    : undefined
                }
              >
                <span
                  className="dot"
                  style={
                    r.active
                      ? { background: 'var(--accent-ink)' }
                      : { background: 'rgb(var(--mute))' }
                  }
                />{' '}
                {r.status}
              </span>
              <span className="mono text-[12px] text-mute">{r.ship}</span>
              <span className="ascii text-[14px] text-mute md:text-right">
                →
              </span>
            </div>
          )

          return r.href ? (
            <a
              key={r.n}
              href={r.href}
              target="_blank"
              rel="noreferrer"
              className="block hover:bg-bg-2 transition-colors"
            >
              {inner}
            </a>
          ) : (
            <div key={r.n}>{inner}</div>
          )
        })}
      </div>
    </section>
  )
}
