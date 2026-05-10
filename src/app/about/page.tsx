import Nav from '@/components/Nav'
import Ribbon from '@/components/Ribbon'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'About — Clarendon Labs',
  description:
    'Clarendon Labs is an independent iOS studio in Chicago, founded by Brian Long.',
}

const stats: [string, string, string][] = [
  ['2025', 'Year founded', 'Registered as Clarendon Labs LLC, State of Illinois.'],
  ['Chicago, IL', 'Headquarters', 'Uptown neighborhood. Mostly remote.'],
  ['01', 'Headcount', 'One engineer. Hello.'],
]

export default function About() {
  return (
    <main>
      <Ribbon />
      <Nav active="About" />

      <section className="bg-bg px-6 pt-24 pb-16 text-center">
        <div className="eyebrow mb-2">About Clarendon</div>
        <h1
          className="display max-w-[880px] mx-auto mb-4"
          style={{ fontSize: 'clamp(40px, 7vw, 72px)' }}
        >
          Software made the way
          <br />
          we&apos;d want to use it.
        </h1>
        <p className="lede max-w-[720px] mx-auto text-ink-2">
          Clarendon Labs is an independent iOS studio in Chicago, founded by
          Brian Long. One person designs, builds, and supports every product.
          The benefit: nothing ships unless one person is proud of it.
        </p>
      </section>

      <section className="bg-bg-2 px-6 py-16">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.map(([v, k, d]) => (
            <div key={k} className="bg-bg p-8 rounded-[18px]">
              <div className="eyebrow">{k}</div>
              <div
                className="font-semibold my-2.5"
                style={{ fontSize: 56, letterSpacing: '-0.035em' }}
              >
                {v}
              </div>
              <p className="text-[15px] text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-bg px-6 py-24">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          <div>
            <div className="eyebrow mb-2">Origin</div>
            <h2
              className="mb-4"
              style={{ fontSize: 36, letterSpacing: '-0.025em' }}
            >
              Why &ldquo;Clarendon&rdquo;.
            </h2>
            <p className="text-[18px] text-ink-2 leading-[1.55]">
              The name comes from a street in Chicago&apos;s Uptown
              neighborhood — practical, unpretentious, hundred-plus years old.
              The studio aims for the same: utilitarian work, made well, that
              earns its place over time. Naming a company after a street felt
              more honest than another portmanteau.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Thesis</div>
            <h2
              className="mb-4"
              style={{ fontSize: 36, letterSpacing: '-0.025em' }}
            >
              Why a small company.
            </h2>
            <p className="text-[18px] text-ink-2 leading-[1.55]">
              Most great software is made by small, opinionated teams that
              answer to themselves. We&apos;re trying to be one of those. No
              outside investors, no roadmap pressure, no growth team. Apps go
              out the door when they&apos;re finished — not on a quarter.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-bg-2 px-6 py-20 md:py-24">
        <div className="container-narrow text-center">
          <div className="eyebrow text-[19px] mb-2">Get in touch</div>
          <h2 className="headline mb-6">
            Email goes to a person. The person writes back.
          </h2>
          <p className="text-[19px] text-ink-2 max-w-[560px] mx-auto mb-6">
            For press, partnerships, or to say hi: hello@clarendon.dev
          </p>
          <a href="mailto:hello@clarendon.dev" className="btn-pill btn-fill">
            Email the studio
          </a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
