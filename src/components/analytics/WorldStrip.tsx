'use client'
import { C, labelStyle } from '@/components/AdminNav'
import { AppleLogo, PlayLogo } from '@/components/StoreLogos'

// ─── World strip ─────────────────────────────────────────────────────────────
//
// One tile per country: flag, name, and whatever the page knows about it —
// store installs (App Store / Google Play), ad spend, ad installs, posts.
// Tapping a tile filters the page to that country; tapping it again clears.
// Spend 0 on a paused account says "paused", never a blank. Presentational:
// Money → Ads and /post feed it (ad numbers from src/lib/ads/countries.ts).

export type WorldTile = {
  /** ISO-3166 alpha-2, lower case. */
  country: string
  flag?: string
  name?: string
  installs?: { appStore?: number; googlePlay?: number }
  spendCents?: number
  adInstalls?: number
  posts?: number
  paused?: boolean
}

/** "gb" → 🇬🇧 */
export const flagOf = (cc: string) => (/^[a-z]{2}$/i.test(cc) ? String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐')
let names: Intl.DisplayNames | null = null
/** "gb" → "United Kingdom" */
export function countryName(cc: string): string {
  try { names ??= new Intl.DisplayNames(['en'], { type: 'region' }); return names.of(cc.toUpperCase()) ?? cc.toUpperCase() } catch { return cc.toUpperCase() }
}
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 && c < 10000 ? 2 : 0 })
const SHORT: Record<string, string> = { us: 'US', gb: 'UK', ae: 'UAE' }

export function WorldStrip({ tiles, selected = null, onSelect }: { tiles: WorldTile[]; selected?: string | null; onSelect?: (c: string | null) => void }) {
  if (!tiles.length) return null
  return (
    <div role="group" aria-label="Countries" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 6px', scrollbarWidth: 'thin' }}>
      {tiles.map((t) => {
        const on = selected === t.country
        const name = t.name ?? (SHORT[t.country] ?? countryName(t.country))
        const spend = t.spendCents ?? 0
        const lines: React.ReactNode[] = []
        if (t.spendCents != null || t.paused) lines.push(
          <span key="s" style={{ fontVariantNumeric: 'tabular-nums', color: spend ? C.ink : C.soft, fontWeight: spend ? 650 : 500 }}>
            {spend ? usd(spend) : t.paused ? 'paused' : '$0'}{spend > 0 && t.paused ? <span style={{ color: C.soft, fontWeight: 500 }}> · paused</span> : null}
          </span>)
        if (t.adInstalls != null && (t.adInstalls > 0 || spend > 0)) lines.push(<span key="a" style={{ color: C.ink2 }}>{t.adInstalls.toLocaleString('en-US')} ad install{t.adInstalls === 1 ? '' : 's'}</span>)
        if (t.installs && (t.installs.appStore != null || t.installs.googlePlay != null)) lines.push(
          <span key="i" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.ink2, fontVariantNumeric: 'tabular-nums' }}>
            {t.installs.appStore != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><AppleLogo size={10} />{t.installs.appStore}</span>}
            {t.installs.googlePlay != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PlayLogo size={10} />{t.installs.googlePlay}</span>}
          </span>)
        if (t.posts != null) lines.push(<span key="p" style={{ color: C.ink2 }}>{t.posts} post{t.posts === 1 ? '' : 's'}</span>)
        return (
          <button key={t.country} type="button" aria-pressed={on} onClick={() => onSelect?.(on ? null : t.country)}
            title={`${countryName(t.country)}${on ? ' — tap again to show every country' : ' — show only this country'}`}
            style={{ flex: 'none', minWidth: 112, minHeight: 40, textAlign: 'left', display: 'grid', gap: 3, padding: '9px 12px', borderRadius: 12, cursor: onSelect ? 'pointer' : 'default',
              fontFamily: C.sans, fontSize: 12, lineHeight: 1.3, background: on ? C.mintTint : C.card, color: C.ink,
              border: `1px solid ${on ? C.teal : C.rule}`, boxShadow: on ? `0 0 0 1px ${C.teal}` : undefined }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{t.flag ?? flagOf(t.country)}</span>
              <span style={{ ...labelStyle, fontSize: 10.5, color: on ? C.teal : C.ink2 }}>{name}</span>
            </span>
            {lines}
          </button>
        )
      })}
    </div>
  )
}

export default WorldStrip
