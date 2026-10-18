'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV } from '@/lib/adminNav'

// ─── Studio theme ───────────────────────────────────────────────────────────
//
// Every page under the studio console (same password, same sessionStorage key
// 'clarendon:console') renders inside <AdminShell>. Light, business-dashboard
// look on purpose (2026-10-18 redesign: cool light ground, teal + indigo, one colour per app, Geist) — this is Brian's own read on his numbers, not a page a
// customer sees, so it doesn't have to match the apps' dark consumer theme.
// Adding a page to the console is a route plus one entry in src/lib/adminNav.ts,
// never a new theme to build.

export const C = {
  paper: '#F6F7F9', card: '#FFFFFF', card2: '#F1F3F6',
  ink: '#0F1115', ink2: '#5B616E', soft: '#6B7280', faint: '#8A919E',
  rule: '#E6E8EC', rule2: '#D5D9E0',
  // `mint` keeps its name for the 24 pages that use it; it is the teal accent now.
  mint: '#0B7A83', mintTint: '#E2F4F5', amber: '#B45309', red: '#C24A4A',
  teal: '#0B7A83', tealHover: '#075E65', glow: '#2BD4E0',
  indigo: '#4F46E5', indigoTint: '#EEF0FF', coralTint: '#FFF1EC', violetTint: '#F5EEFF',
  grad: 'linear-gradient(135deg, #0B7A83 0%, #4F46E5 100%)',
  mono: "'Geist Mono','SF Mono',Menlo,monospace",
  sans: "'Geist',-apple-system,'Helvetica Neue',Arial,sans-serif",
  // Headings used the Besley serif; the redesign uses Geist for everything except the logo.
  serif: "'Geist',-apple-system,'Helvetica Neue',Arial,sans-serif",
  logo: "'Besley',Georgia,serif",
}

/** Sidebar app list. Same ids + brand accents as src/lib/console.ts (server-only, so copied here). */
export const STUDIO_APPS = [
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F' },
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4' },
  { id: 'jinglewire', name: 'Jinglewire', accent: '#1F6B3A' },
]

/** KPI tile tints, in order: teal, indigo, coral, violet. */
export const TILE = [
  { bg: '#E9F8F9', line: '#B9E7EA' },
  { bg: '#EEF0FF', line: '#CDD2FB' },
  { bg: '#FFF1EC', line: '#F8CDBE' },
  { bg: '#F5EEFF', line: '#DCC9F7' },
]

export function btn(kind: 'solid' | 'ghost' | 'mint'): React.CSSProperties {
  return {
    fontFamily: C.sans, fontWeight: 600, fontSize: 13.5, padding: '10px 16px',
    borderRadius: 10, cursor: 'pointer', lineHeight: 1.2,
    border: `1px solid ${kind === 'ghost' ? C.rule2 : 'transparent'}`,
    background: kind === 'mint' ? C.grad : kind === 'solid' ? C.ink : C.card,
    color: kind === 'ghost' ? C.ink : '#FFFFFF',
  }
}

// Motion, glow and focus for every console page. Scoped to .adm-shell so the
// public site is untouched; everything stops under prefers-reduced-motion.
const SHELL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Besley:wght@900&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
@keyframes adm-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes adm-drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-40px,20px) scale(1.08)}}
@keyframes adm-dot{0%,100%{box-shadow:0 0 4px rgba(43,212,224,.55)}50%{box-shadow:0 0 14px rgba(43,212,224,.95),0 0 24px rgba(43,212,224,.4)}}
.adm-shell{-webkit-font-smoothing:antialiased}
.adm-shell h1,.adm-shell h2,.adm-shell h3{letter-spacing:-.02em}
.adm-main{position:relative;isolation:isolate}
.adm-main::before{content:'';position:absolute;top:-40px;right:-20px;width:min(620px,90%);height:340px;pointer-events:none;z-index:-1;
  background:radial-gradient(closest-side at 30% 40%,rgba(43,212,224,.26),transparent),radial-gradient(closest-side at 70% 55%,rgba(79,70,229,.20),transparent),radial-gradient(closest-side at 55% 20%,rgba(255,90,78,.12),transparent);
  filter:blur(24px);animation:adm-drift 14s ease-in-out infinite alternate}
