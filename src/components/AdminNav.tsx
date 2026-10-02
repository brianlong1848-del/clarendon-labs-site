'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV } from '@/lib/adminNav'

// ─── Studio theme ───────────────────────────────────────────────────────────
//
// Every page under the studio console (same password, same sessionStorage key
// 'clarendon:console') renders inside <AdminShell>. Light, business-dashboard
// look on purpose — this is Brian's own read on his numbers, not a page a
// customer sees, so it doesn't have to match the apps' dark consumer theme.
// Adding a page to the console is a route plus one entry in src/lib/adminNav.ts,
// never a new theme to build.

export const C = {
  paper: '#F7F6F2', card: '#FFFFFF', card2: '#F1F0EC',
  ink: '#141413', ink2: '#706E67', soft: '#8B8A84', faint: '#A6A49C',
  rule: 'rgba(20,20,19,.08)', rule2: 'rgba(20,20,19,.14)',
  mint: '#1F6F54', mintTint: '#E6F1EC', amber: '#B45309', red: '#C24A4A',
  mono: "'IBM Plex Mono','SF Mono',Menlo,monospace",
  sans: "'Archivo',-apple-system,'Helvetica Neue',Arial,sans-serif",
  serif: "'Besley',Georgia,serif",
}

export function btn(kind: 'solid' | 'ghost' | 'mint'): React.CSSProperties {
  return {
    fontFamily: C.sans, fontWeight: 600, fontSize: 13.5, padding: '10px 16px',
    borderRadius: 10, cursor: 'pointer', lineHeight: 1.2,
    border: `1px solid ${kind === 'ghost' ? C.rule2 : 'transparent'}`,
    background: kind === 'mint' ? C.mint : kind === 'solid' ? C.ink : C.card,
    color: kind === 'ghost' ? C.ink : '#FFFFFF',
  }
}

/** Shared sidebar + header chrome for every studio page. Pass the page's
 *  title, an optional one-line subtitle, and any header-row controls
 *  (refresh, sign out, exports…) as `actions`; everything else is the
 *  page's own content. */
export function AdminShell({ title, subtitle, actions, children }: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  return (
    <div className="adm-shell" style={{ display: 'flex', minHeight: '100dvh', background: C.paper,
                  fontFamily: C.sans, color: C.ink }}>
      {/* Phone layout: the 240px sidebar becomes a scrolling top bar so pages fit a narrow screen. */}
      <style>{`
        @media (max-width: 760px) {
          .adm-shell { flex-direction: column !important; }
          .adm-aside { width: 100% !important; flex-direction: row !important; align-items: center !important; overflow-x: auto; padding: 10px 12px !important; border-right: 0 !important; border-bottom: 1px solid ${C.rule}; gap: 6px !important; position: sticky; top: 0; z-index: 5; }
          .adm-aside a { white-space: nowrap; flex: none; padding: 8px 12px !important; }
          .adm-brand { margin: 0 8px 0 0 !important; padding: 0 !important; flex: none; }
          .adm-brand > div { display: none !important; }
          .adm-hide { display: none !important; }
          .adm-main { padding: 20px 16px 40px !important; }
          .adm-main h1 { font-size: 26px !important; }
        }
      `}</style>
      <aside className="adm-aside" style={{ width: 240, flexShrink: 0, background: C.card,
                      borderRight: `1px solid ${C.rule}`, boxSizing: 'border-box',
                      padding: '28px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="adm-brand" style={{ padding: '0 10px', marginBottom: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/clarendon-mark.svg" alt="Clarendon Labs" width={34} height={25}
               style={{ display: 'block', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.18em',
                          textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</div>
            <div style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 800, marginTop: 1 }}>Studio</div>
          </div>
        </div>

        <div className="adm-hide" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.16em',
                      textTransform: 'uppercase', color: C.faint, padding: '0 10px', marginBottom: 6 }}>
          Studio
        </div>

        {ADMIN_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px',
              borderRadius: 10, textDecoration: 'none',
              color: active ? C.ink : C.ink2,
              fontWeight: active ? 700 : 600, fontSize: 14,
              background: active ? C.mintTint : 'transparent',
            }}>
              {item.label}
            </Link>
          )
        })}

        <div className="adm-hide" style={{ height: 1, background: C.rule, margin: '16px 10px' }} />

        <div className="adm-hide" style={{ margin: '0 10px', padding: '10px 12px', border: `1px dashed ${C.rule2}`,
                      borderRadius: 10, color: C.faint, fontFamily: C.mono, fontSize: 12,
                      textAlign: 'center' }}>
          + Add a page
        </div>

        <div className="adm-hide" style={{ flex: 1 }} />
      </aside>

      <main className="adm-main" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '40px 48px',
                     display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: C.serif, fontSize: 32, fontWeight: 900, margin: 0 }}>{title}</h1>
            {subtitle && <p style={{ color: C.ink2, fontSize: 14.5, margin: '6px 0 0' }}>{subtitle}</p>}
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
        {children}
      </main>
    </div>
  )
}
