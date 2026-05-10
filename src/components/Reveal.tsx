'use client'
import { useEffect, useRef, ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  as?: 'section' | 'div'
  id?: string
}

export default function Reveal({ children, className = '', as = 'section', id }: Props) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Tag = as as 'section'
  return (
    <Tag
      id={id}
      ref={ref as React.RefObject<HTMLElement>}
      className={`reveal ${className}`}
    >
      {children}
    </Tag>
  )
}
