'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-xl bg-bg/75 border-b border-rule'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1180px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-accent"
            style={{ boxShadow: '0 0 0 4px rgba(110, 120, 214, 0.18)' }}
            aria-hidden
          />
          <span className="text-[0.95rem] font-bold tracking-tight text-ink">
            Clarendon Labs
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/#apps"
            className="text-[0.85rem] font-medium text-ink-mid hover:text-ink transition-colors"
          >
            Apps
          </Link>
          <Link
            href="/#how"
            className="text-[0.85rem] font-medium text-ink-mid hover:text-ink transition-colors"
          >
            How we build
          </Link>
          <Link
            href="/#about"
            className="text-[0.85rem] font-medium text-ink-mid hover:text-ink transition-colors"
          >
            About
          </Link>
          <a
            href="mailto:hello@clarendon.dev"
            className="text-[0.82rem] font-bold tracking-wide rounded-full px-4 py-2 border border-accent/70 text-accent hover:bg-accent/10 transition-colors"
          >
            Get in touch
          </a>
        </div>

        <a
          href="mailto:hello@clarendon.dev"
          className="md:hidden text-[0.78rem] font-bold rounded-full px-3.5 py-1.5 border border-accent/70 text-accent"
        >
          Contact
        </a>
      </div>
    </nav>
  )
}
