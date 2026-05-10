import Nav from '@/components/Nav'
import StatusBar from '@/components/StatusBar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Support — Clarendon Labs',
  description:
    'Email goes directly to the founder. Replies typically inside one business day.',
}

const tiles: [string, string, string, string][] = [
  ['↗', 'Email', 'hello@clarendon.dev', 'mailto:hello@clarendon.dev'],
  ['◐', 'Status', 'All systems operational', '/'],
  ['☰', 'Bug report', 'Send a structured report', 'mailto:hello@clarendon.dev?subject=Bug%20report'],
]

const faqs: [string, string][] = [
  [
    'How do I report a bug?',
    'Email hello@clarendon.dev with what you saw, what you expected, your iOS version, and the device. Screenshots help. We aim to respond within one business day.',
  ],
  [
    'Will Rolligan come to Android?',
    'We&apos;re an iOS-only studio. No Android plans. We&apos;d rather ship one platform well than two platforms poorly.',
  ],
  [
    'Can I request a feature?',
    'Yes. Every email is read by the person who built the app. We can&apos;t promise everything, but we read everything.',
  ],
  [
    'Are you hiring?',
    'Not currently. If you&apos;re an iOS engineer in Chicago, say hi anyway.',
  ],
  [
    'Do you take consulting work?',
    'No. Heads-down on the catalog.',
  ],
  [
    'Where can I follow updates?',
    'The changelog on the home page, or email the founder and ask to be on the (very) occasional update list.',
  ],
]

export default function Support() {
  return (
    <main>
      <StatusBar />
      <Nav active="Support" />

      <section className="px-8 py-14 border-b border-line">
        <span className="micro">{"// "}support</span>
        <h1 className="text-[3rem] sm:text-[3.5rem] mt-3 mb-4">
          How can we help?
        </h1>
        <p className="text-[17px] text-mute max-w-[640px]">
          Email goes directly to the founder. Replies typically inside one
          business day. Faster if it&apos;s a real bug.
        </p>
      </section>

      <section className="px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiles.map(([ic, t, d, h]) => (
          <a
            key={t}
            href={h}
            className="card p-5 block hover:bg-bg-2 transition-colors"
          >
            <div className="flex items-center justify-between mb-3.5">
              <span
                className="ascii text-[20px]"
                style={{ color: 'var(--accent-text)' }}
              >
                {ic}
              </span>
              <span className="ascii text-[14px] text-mute">→</span>
            </div>
            <div className="text-[18px] font-medium mb-1">{t}</div>
            <div className="mono text-[12.5px] text-mute">{d}</div>
          </a>
        ))}
      </section>

      <section className="px-8 pt-6 pb-16">
        <span className="micro">{"// "}frequently asked</span>
        <h2 className="text-[28px] mt-2 mb-5">Common questions.</h2>
        <div className="card">
          {faqs.map(([q, a], i, arr) => (
            <details
              key={q}
              className="px-6 py-[18px]"
              style={{
                borderBottom:
                  i < arr.length - 1 ? '1px solid rgb(var(--line))' : 'none',
              }}
            >
              <summary
                className="flex justify-between items-center cursor-pointer"
                style={{ listStyle: 'none' }}
              >
                <span className="text-[16px] font-medium">{q}</span>
                <span className="mono ascii text-[14px] text-mute">+</span>
              </summary>
              <p
                className="text-[14px] text-mute leading-[1.65] mt-3 max-w-[720px]"
                dangerouslySetInnerHTML={{ __html: a }}
              />
            </details>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  )
}
