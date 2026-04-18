'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/85 dark:bg-black/85 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/10' : 'bg-transparent'}`}>
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect width="22" height="22" rx="6" fill="#0071e3"/>
            <path d="M6 16L11 6L16 16" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 13H14" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-semibold tracking-tight">Clarendon Labs</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#apps" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Apps</Link>
          <Link href="/#about" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">About</Link>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
          <Link href="/support" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Support</Link>
        </div>
      </div>
    </nav>
  )
}
