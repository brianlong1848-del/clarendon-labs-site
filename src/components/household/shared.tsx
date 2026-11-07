'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { C } from '@/components/AdminNav'

// Shared bits for the Household pages: sub-tabs, formatting, and a fetch hook
// that shows the last known data at once (localStorage) and refreshes behind
// a small "Updating…" pill, per the Studio design rules.

export const TABS = [
  { href: '/household', label: 'Overview' },
  { href: '/household/accounts', label: 'Accounts' },
  { href: '/household/holdings', label: 'Holdings' },
  { href: '/household/activity', label: 'Activity' },
  { href: '/household/advisor', label: 'Advisor' },
  { href: '/household/settings', label: 'Settings' },
]

export function HouseholdTabs() {
  const path = usePathname()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TABS.map((t) => {
        const on = path === t.href
        return (
          <Link key={t.href} href={t.href} style={{
            padding: '7px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 650, textDecoration: 'none',
            background: on ? C.ink : 'transparent', color: on ? '#fff' : C.ink2, border: `1px solid ${on ? C.ink : C.rule2}`,
          }}>{t.label}</Link>
        )
      })}
    </div>
  )
}

export const usd = (c: number | null | undefined, opts: { cents?: boolean; sign?: boolean } = {}) => {
  if (c == null || !Number.isFinite(c)) return '—'
  const n = c / 100
  const s = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: opts.cents ? 2 : 0, minimumFractionDigits: opts.cents ? 2 : 0 })
  return (n < 0 ? '−' : opts.sign && n > 0 ? '+' : '') + s
}
export const pct = (v: number | null | undefined, digits = 1, sign = false) =>
  v == null || !Number.isFinite(v) ? '—' : `${sign && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`
export const price = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 4 : 2 }))
export const qty = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 10 ? 4 : 2 }))
export const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
export const day = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
export const moneyColor = (n: number | null | undefined) => (n == null ? C.ink2 : n > 0 ? C.mint : n < 0 ? C.loss : C.ink2)

export const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: '18px 20px' }
export const th: React.CSSProperties = { fontFamily: C.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft, textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap' }
export const td: React.CSSProperties = { textAlign: 'right', padding: '0 10px', height: 48, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.rule}`, whiteSpace: 'nowrap', fontSize: 14 }
export const input: React.CSSProperties = { background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', width: '100%', fontFamily: C.sans }

/** A tiny pill for "Updating…" / "Live" / "Close" labels. */
export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'teal' | 'amber' | 'loss' }) {
  const bg = tone === 'teal' ? C.mintTint : tone === 'amber' ? '#FFF4E5' : tone === 'loss' ? '#FBEDE8' : C.card2
  const fg = tone === 'teal' ? C.teal : tone === 'amber' ? C.amber : tone === 'loss' ? C.loss : C.ink2
  return <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>
}

/**
 * Last-known-data fetch. Renders what the browser remembers right away, then
 * refreshes. `reload()` refetches (after an action). 401 → /login.
 */
export function useHousehold<T>(path: string) {
  const key = `clarendon:household:${path}`
  const [data, setData] = useState<T | null>(() => {
    try { const s = typeof window !== 'undefined' ? localStorage.getItem(key) : null; return s ? (JSON.parse(s) as T) : null } catch { return null }
  })
  const [updating, setUpdating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const reload = useCallback(async () => {
    setUpdating(true); setError(null)
    try {
      const r = await fetch(path, { cache: 'no-store' })
      if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return }
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      if (!alive.current) return
      setData(j as T)
      try { localStorage.setItem(key, JSON.stringify(j)) } catch { /* private mode */ }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setUpdating(false)
    }
  }, [path, key])
  useEffect(() => { alive.current = true; reload(); return () => { alive.current = false } }, [reload])
  return { data, updating, error, reload, setData }
}

export async function post(path: string, body?: object, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '36px 20px' }}>
      <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>{title}</div>
      <div style={{ color: C.ink2, fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}
