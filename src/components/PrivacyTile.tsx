import Reveal from './Reveal'

const items: [string, string][] = [
  ['No tracking', 'Zero third-party SDKs.'],
  ['No accounts', 'Use the app, not the service.'],
  ['On device', 'Your data, on your device.'],
]

export default function PrivacyTile() {
  return (
    <Reveal className="bg-bg relative overflow-hidden">
      <div className="min-h-[620px] flex flex-col items-center pt-14 px-6 text-center">
        <div className="eyebrow mb-2">Privacy</div>
        <h3 className="tile-title mb-3 max-w-[820px]">
          What happens on your phone, stays on your phone.
        </h3>
        <p className="tile-sub max-w-[640px] text-ink">
          Empty privacy nutrition label. No third-party SDKs. No analytics. The
          way it should be.
        </p>
        <div className="flex gap-4 justify-center mt-4">
          <a href="/privacy" className="link">
            How we think about privacy ›
          </a>
        </div>

        <div className="flex-1 flex items-end justify-center mt-12 self-stretch">
          <div className="flex gap-10 sm:gap-16 items-end flex-wrap justify-center">
            {items.map(([t, d]) => (
              <div key={t} className="text-center max-w-[220px]">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3.5"
                  style={{
                    background: 'rgb(var(--bg))',
                    border: '1px solid rgb(var(--line-soft))',
                    boxShadow: '0 6px 16px -4px rgba(0,0,0,.08)',
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgb(var(--accent))"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6l8-3z" />
                  </svg>
                </div>
                <div className="text-[19px] font-semibold mb-1">{t}</div>
                <div className="text-[15px] text-ink-2">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  )
}
