export default function Hero() {
  return (
    <section className="bg-bg px-6 pt-20 pb-6 text-center relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgb(0 102 204 / 0.10), transparent 70%)',
        }}
      />
      <div className="relative">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-bg-2 border border-line-soft rounded-full text-[13px] text-ink-2 mb-6">
          <span className="live-dot" />
          Independent iOS studio · Chicago · est. 2026
        </div>
        <h1 className="display mb-3.5">
          Apps for play.
          <br />
          <span className="text-ink-3">Apps for daily life.</span>
        </h1>
        <p className="tile-sub max-w-[720px] mx-auto text-ink-2">
          Clarendon Labs is a small iOS studio building two kinds of software:
          games you&apos;ll play with friends, and lifestyle tools you&apos;ll
          keep on your home screen.
        </p>
        <div className="flex gap-4 justify-center flex-wrap mt-4">
          <a href="#catalog" className="link">
            See the catalog ›
          </a>
          <a href="/about" className="link">
            About the studio ›
          </a>
        </div>
      </div>
      <div className="h-[60px]" />
    </section>
  )
}
