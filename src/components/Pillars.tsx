type Principle = [string, string, string]

const principles: Principle[] = [
  ['01', 'One job per app', 'We don’t bolt features onto things. Each app is good at exactly one thing.'],
  ['02', 'No subscriptions', 'Pay once. Or nothing. Never a tax on basic features.'],
  ['03', 'No data harvesting', 'Your stuff stays on your device unless something specific requires otherwise.'],
  ['04', 'No engagement tricks', 'Notifications are rare and useful. We don’t want you here longer than you need.'],
  ['05', 'Native first', 'Built in Swift, for the platform. No web shells.'],
  ['06', 'Slow by design', 'We ship one app at a time, when it’s ready, not on a quarter.'],
  ['07', 'Honest copy', 'We write like a person. We don’t use the word “powerful.”'],
  ['08', 'Replies from the founder', 'Email goes to a person. The person writes back.'],
]

export default function Pillars() {
  return (
    <section
      id="manifesto"
      className="px-8 py-12 lg:py-14 border-t border-b border-line"
    >
      <span className="micro">{"// "}02 — Operating principles</span>
      <h2 className="text-[40px] mt-2 mb-8">How we work, in eight lines.</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-line rounded-lg overflow-hidden">
        {principles.map(([n, t, d], i) => (
          <div
            key={n}
            className="p-6 border-line"
            style={{
              borderRightWidth: i % 4 !== 3 ? 1 : 0,
              borderBottomWidth: i < 4 ? 1 : 0,
            }}
          >
            <span
              className="mono text-[12px] px-1.5 py-0.5 rounded"
              style={{
                color: 'var(--accent-ink)',
                background: 'var(--accent)',
              }}
            >
              §{n}
            </span>
            <h3 className="text-[18px] font-medium mt-3.5 mb-2">{t}</h3>
            <p className="text-[13px] text-mute leading-[1.55]">{d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
