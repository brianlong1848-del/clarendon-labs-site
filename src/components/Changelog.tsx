import Reveal from './Reveal'

const entries: [string, string, string][] = [
  [
    'May 4, 2026',
    'Rolligan ships',
    'Live on the App Store. Pass-and-play, 2 to 8, no accounts, no subscriptions.',
  ],
  [
    'Apr 18, 2026',
    'Cruise Mate enters development',
    'Concept work locked. Targeting an open beta later this year.',
  ],
  [
    'Apr 1, 2026',
    'Secret Santa scoped',
    'Anonymous gift exchange organizer. Aiming for the December gifting season.',
  ],
]

export default function Changelog() {
  return (
    <Reveal id="changelog" className="bg-bg-2 px-6 py-20">
      <div className="container-narrow grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-10 md:gap-14 items-start">
        <div>
          <div className="eyebrow mb-2">The Newsroom</div>
          <h2 className="headline" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>
            Build notes from the workshop.
          </h2>
          <a
            href="mailto:hello@clarendon.dev?subject=Subscribe"
            className="link inline-flex mt-5"
          >
            Subscribe to updates ›
          </a>
        </div>
        <div className="flex flex-col">
          {entries.map(([d, t, body], i, arr) => (
            <div
              key={t}
              className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-3 md:gap-8 py-6"
              style={{
                borderBottom:
                  i < arr.length - 1
                    ? '1px solid rgb(var(--line-soft))'
                    : 'none',
              }}
            >
              <span className="text-[14px] text-ink-3">{d}</span>
              <div>
                <div
                  className="font-semibold mb-1"
                  style={{ fontSize: 21, letterSpacing: '-0.013em' }}
                >
                  {t}
                </div>
                <p className="text-[15px] text-ink-2 leading-[1.5]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  )
}
