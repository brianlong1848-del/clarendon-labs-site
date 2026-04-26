const steps = [
  {
    n: '01',
    title: 'Find friction',
    body: 'We hunt for the unglamorous problems people have already accepted as normal — the parts of daily life that deserve better software.',
  },
  {
    n: '02',
    title: 'Build it tight',
    body: 'One job per app. No subscriptions for basic features, no upsells in your face, no half-finished modes left around to rot.',
  },
  {
    n: '03',
    title: 'Ship it private',
    body: 'Your data stays on your device unless it absolutely has to leave. We are not in the surveillance business and we never will be.',
  },
]

export default function Pillars() {
  return (
    <section
      id="how"
      className="relative section-divider py-24 md:py-32 px-6"
    >
      <div className="ambient-glow-soft" aria-hidden />

      <div className="max-w-[1180px] mx-auto relative">
        <p className="tracker mb-6">02 — How we build</p>
        <h2 className="font-display font-black text-ink leading-[1.02] tracking-[-0.005em] text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] mb-5 uppercase max-w-[18ch]">
          Small studio.<br />High standards.
        </h2>
        <p className="text-ink-mid text-lg leading-relaxed max-w-[52ch] mb-14">
          A few principles we hold ourselves to. They are also the reason we
          ship slowly and on purpose.
        </p>

        <ol className="list-none p-0 m-0 grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((step) => (
            <li
              key={step.n}
              className="relative rounded-[18px] border border-rule bg-white/[0.03] hover:bg-white/[0.05] hover:border-rule-strong transition-colors p-7 pb-9 overflow-hidden"
            >
              <div
                className="absolute -top-16 -right-16 w-44 h-44 rounded-full pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle, rgba(110, 120, 214, 0.18), transparent 65%)',
                }}
                aria-hidden
              />

              <div className="relative">
                <span className="block font-display font-black text-accent leading-[0.9] tracking-[-0.02em] text-[3.5rem] md:text-[4.5rem] mb-2">
                  {step.n}
                </span>
                <strong className="block text-ink text-[1.15rem] font-bold tracking-tight mb-2">
                  {step.title}
                </strong>
                <p className="text-ink-mid text-[0.95rem] leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
