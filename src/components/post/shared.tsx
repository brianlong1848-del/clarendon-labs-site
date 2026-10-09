'use client'
import { C } from '@/components/AdminNav'
import type { Platform } from '@/lib/publish/rules'

// Shared bits for the /post composer: types that mirror /api/publish, the
// platform glyphs, and small UI atoms.

export type Account = { platform: Platform; ready: boolean; handle?: string; avatar?: string; reason?: string; connect?: 'threads' | 'tiktok' }
export type PublishApp = { id: string; name: string; accent: string; icon: string; accounts: Account[] }
export type TargetState = { platform: Platform; format: string; status: string; permalink?: string; error?: string; tiktok?: { mode: 'direct' | 'draft' } }
export type QueuedPost = {
  id: string; app_id: string; caption: string; media: { url: string; kind: 'image' | 'video'; width: number; height: number }[]
  targets: TargetState[]; status: string; scheduled_at: string | null; created_at: string
}

export const PLATFORM_TINT: Record<Platform, string> = {
  instagram: '#C13584', facebook: '#1877F2', threads: '#141413', tiktok: '#141413',
}

/** Simple, recognisable glyphs — outline marks, not the brands' logo files. */
export function PlatformGlyph({ platform, size = 18, color }: { platform: Platform; size?: number; color?: string }) {
  const c = color ?? PLATFORM_TINT[platform]
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (platform) {
    case 'instagram': return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r=".6" fill={c} /></svg>
    case 'facebook': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M13.5 20v-7h2.2l.3-2.6h-2.5V8.9c0-.8.3-1.3 1.3-1.3h1.3V5.3a17 17 0 0 0-2-.1c-2 0-3.2 1.2-3.2 3.3v1.9H8.7V13h2.2v7" /></svg>
    case 'threads': return <svg {...common}><path d="M16.5 11.2c-.4-2.6-2.1-3.8-4.4-3.8-2.7 0-4.4 1.9-4.4 4.6s1.8 4.6 4.5 4.6c2.3 0 4.2-1.3 4.2-3.6 0-1.9-1.5-3.1-3.7-3.1-1.7 0-2.9.9-2.9 2.1 0 1.1 1 1.8 2.2 1.8 2.6 0 3.4-2.4 2.9-5.4" /><path d="M20 12a8 8 0 1 1-2.4-5.7" /></svg>
    case 'tiktok': return <svg {...common}><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.4 2.4 2 4 4.5 4.3" /></svg>
  }
}

export const label: React.CSSProperties = { fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft }
export const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22 }

export function Toggle({ on, onChange, disabled, label: aria }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={aria} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 42, height: 25, borderRadius: 99, border: 0, padding: 0, position: 'relative', flexShrink: 0,
               cursor: disabled ? 'not-allowed' : 'pointer', background: on ? C.mint : '#DCD9D0', opacity: disabled ? 0.45 : 1, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 21, height: 21, borderRadius: 99, background: '#fff',
                     boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T; options: { value: T; label: string; disabled?: boolean; title?: string }[]; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', background: C.card2, borderRadius: 9, padding: 3, opacity: disabled ? 0.5 : 1 }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button key={o.value} role="radio" aria-checked={active} disabled={disabled || o.disabled} title={o.title} onClick={() => onChange(o.value)}
            style={{ border: 0, borderRadius: 7, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, fontFamily: C.sans,
                     cursor: disabled || o.disabled ? 'not-allowed' : 'pointer',
                     background: active ? C.card : 'transparent', color: o.disabled ? C.faint : active ? C.ink : C.soft,
                     boxShadow: active ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{o.label}</button>
        )
      })}
    </div>
  )
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
