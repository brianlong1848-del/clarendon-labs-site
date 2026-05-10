import Link from 'next/link'

const stats: [string, string][] = [
  ['EST.', '2025'],
  ['HQ', 'Chicago, IL'],
  ['SHIPPED', '01 / planned 04'],
]

const milestones: [string, string][] = [
  ['done', 'Core dice mechanics'],
  ['done', 'Pass-and-play UX'],
  ['done', '5 visual themes'],
  ['done', 'Sound &amp; haptics polish'],
  ['done', 'Released on the App Store'],
]

const queued: [string, string][] = [
  ['LOG', 'Home logbook · concept'],
  ['WEEK', 'Week planner · design'],
  ['CARD', 'Untitled card game · playtest'],
]

export default function Hero() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] border-b border-line">
      {/* Left — headline + intro */}
      <div className="px-8 py-16 lg:py-[72px] lg:border-r border-line">
        <div className="flex flex-wrap gap-2 mb-7">
          <span className="chip">
            <span className="dot" /> Now hiring · 0 open roles
          </span>
          <span className="chip">v2026.05 · Spring</span>
        </div>
        <h1 className="text-[3.5rem] sm:text-[4.5rem] lg:text-[5.25rem] leading-[0.95] mb-7">
          Small studio.
          <br />
          <span className="accent-text">Software</span> built like furniture.
        </h1>
        <p className="text-[18px] leading-[1.55] text-mute max-w-[560px] mb-8">
          Clarendon Labs is an independent iOS studio in Chicago. We build a
          short list of useful apps — games, home tools, and daily utilities —
          and we ship one at a time, when each one is finished.
        </p>
        <div className="flex flex-wrap gap-2.5 mb-10">
          <Link href="/#catalog" className="btn btn-primary">
            View the catalog <span className="ascii">→</span>
          </Link>
          <Link href="/#manifesto" className="btn btn-ghost">
            Read the manifesto
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-5 pt-8 border-t border-line">
          {stats.map(([k, v]) => (
            <div key={k}>
              <div className="micro mb-1.5">{k}</div>
              <div className="mono text-[22px] text-ink">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — currently shipping card */}
      <div className="grid-bg px-8 py-8 relative">
        <div className="micro mb-3.5">{"// "}CURRENTLY ON THE STORE</div>
        <div className="card p-6 mb-3.5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-14 h-14 rounded-[14px] bg-ink flex items-center justify-center"
              aria-hidden
            >
              <span
                className="mono text-[22px] font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                $
              </span>
            </div>
            <div>
              <div className="text-[22px] font-medium tracking-[-0.02em]">
                Rolligan
              </div>
              <div className="mono text-[12px] text-mute">
                com.clarendon.rolligan · iOS 17+
              </div>
            </div>
          </div>
          <div className="flex justify-between mb-1.5">
            <span className="micro">
              <b>Build status</b>
            </span>
            <span className="mono text-[12px]">100% · live</span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden mb-[18px]"
            style={{ background: 'rgb(var(--bg-2))' }}
          >
            <div
              className="h-full"
              style={{ width: '100%', background: 'var(--accent)' }}
            />
          </div>
          <ul className="flex flex-col gap-2">
            {milestones.map(([s, t]) => (
              <li
                key={t}
                className="mono flex items-center gap-2.5 text-[12.5px]"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[3px] inline-flex items-center justify-center text-[10px]"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  {s === 'done' ? '✓' : ''}
                </span>
                <span
                  className="text-mute line-through"
                  dangerouslySetInnerHTML={{ __html: t }}
                />
              </li>
            ))}
          </ul>
          <a
            href="https://rolligan.com"
            target="_blank"
            rel="noreferrer"
            className="btn btn-accent mt-5 w-full justify-center"
          >
            Open rolligan.com <span className="ascii">↗</span>
          </a>
        </div>
        <div className="micro mb-2 mt-6">{"// "}QUEUED</div>
        {queued.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between py-2.5 border-b border-dashed border-line"
          >
            <span className="mono text-[12.5px]">
              <span className="text-mute">[{k}]</span> {v}
            </span>
            <span className="mono text-[11px] text-mute">—</span>
          </div>
        ))}
      </div>
    </section>
  )
}
