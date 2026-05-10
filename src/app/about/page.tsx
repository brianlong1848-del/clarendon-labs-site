import Nav from '@/components/Nav'
import StatusBar from '@/components/StatusBar'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'About — Clarendon Labs',
  description:
    'Clarendon Labs is a single-person iOS studio in Chicago, founded by Brian Long.',
}

export default function About() {
  return (
    <main>
      <StatusBar />
      <Nav active="About" />

      <section className="px-8 pt-14 pb-8 border-b border-line">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-14 items-start">
          <div>
            <span className="micro">{"// "}the studio</span>
            <h1 className="text-[3rem] sm:text-[4rem] mt-3 mb-5 leading-[1]">
              One person.
              <br />
              One workbench.
            </h1>
            <p className="text-[17px] leading-[1.6] text-ink-2 mb-6">
              Clarendon Labs is a single-person iOS studio in Chicago, founded
              by Brian Long. The benefit is that every line of code is written
              by someone who&apos;s also going to answer your support email.
              The drawback is that we ship slowly. We have decided this is the
              right trade.
            </p>
            <div className="flex gap-2.5 flex-wrap">
              <a href="mailto:hello@clarendon.dev" className="btn btn-primary">
                Email the founder
              </a>
              <a
                href="https://rolligan.com"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                See what we ship
              </a>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="placeholder aspect-[4/3]">
              <span className="ph-label">FOUNDER · BRIAN LONG · 4:3 PHOTO</span>
            </div>
            <div className="p-5 border-t border-line grid grid-cols-3 gap-4">
              <div>
                <div className="micro">FOUNDED</div>
                <div className="mono text-[18px] mt-1">2025</div>
              </div>
              <div>
                <div className="micro">HEADCOUNT</div>
                <div className="mono text-[18px] mt-1">01</div>
              </div>
              <div>
                <div className="micro">TIMEZONE</div>
                <div className="mono text-[18px] mt-1">UTC−6</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-8 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <span className="micro">{"// "}origin</span>
            <h2 className="text-[28px] mt-2 mb-4">Why “Clarendon”.</h2>
            <p className="text-[15px] text-mute leading-[1.65]">
              The name comes from a street in Chicago&apos;s Uptown
              neighborhood. It&apos;s practical, unpretentious, and has been
              there for a hundred years. The studio aims for the same:
              utilitarian work, made well, that earns its place. Naming a
              software business after a street felt more honest than another
              portmanteau.
            </p>
          </div>
          <div>
            <span className="micro">{"// "}thesis</span>
            <h2 className="text-[28px] mt-2 mb-4">Why a small studio.</h2>
            <p className="text-[15px] text-mute leading-[1.65]">
              Most great software is made by small, opinionated teams who
              answer to themselves. We&apos;re trying to be one of those. No
              outside investors, no roadmap pressure, no growth team. Apps go
              out the door when they&apos;re finished — not on a quarter.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
