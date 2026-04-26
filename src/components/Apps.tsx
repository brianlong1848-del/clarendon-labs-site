export default function Apps() {
  return (
    <section id="apps" className="py-24 px-6 max-w-5xl mx-auto">
      <p className="text-xs font-semibold tracking-widest uppercase text-blue-600 mb-3">Apps</p>
      <h2 className="text-4xl font-bold tracking-tight mb-3">Built for real life.</h2>
      <p className="text-lg text-gray-500 mb-12 max-w-md">Games, home tools, and everyday utilities — designed to be the best version of what they are.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        <a href="https://rolligan.com" className="block bg-white dark:bg-black p-8 hover:bg-gray-50 dark:hover:bg-gray-950 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="10" cy="16" r="5" fill="white" opacity="0.9"/>
              <circle cx="22" cy="10" r="4" fill="white" opacity="0.55"/>
              <circle cx="22" cy="22" r="4" fill="white" opacity="0.55"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1">Rolligan</h3>
          <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-0.5 mb-3">Live · rolligan.com</span>
          <p className="text-sm text-gray-500 leading-relaxed">A push-your-luck dice party game that turns any living room into a scene. Risk it all or bank your points — the tension is the whole point.</p>
        </a>
        <div className="bg-white dark:bg-black p-8 hover:bg-gray-50 dark:hover:bg-gray-950 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="8" y="8" width="7" height="7" rx="2" fill="white" opacity="0.4"/>
              <rect x="17" y="8" width="7" height="7" rx="2" fill="white" opacity="0.4"/>
              <rect x="8" y="17" width="7" height="7" rx="2" fill="white" opacity="0.4"/>
              <rect x="17" y="17" width="7" height="7" rx="2" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1">More on the way</h3>
          <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-0.5 mb-3">In development</span>
          <p className="text-sm text-gray-500 leading-relaxed">Home management, daily routines, group coordination — we&apos;re building across all the categories where good software is still rare.</p>
        </div>
      </div>
    </section>
  )
}
