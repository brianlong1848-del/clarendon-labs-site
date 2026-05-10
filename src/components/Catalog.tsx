import Reveal from './Reveal'

type Status = 'Live' | 'In development' | 'Coming Dec 2026' | 'Coming 2027'
type Theme = 'accent' | 'grey' | 'dark'
type Art = 'dice' | 'santa' | 'cruise' | 'logbook'

type App = {
  name: string
  blurb: string
  status: Status
  theme: Theme
  art: Art
  href?: string
}

type Row = { category: 'Games' | 'Lifestyle'; sub: string; apps: App[] }

const rows: Row[] = [
  {
    category: 'Games',
    sub: 'For the table, the road trip, the holiday party.',
    apps: [
      {
        name: 'Rolligan',
        blurb: 'Dice party game · 2–8 players',
        status: 'Live',
        theme: 'accent',
        art: 'dice',
        href: 'https://rolligan.com',
      },
      {
        name: 'Secret Santa',
        blurb: 'Anonymous gift exchange organizer',
        status: 'Coming Dec 2026',
        theme: 'grey',
        art: 'santa',
      },
    ],
  },
  {
    category: 'Lifestyle',
    sub: 'Tools you keep on your home screen.',
    apps: [
      {
        name: 'Cruise Mate',
        blurb: 'Cruise vacation companion · ports, packing, ledger',
        status: 'In development',
        theme: 'dark',
        art: 'cruise',
      },
      {
        name: 'Logbook',
        blurb: 'Home maintenance log',
        status: 'Coming 2027',
        theme: 'grey',
        art: 'logbook',
      },
    ],
  },
]

function StatusPill({ status, dark }: { status: Status; dark: boolean }) {
  const color =
    status === 'Live'
      ? '#34c759'
      : status.startsWith('Coming') || status === 'In development'
      ? '#ff9500'
      : 'rgb(var(--accent))'
  return (
    <div
      className="inline-flex self-center items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] mb-3.5"
      style={{
        background: dark ? '#2c2c2e' : 'rgb(var(--bg-2))',
        color: dark ? '#d2d2d7' : 'rgb(var(--ink-3))',
      }}
    >
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: color }}
      />
      {status}
    </div>
  )
}

function DiceArt() {
  const ds = [5, 2, 6]
  return (
    <div className="flex gap-2.5">
      {ds.map((n, i) => (
        <div
          key={i}
          className="flex items-center justify-center"
          style={{
            width: 80,
            height: 80,
            background: 'linear-gradient(180deg, #fff, #e8e8ed)',
            border: '1px solid rgb(var(--line-soft))',
            borderRadius: 14,
            fontSize: 44,
            fontWeight: 600,
            color: 'rgb(var(--ink))',
            transform: `translateY(${[12, 0, 12][i]}px) rotate(${[-5, 0, 5][i]}deg)`,
            boxShadow: '0 8px 24px -6px rgba(0,0,0,.15)',
          }}
        >
          {n}
        </div>
      ))}
    </div>
  )
}