.adm-main>*{animation:adm-rise .55s cubic-bezier(.2,.7,.2,1) both}
.adm-main>*:nth-child(2){animation-delay:.05s}.adm-main>*:nth-child(3){animation-delay:.1s}.adm-main>*:nth-child(4){animation-delay:.15s}.adm-main>*:nth-child(5){animation-delay:.2s}
.adm-main section,.adm-main [data-card]{transition:transform .2s ease,box-shadow .25s ease,border-color .25s ease}
.adm-main section:hover,.adm-main [data-card]:hover{box-shadow:0 0 0 1px rgba(11,122,131,.16),0 12px 32px rgba(11,122,131,.10)}
.adm-shell button{transition:transform .15s ease,box-shadow .25s ease,background-color .2s ease}
.adm-shell button:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(15,17,21,.10)}
.adm-shell button[style*="linear-gradient"]:not(:disabled):hover{box-shadow:0 0 0 4px rgba(79,70,229,.16),0 12px 30px rgba(79,70,229,.32)}
.adm-shell :is(button,a,input,select,textarea):focus-visible{outline:2px solid #0B7A83;outline-offset:2px}
.adm-aside a{transition:background-color .2s ease,color .2s ease}.adm-aside a:hover{background:#F1F3F6}
.adm-logo-dot{animation:adm-dot 2.8s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.adm-shell *,.adm-shell *::before{animation:none!important;transition:none!important}}
`

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
      <style>{SHELL_CSS}</style>
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
          <span aria-label="Clarendon Labs" role="img" style={{ width: 36, height: 36, borderRadius: 10, background: C.ink,
                 color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                 fontFamily: C.logo, fontWeight: 900, fontSize: 20, position: 'relative',
                 boxShadow: '0 6px 18px rgba(15,17,21,.18)' }}>
            C<span className="adm-logo-dot" aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%',
                   background: C.glow, display: 'inline-block', marginLeft: 1, marginTop: 9 }} />
          </span>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.18em',
                          textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</div>
            <div style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', marginTop: 1 }}>Studio</div>
          </div>
        </div>

        <div className="adm-hide" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.16em',
                      textTransform: 'uppercase', color: C.faint, padding: '0 10px', marginBottom: 6 }}>
          Studio
        </div>

        {ADMIN_NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px',
              borderRadius: 10, textDecoration: 'none',
              color: active ? C.tealHover : C.ink2,
              fontWeight: active ? 700 : 600, fontSize: 14,
              background: active ? 'linear-gradient(90deg, #E2F4F5, #EEF0FF)' : 'transparent',
              boxShadow: active ? 'inset 3px 0 0 #0B7A83' : 'none',
            }}>
              {item.label}
            </Link>
          )
        })}

        <div className="adm-hide" style={{ height: 1, background: C.rule, margin: '16px 10px' }} />

        <div className="adm-hide" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.16em',
                      textTransform: 'uppercase', color: C.faint, padding: '0 10px', marginBottom: 6 }}>
          Apps
        </div>
        {STUDIO_APPS.map((a) => {
          const href = `/analytics/${a.id}`
          const active = pathname === href
          return (
            <Link key={a.id} href={href} className="adm-hide" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
              textDecoration: 'none', fontSize: 14, fontWeight: active ? 700 : 600,
              color: active ? C.ink : C.ink2, background: active ? `${a.accent}14` : 'transparent',
            }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: a.accent,
                     boxShadow: `0 0 8px ${a.accent}99`, flexShrink: 0 }} />
              {a.name}
            </Link>
          )
        })}

        <div className="adm-hide" style={{ flex: 1 }} />
      </aside>

      <main className="adm-main" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '40px 48px',
                     display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: C.sans, fontSize: 32, fontWeight: 700, letterSpacing: '-.025em', margin: 0 }}>{title}</h1>
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
