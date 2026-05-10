import Nav from '@/components/Nav'
import Ribbon from '@/components/Ribbon'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Support — Clarendon Labs',
  description:
    'Email goes directly to the engineer. Replies typically inside one business day.',
}

const tiles: [string, string, string, string][] = [
  [
    'Get help by email',
    'hello@clarendon.dev',
    'Direct line to the founder.',
    'mailto:hello@clarendon.dev',
  ],
  [
    'System status',
    'All systems operational',
    'Last incident: never.',
    '/',
  ],
  [
    'Report a bug',
    'File a structured report',
    'Template to fill out.',
    'mailto:hello@clarendon.dev?subject=Bug%20report&body=What%20happened%3A%0A%0AWhat%20you%20expected%3A%0A%0AiOS%20version%3A%0A%0ADevice%3A%0A%0AScreenshot%20attached%3A',
  ],
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
    'Yes. Every email is read by the engineer who built the app. We can&apos;t promise everything, but we read everything.',
  ],
  [
    'Are you hiring?',
    'Not currently. If you&apos;re an iOS engineer in Chicago, say hello anyway.',
  ],
  [
    'Do you take consulting work?',
    'No. Heads-down on the catalog.',
  ],
  [
    'Where can I follow updates?',
    'Watch the changelog on the home page or email the studio to be added to the (very) occasional update list.',
  ],
]

export default function Support() {
  return (
    <main>
      <Ribbon />
      <Nav active="Support" />

      <section className="bg-bg px-6 pt-24 pb-12 text-center">
        <div className="eyebrow text-[19px] mb-2">Clarendon Support</div>
        <h1 className="display mb-3.5">How can we help?</h1>
        <p className="lede max-w-[720px] mx-auto text-ink-2">
          Email goes directly to the engineer. Replies typically inside one
          business day.
        </p>
      </section>

      <section className="bg-bg px-6 pb-20">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-3 gap-3">
          {tiles.map(([t, k, d, h]) => (
            <a
              key={t}
              href={h}
              className="bg-bg-2 rounded-[18px] p-8 block transition-transform hover:-translate-y-0.5"
            >
              <h3
                className="font-semibold mb-1.5"
                style={{ fontSize: 24, letterSpacing: '-0.022em' }}
              >
                {t}
              </h3>
              <div className="text-[17px] mb-2.5" style={{ color: 'rgb(var(--accent))' }}>
                {k}
              </div>
              <p className="text-[15px] text-ink-2">{d}</p>
              <div className="mt-4" style={{ color: 'rgb(var(--accent))' }}>
                Continue ›
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="bg-bg-2 px-6 py-20 md:py-24">
        <div className="container-narrow">
          <div className="eyebrow text-[19px] mb-2 text-center">
            Frequently asked
          </div>
          <h2 className="headline mb-10 text-center">Common questions.</h2>
          <div className="bg-bg rounded-[18px] overflow-hidden">
            {faqs.map(([q, a], i, arr) => (
              <details
                key={q}
                className="px-7 py-5"
                style={{
                  borderBottom:
                    i < arr.length - 1
                      ? '1px solid rgb(var(--line-soft))'
                      : 'none',
                }}
              >
                <summary
                  className="flex justify-between items-center cursor-pointer"
                  style={{
                    listStyle: 'none',
                    fontSize: 19,
                    fontWeight: 500,
                    letterSpacing: '-0.013em',
                  }}
                >
                  <span>{q}</span>
                  <span className="text-ink-3">+</span>
                </summary>
                <p
                  className="text-[17px] text-ink-2 leading-[1.55] mt-3.5 max-w-[800px]"
                  dangerouslySetInnerHTML={{ __html: a }}
                />
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
