export default function About() {
  return (
    <section id="about" className="py-24 px-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
        <div className="aspect-square w-48 md:w-auto mx-auto md:mx-0 bg-gray-50 dark:bg-gray-950 rounded-3xl border border-gray-100 dark:border-gray-900 flex items-center justify-center">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
            <rect x="18" y="18" width="38" height="38" rx="9" fill="#0071e3" opacity="0.15"/>
            <rect x="64" y="18" width="38" height="38" rx="9" fill="#6e6e73" opacity="0.1"/>
            <rect x="18" y="64" width="38" height="38" rx="9" fill="#6e6e73" opacity="0.1"/>
            <rect x="64" y="64" width="38" height="38" rx="9" fill="#0071e3" opacity="0.35"/>
            <path d="M76 80L80 84L88 76" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-blue-600 mb-3">About</p>
          <h2 className="text-4xl font-bold tracking-tight mb-5 leading-tight">Chicago-built.<br />No-BS software.</h2>
          <p className="text-gray-500 leading-relaxed mb-4">Clarendon Labs is an independent studio founded by Brian Long. We&apos;re named after a street in Chicago&apos;s Uptown neighborhood, and we carry that same energy into everything we build — practical, unpretentious, and made to last.</p>
          <p className="text-gray-500 leading-relaxed mb-8">The thesis is simple: everyday life — games, home, routines, logistics — deserves better software than it gets. We&apos;re fixing that one app at a time.</p>
          <a href="mailto:contact@clarendon.dev" className="border border-blue-600 text-blue-600 rounded-full px-6 py-3 text-sm font-medium hover:bg-blue-50 transition-colors inline-block">Say hello</a>
        </div>
      </div>
    </section>
  )
}
