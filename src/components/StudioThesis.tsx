import Reveal from './Reveal'

const stats: [string, string][] = [
  ['100%', 'Native Swift'],
  ['$0', 'Subscriptions'],
  ['0', 'Trackers'],
  ['1', 'Engineer'],
]

export default function StudioThesis() {
  return (
    <Reveal className="bg-dark text-on-dark relative overflow-hidden">
      <div className="min-h-[680px] flex flex-col items-center pt-14 px-6 text-center">
        <div className="eyebrow mb-2 text-[17px]" style={{ color: '#a1a1a6' }}>
          The Studio
        </div>
        <h3 className="tile-title mb-3 text-white">One person. Every line.</h3>
        <p
          className="tile-sub max-w-[640px]"
          style={{ color: '#d2d2d7' }}
        >
          Designed, built, and supported by the same engineer. The benefit:
          nothing ships unless we&apos;re proud of it.
        </p>
        <div className="flex gap-4 mt-4">
          <a href="/about" className="link link-on-dark">
            Read about the studio ›
          </a>
        </div>
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px w-full max-w-[880px] mt-12 mb-0 self-end"
          style={{ marginTop: 'auto' }}
        >
          {stats.map(([n, t]) => (
            <div key={t} className="px-4 py-6 text-center">
              <div
                className="font-semibold tracking-tight text-white"
                style={{
                  fontSize: 56,
                  letterSpacing: '-0.035em',
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {n}
              </div>
              <div className="text-[14px] mt-1" style={{ color: '#a1a1a6' }}>
                {t}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  )
}
