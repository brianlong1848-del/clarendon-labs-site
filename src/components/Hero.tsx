import Link from 'next/link'

export default function Hero() {
  return (
    <section className="pt-40 pb-24 px-6 text-center max-w-4xl mx-auto">
      <p className="text-xs font-semibold tracking-widest uppercase text-blue-600 mb-5">Clarendon Labs</p>
      <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
        Life&apos;s too short for<br />
        <span className="text-blue-600">clunky software.</span>
      </h1>
      <p className="text-xl text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
        We make apps for the stuff that actually fills your day — games with friends, managing your home, getting through the week. One well-made app at a time.
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        <Link href="/#apps" className="bg-blue-600 text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-blue-700 transition-colors">See our apps</Link>
        <Link href="/#about" className="border border-blue-600 text-blue-600 rounded-full px-6 py-3 text-sm font-medium hover:bg-blue-50 transition-colors">Our story</Link>
      </div>
    </section>
  )
}