function SantaArt() {
  return (
    <div
      className="text-left"
      style={{
        width: 320,
        background: '#fff',
        border: '1px solid rgb(var(--line-soft))',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 24px 48px -16px rgba(0,0,0,.18)',
        color: 'rgb(var(--ink))',
      }}
    >
      <div className="text-[11px] text-ink-3 mb-2.5 font-medium tracking-[0.06em]">
        YOUR DRAW · KEEP IT SECRET
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-2">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold"
          style={{ background: 'rgb(var(--accent))' }}
        >
          M
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium">You drew Marcus</div>
          <div className="text-[12px] text-ink-3">Wishlist · 4 items</div>
        </div>
        <span className="text-ink-3">›</span>
      </div>
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {['Books', 'Coffee', 'Vinyl', 'Hike'].map((t) => (
          <span
            key={t}
            className="text-[11px] px-2.5 py-1 rounded-full bg-bg-2 text-ink-2"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function CruiseArt() {
  return (
    <div
      className="text-left"
      style={{
        width: 320,
        background: '#1d1d1f',
        border: '1px solid #2c2c2e',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 24px 48px -16px rgba(0,0,0,.5)',
      }}
    >
      <div className="flex justify-between text-[12px] mb-2.5" style={{ color: '#a1a1a6' }}>
        <span>DAY 4 · CARIBBEAN</span>
        <span>72°F</span>
      </div>
      <div className="text-[22px] font-semibold text-white mb-1">Cozumel</div>
      <div className="text-[13px] mb-3.5" style={{ color: '#d2d2d7' }}>
        Aboard 7:00am · Ashore 8:30am
      </div>
      {[
        ['Snorkel tour', '9:30 AM · pier 4'],
        ['Local lunch', '12:30 PM · plaza'],
        ['All aboard', '4:30 PM'],
      ].map(([a, b]) => (
        <div
          key={a}
          className="flex justify-between text-[13px] text-white py-2"
          style={{ borderTop: '1px solid #2c2c2e' }}
        >
          <span>{a}</span>
          <span style={{ color: '#a1a1a6' }}>{b}</span>
        </div>
      ))}
    </div>
  )
}

function LogbookArt() {
  const items: [string, string, string][] = [
    ['Furnace filter', '14d ago', '#34c759'],
    ['Water heater flush', '3 weeks', '#ff9500'],
    ['Smoke alarm', 'Annual', 'rgb(var(--accent))'],
  ]
  return (
    <div
      className="text-left"
      style={{
        width: 320,
        background: '#fff',
        border: '1px solid rgb(var(--line-soft))',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 24px 48px -16px rgba(0,0,0,.18)',
      }}
    >
      {items.map(([t, d, c]) => (
        <div
          key={t}
          className="flex items-center gap-3 py-2.5"
          style={{ borderBottom: '1px solid rgb(var(--line-soft))' }}
        >
          <span
            className="rounded-full"
            style={{ width: 10, height: 10, background: c }}
          />
          <div className="flex-1">
            <div className="text-[14px] font-medium">{t}</div>
            <div className="text-[12px] text-ink-3">{d}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Tile({ app }: { app: App }) {
  const isDark = app.theme === 'dark'
  const bg = isDark
    ? 'rgb(var(--ink))'
    : app.theme === 'accent'
    ? 'rgb(var(--bg))'
    : 'rgb(var(--bg-3))'
  const fg = isDark ? '#fff' : 'rgb(var(--ink))'
  const sub2 = isDark ? '#a1a1a6' : 'rgb(var(--ink-2))'

  const inner = (
    <div
      className="flex flex-col text-center px-8 pt-10 rounded-[22px] overflow-hidden relative"
      style={{
        background: bg,
        color: fg,
        minHeight: 460,
        boxShadow: isDark ? 'none' : '0 1px 0 rgb(var(--line-soft))',
      }}
    >
      <StatusPill status={app.status} dark={isDark} />
      <h3
        className="font-semibold mb-2"
        style={{ fontSize: 36, letterSpacing: '-0.025em' }}
      >
        {app.name}.
      </h3>
      <p
        className="max-w-[360px] mx-auto mb-3.5"
        style={{ fontSize: 17, color: sub2 }}
      >
        {app.blurb}
      </p>
      <div className="flex gap-3.5 justify-center">
        <span
          className="link"
          style={{ color: isDark ? 'rgb(var(--accent-on-dark))' : 'rgb(var(--accent))' }}
        >
          {app.href ? 'Visit site ›' : 'Learn more ›'}
        </span>
      </div>
      <div className="flex-1 flex items-end justify-center pt-6">
        {app.art === 'dice' && <DiceArt />}
        {app.art === 'santa' && <SantaArt />}
        {app.art === 'cruise' && <CruiseArt />}
        {app.art === 'logbook' && <LogbookArt />}
      </div>
    </div>
  )

  return app.href ? (
    <a
      href={app.href}
      target="_blank"
      rel="noreferrer"
      className="block transition-transform hover:-translate-y-0.5"
    >
      {inner}
    </a>
  ) : (
    inner
  )
}

export default function Catalog() {
  return (
    <section id="catalog" className="bg-bg-2 px-6 pt-24 pb-6">
      <Reveal as="div" className="container-wide text-center mb-12">
        <div className="eyebrow text-[17px] mb-2">The Catalog</div>
        <h2 className="headline">Two shelves. One studio.</h2>
        <p className="tile-sub max-w-[640px] mx-auto mt-4 text-ink-2">
          Each app is built for one job and finished before it ships.
        </p>
      </Reveal>

      {rows.map((row) => (
        <Reveal as="div" key={row.category} className="container-wide mb-3">
          <div className="flex justify-between items-baseline px-1 pt-6 pb-4 flex-wrap gap-2">
            <div>
              <div
                className="text-[13px] font-medium uppercase mb-1"
                style={{ color: 'rgb(var(--accent))', letterSpacing: '0.02em' }}
              >
                {row.category}
              </div>
              <div className="text-[22px] font-semibold text-ink tracking-[-0.018em]">
                {row.sub}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {row.apps.map((a) => (
              <Tile key={a.name} app={a} />
            ))}
          </div>
        </Reveal>
      ))}

      <Reveal as="div" className="container-wide mt-3">
        <div
          className="bg-bg rounded-[22px] py-14 px-8 text-center"
          style={{ border: '1px dashed rgb(var(--line))' }}
        >
          <div className="eyebrow text-[17px] mb-2">And more</div>
          <h3
            className="font-semibold mb-2 mx-auto"
            style={{ fontSize: 32, letterSpacing: '-0.025em' }}
          >
            The shelf is still being built.
          </h3>
          <p className="text-[17px] text-ink-2 max-w-[520px] mx-auto mb-4">
            New games and lifestyle apps are in the pipeline. Drop us a line
            and we&apos;ll let you know when they ship.
          </p>
          <a href="mailto:hello@clarendon.dev?subject=Keep%20me%20posted" className="link">
            Email the studio ›
          </a>
        </div>
      </Reveal>
    </section>
  )
}
