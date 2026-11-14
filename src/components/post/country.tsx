'use client'
import { C } from '@/components/AdminNav'
import { APP_MARKETS, isMarket, MARKETS, type Market } from '@/lib/publish/markets'

// Country pieces for posts (docs/DESIGN.md → "country editions"): CountryTag,
// FlagStack, and which market a post is for.

/** The market a post was made for — only when it says so, and only for apps
 *  with more than one market. A post with no market is the app's home edition
 *  and gets no tag (it used to read "United States" on every row). */
export function marketOf(p: { app_id: string; market?: string | null }): Market | null {
  if ((APP_MARKETS[p.app_id] ?? ['us']).length < 2) return null
  return isMarket(p.market) ? MARKETS[p.market] : null
}
/** The country a post is for when grouping by country: its market, else the app's home market. */
export function countryOf(p: { app_id: string; market?: string | null }): Market {
  return MARKETS[isMarket(p.market) ? p.market : (APP_MARKETS[p.app_id] ?? ['us'])[0]]
}
/** Whether an app has more than one market switched on (flags are worth showing). */
export const multiMarket = (appId: string) => (APP_MARKETS[appId] ?? ['us']).length > 1

export function CountryTag({ m, size = 12, short }: { m: Market; size?: number; short?: boolean }) {
  return (
    <span title={`${m.name} · ${m.langName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size, fontWeight: 700, color: C.ink, background: C.card2, borderRadius: 99, padding: '2px 8px 2px 6px', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ fontSize: size + 1 }}>{m.flag}</span>{short ? m.short : m.name}
    </span>
  )
}

/** Up to four flags, overlapping, for an edition group ("3 countries"). */
export function FlagStack({ markets }: { markets: Market[] }) {
  const shown = markets.slice(0, 4)
  return (
    <span title={markets.map((m) => m.name).join(', ')} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <span key={m.id} aria-hidden style={{ width: 20, height: 20, borderRadius: 99, background: C.card, border: `1.5px solid ${C.card}`, boxShadow: `0 0 0 1px ${C.rule}`,
                                              display: 'grid', placeItems: 'center', fontSize: 12, marginLeft: i ? -6 : 0, zIndex: shown.length - i }}>{m.flag}</span>
      ))}
      {markets.length > shown.length && <span style={{ fontSize: 11, fontWeight: 700, color: C.soft, marginLeft: 4 }}>+{markets.length - shown.length}</span>}
    </span>
  )
}
