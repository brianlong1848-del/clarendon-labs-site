const pillars = [
  { icon: '🏠', title: 'Everyday problems', desc: 'We go after the unglamorous stuff — the friction in daily life that everyone has accepted as normal.' },
  { icon: '⚡', title: 'Focused, not fat', desc: 'Every app does one job. No subscriptions for basic features. No upsells in your face.' },
  { icon: '👥', title: 'Made for people', desc: 'Not for metrics, not for investors. If you wouldn\'t show it to a friend, we don\'t ship it.' },
  { icon: '🔒', title: 'Private by default', desc: 'Your data doesn\'t leave your device unless it has to. We\'re not in the surveillance business.' },
]

export default function Pillars() {
  return (
    <section className="py-24 px-6 max-w-5xl mx-auto">
      <p className="text-xs font-semibold tracking-widest uppercase text-blue-600 mb-3">How we think</p>
      <h2 className="text-4xl font-bold tracking-tight mb-3">Small studio.<br />High standards.</h2>
      <p className="text-lg text-gray-500 mb-12 max-w-md">A few things we believe about making software people actually want to use.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {pillars.map((p) => (
          <div key={p.title}>
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-4 text-base">{p.icon}</div>
            <h3 className="text-sm font-semibold mb-2">{p.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
