export default function About() {
  return (
    <section
      id="about"
      className="relative section-divider py-24 md:py-32 px-6"
    >
      <div className="ambient-glow-soft" aria-hidden />

      <div className="max-w-[760px] mx-auto relative">
        <p className="tracker mb-6">03 — About</p>

        <h2 className="font-display font-black text-ink leading-[1.0] tracking-[-0.01em] text-[2.75rem] sm:text-[3.5rem] md:text-[4.5rem] mb-8 uppercase">
          Chicago-built.<br />No-BS software.
        </h2>

        <p className="text-ink-mid text-lg leading-relaxed mb-5">
          Clarendon Labs is an independent studio founded by Brian Long. We are
          named after a street in Chicago&apos;s Uptown neighborhood, and we
          carry that same energy into everything we build — practical,
          unpretentious, and made to last.
        </p>
        <p className="text-ink-mid text-lg leading-relaxed mb-10">
          The thesis is simple: everyday life — games, home, routines, logistics
          — deserves better software than it gets. We are fixing that one app at
          a time.
        </p>

        <a
          href="mailto:hello@clarendon.dev"
          className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-bold tracking-wide border border-accent/70 text-accent hover:bg-accent/10 transition-colors"
        >
          Say hello
        </a>
      </div>
    </section>
  )
}
