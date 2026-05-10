import Reveal from './Reveal'

const dice: number[] = [3, 5, 1, 6, 2]

export default function FeaturedRolligan() {
  return (
    <Reveal className="bg-bg pt-10 px-6 text-center overflow-hidden">
      <div
        className="eyebrow font-medium mb-2"
        style={{ color: 'rgb(var(--accent))' }}
      >
        Featured · Game 001
      </div>
      <h3 className="tile-title mb-3">Rolligan.</h3>
      <p className="tile-sub max-w-[640px] mx-auto text-ink">
        A dice party game built for the actual living room. Push your luck. Or
        don&apos;t.
      </p>
      <div className="flex gap-4 justify-center mt-4 flex-wrap">
        <a
          href="https://rolligan.com"
          target="_blank"
          rel="noreferrer"
          className="link"
        >
          Learn more ›
        </a>
        <a
          href="https://rolligan.com"
          target="_blank"
          rel="noreferrer"
          className="btn-pill btn-fill"
        >
          Open Rolligan
        </a>
      </div>
      <div className="h-[420px] sm:h-[560px] lg:h-[700px] flex items-end justify-center relative mt-6">
        <div className="relative flex items-end justify-center gap-3 sm:gap-5">
          {dice.map((n, i) => {
            const isCenter = i === 2
            return (
              <div
                key={i}
                className={`die-${i + 1}`}
                style={{
                  width: isCenter ? 220 : 160,
                  height: isCenter ? 220 : 160,
                  background: isCenter
                    ? 'linear-gradient(180deg, #fff 0%, #e8e8ed 100%)'
                    : 'linear-gradient(180deg, #f5f5f7 0%, #d8d8de 100%)',
                  border: '1px solid rgb(var(--line-soft))',
                  borderRadius: isCenter ? 36 : 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isCenter ? 120 : 80,
                  fontWeight: 600,
                  color: 'rgb(var(--ink))',
                  letterSpacing: '-0.04em',
                  boxShadow: isCenter
                    ? '0 30px 60px -10px rgba(0,0,0,.18), 0 8px 16px -8px rgba(0,0,0,.1)'
                    : '0 12px 32px -8px rgba(0,0,0,.1)',
                }}
              >
                {n}
              </div>
            )
          })}
        </div>
      </div>
    </Reveal>
  )
}
