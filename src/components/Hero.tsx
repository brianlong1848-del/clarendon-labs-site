import Link from 'next/link'

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28 md:min-h-[88vh] flex items-center">
      <div className="ambient-glow-tl" aria-hidden />

      <div className="max-w-[1180px] mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-16 items-center">
        {/* Left column */}
        <div className="relative z-10">
          <p className="tracker mb-6">An independent app studio</p>

          <h1 className="font-display font-black text-ink leading-[0.86] tracking-[-0.015em] text-[4.25rem] sm:text-[5.5rem] md:text-[7rem] lg:text-[7.5rem] mb-7 uppercase">
            Apps for<br />real life.
          </h1>

          <p className="text-ink-mid text-lg md:text-xl leading-relaxed max-w-[34ch] mb-10 font-medium">
            Chicago-based. We make games, home tools, and everyday utilities —
            one well-made app at a time.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/#apps"
              className="inline-flex items-center justify-center gap-2 bg-accent text-bg rounded-full px-7 py-3.5 text-sm font-bold tracking-wide hover:brightness-110 transition-[filter,transform] active:translate-y-px"
            >
              See our apps
              <span aria-hidden>↓</span>
            </Link>
            <a
              href="mailto:hello@clarendon.dev"
              className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-bold tracking-wide border border-accent/70 text-accent hover:bg-accent/10 transition-colors"
            >
              Get in touch
            </a>
          </div>
        </div>

        {/* Right column — floating app tiles */}
        <div className="relative w-full max-w-[520px] mx-auto lg:max-w-none lg:mx-0 aspect-[10/11]">
          <HeroTiles />
        </div>
      </div>
    </section>
  )
}

function HeroTiles() {
  return (
    <svg
      viewBox="0 0 480 540"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-label="Floating cluster of app tiles representing the studio's projects"
      style={{ filter: 'drop-shadow(0 30px 60px rgba(0, 0, 0, 0.55))' }}
    >
      <defs>
        {/* Gloss + tile gradients */}
        <linearGradient id="glossNeutral" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A2A36" />
          <stop offset="55%" stopColor="#1B1B25" />
          <stop offset="100%" stopColor="#101018" />
        </linearGradient>
        <linearGradient id="glossLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3A3A48" />
          <stop offset="60%" stopColor="#23232E" />
          <stop offset="100%" stopColor="#15151D" />
        </linearGradient>
        <linearGradient id="glossAccent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B95E6" />
          <stop offset="55%" stopColor="#6E78D6" />
          <stop offset="100%" stopColor="#4A52A8" />
        </linearGradient>
        <linearGradient id="glossDeep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E1E28" />
          <stop offset="100%" stopColor="#0A0A10" />
        </linearGradient>
        <linearGradient id="highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Soft glow halo behind cluster */}
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#6E78D6" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#6E78D6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient halo */}
      <ellipse cx="240" cy="280" rx="220" ry="200" fill="url(#halo)" />

      {/* Background depth tile */}
      <g className="tile tile-e" opacity="0.35" transform="translate(310 30) rotate(10)">
        <rect width="120" height="150" rx="20" fill="url(#glossDeep)" />
        <rect width="120" height="56" rx="20" fill="url(#highlight)" />
      </g>

      {/* Background depth tile, lower-left */}
      <g className="tile tile-d" opacity="0.45" transform="translate(20 360) rotate(-9)">
        <rect width="130" height="160" rx="20" fill="url(#glossDeep)" />
        <rect width="130" height="56" rx="20" fill="url(#highlight)" />
        <circle cx="65" cy="105" r="18" fill="#FFFFFF" opacity="0.06" />
      </g>

      {/* Tile A — top left, neutral gloss with list glyph */}
      <g className="tile tile-a" transform="translate(60 60) rotate(-6)">
        <rect width="180" height="220" rx="26" fill="url(#glossNeutral)" stroke="#FFFFFF" strokeOpacity="0.06" />
        <rect x="0.5" y="0.5" width="179" height="80" rx="25.5" fill="url(#highlight)" />
        {/* glyph: stacked bars (a list / app rows) */}
        <g transform="translate(34 110)">
          <rect width="112" height="10" rx="5" fill="#FFFFFF" opacity="0.85" />
          <rect y="22" width="86" height="10" rx="5" fill="#FFFFFF" opacity="0.55" />
          <rect y="44" width="68" height="10" rx="5" fill="#FFFFFF" opacity="0.35" />
          <rect y="66" width="92" height="10" rx="5" fill="#FFFFFF" opacity="0.25" />
        </g>
      </g>

      {/* Tile B — top right, studio accent with circle/pulse glyph */}
      <g className="tile tile-b" transform="translate(255 95) rotate(5)">
        <rect width="180" height="220" rx="26" fill="url(#glossAccent)" stroke="#FFFFFF" strokeOpacity="0.12" />
        <rect x="0.5" y="0.5" width="179" height="80" rx="25.5" fill="url(#highlight)" />
        {/* glyph: concentric play/now disc */}
        <g transform="translate(90 130)">
          <circle r="44" fill="#FFFFFF" opacity="0.1" />
          <circle r="30" fill="#FFFFFF" opacity="0.18" />
          <circle r="16" fill="#FFFFFF" opacity="0.95" />
        </g>
        {/* tag dot */}
        <circle cx="158" cy="22" r="5" fill="#FFFFFF" opacity="0.9" />
      </g>

      {/* Tile C — bottom left, dark with grid glyph */}
      <g className="tile tile-c" transform="translate(75 305) rotate(-3)">
        <rect width="170" height="190" rx="24" fill="url(#glossLight)" stroke="#FFFFFF" strokeOpacity="0.07" />
        <rect x="0.5" y="0.5" width="169" height="70" rx="23.5" fill="url(#highlight)" />
        {/* glyph: 3x3 grid of dots */}
        <g transform="translate(40 102)">
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <circle
                key={`${row}-${col}`}
                cx={col * 26}
                cy={row * 26}
                r="6"
                fill="#FFFFFF"
                opacity={0.25 + ((row + col) % 3) * 0.25}
              />
            ))
          )}
        </g>
      </g>

      {/* Tile D — bottom right, glossy with chevron */}
      <g className="tile tile-d" transform="translate(265 335) rotate(8)">
        <rect width="160" height="180" rx="24" fill="url(#glossNeutral)" stroke="#FFFFFF" strokeOpacity="0.06" />
        <rect x="0.5" y="0.5" width="159" height="66" rx="23.5" fill="url(#highlight)" />
        {/* glyph: spark / 4-point */}
        <g transform="translate(80 105)">
          <path
            d="M0 -28 L6 -6 L28 0 L6 6 L0 28 L-6 6 L-28 0 L-6 -6 Z"
            fill="#FFFFFF"
            opacity="0.92"
          />
        </g>
        {/* small accent dot */}
        <circle cx="22" cy="22" r="4" fill="#6E78D6" />
      </g>
    </svg>
  )
}
