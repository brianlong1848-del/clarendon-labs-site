export default function Apps() {
  return (
    <section
      id="apps"
      className="relative section-divider py-24 md:py-32 px-6"
    >
      <div className="ambient-glow-soft" aria-hidden />

      <div className="max-w-[1180px] mx-auto relative">
        <p className="tracker mb-6">01 — Apps</p>
        <h2 className="font-display font-black text-ink leading-[1.02] tracking-[-0.005em] text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] mb-5 uppercase max-w-[18ch]">
          Built for real life.
        </h2>
        <p className="text-ink-mid text-lg leading-relaxed max-w-[52ch] mb-14">
          Games, home tools, and everyday utilities — designed to be the best
          version of what they are.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Rolligan card */}
          <a
            href="https://rolligan.com"
            target="_blank"
            rel="noreferrer"
            className="group relative rounded-[20px] border border-rule bg-white/[0.03] hover:bg-white/[0.06] hover:border-rule-strong transition-all duration-300 p-7 md:p-8 overflow-hidden hover:-translate-y-1"
          >
            <div
              className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-60 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(255, 107, 53, 0.18), transparent 65%)',
              }}
              aria-hidden
            />

            <div className="relative">
              {/* Rolligan mark — orange tile with mint dice pips */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background:
                    'linear-gradient(150deg, #FF8556 0%, #FF6B35 60%, #D9501F 100%)',
                  boxShadow:
                    '0 12px 24px -12px rgba(255, 107, 53, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                  <circle cx="10" cy="16" r="4.5" fill="#4ECDC4" />
                  <circle cx="22" cy="10" r="3.5" fill="#FFFFFF" opacity="0.95" />
                  <circle cx="22" cy="22" r="3.5" fill="#FFFFFF" opacity="0.95" />
                </svg>
              </div>

              <div className="flex items-baseline gap-3 mb-2">
                <h3 className="text-2xl font-bold text-ink tracking-tight">
                  Rolligan
                </h3>
                <span
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.18em] uppercase rounded-full px-2.5 py-1"
                  style={{
                    color: '#4ECDC4',
                    background: 'rgba(78, 205, 196, 0.1)',
                    border: '1px solid rgba(78, 205, 196, 0.4)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: '#4ECDC4',
                      boxShadow: '0 0 0 3px rgba(78, 205, 196, 0.25)',
                    }}
                  />
                  Live
                </span>
              </div>

              <p className="text-ink-mid text-[0.95rem] leading-relaxed mb-6 max-w-[42ch]">
                A push-your-luck dice party game that turns any living room
                into a scene. Risk it all or bank your points — the tension is
                the whole point.
              </p>

              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mid group-hover:text-ink transition-colors">
                rolligan.com
                <span
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden
                >
                  →
                </span>
              </span>
            </div>
          </a>

          {/* More on the way card */}
          <div className="group relative rounded-[20px] border border-rule bg-white/[0.02] p-7 md:p-8 overflow-hidden">
            <div
              className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-50 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(110, 120, 214, 0.10), transparent 65%)',
              }}
              aria-hidden
            />

            <div className="relative">
              {/* Neutral grayscale mark — 4 squares */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background:
                    'linear-gradient(150deg, #2C2C38 0%, #1A1A22 60%, #0F0F15 100%)',
                  boxShadow:
                    '0 12px 24px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="8" y="8" width="7" height="7" rx="2" fill="#FFFFFF" opacity="0.25" />
                  <rect x="17" y="8" width="7" height="7" rx="2" fill="#FFFFFF" opacity="0.4" />
                  <rect x="8" y="17" width="7" height="7" rx="2" fill="#FFFFFF" opacity="0.4" />
                  <rect x="17" y="17" width="7" height="7" rx="2" fill="#FFFFFF" opacity="0.7" />
                </svg>
              </div>

              <div className="flex items-baseline gap-3 mb-2">
                <h3 className="text-2xl font-bold text-ink tracking-tight">
                  More on the way
                </h3>
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.18em] uppercase rounded-full px-2.5 py-1 text-ink-dim border border-rule-strong bg-white/[0.03]">
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-dim" />
                  In development
                </span>
              </div>

              <p className="text-ink-mid text-[0.95rem] leading-relaxed mb-6 max-w-[42ch]">
                Home management, daily routines, group coordination — we&apos;re
                building across all the categories where good software is still
                rare.
              </p>

              <span className="text-sm font-semibold text-ink-dim">
                Stay tuned.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
