// ─── Google Play → revenue rows ──────────────────────────────────────────────
//
// Estimated developer proceeds per app per day, in USD, from the Play sales
// reports (src/lib/analytics/googleplay.ts explains the estimate: item price
// minus Google's 15% / 30% fee, refunds subtracted). Written next to the App
// Store rows with source 'play', so Money's P&L, ROAS and the Studio app add
// both stores up without knowing which is which. Non-USD sales are reported
// back, not written — same rule as ascRevenue.ts.
//
// Play's earnings reports (the actual payout, in the payout currency) only
// land once a month; the sales estimate is what we have daily.

import { fetchPlayCached, playConfigured } from '@/lib/analytics/googleplay'
import { PLAY_PACKAGE_IDS } from '@/lib/ads/store'

export type PlayRevenueRow = {
  owner_id: string
  source: 'play'
  app_slug: string
  period: string
  gross_cents: null
  proceeds_cents: number
  currency: 'USD'
  units: number
  external_ref: string
}

export async function playRevenueRows(owner: string, days: number) {
  if (!playConfigured()) return { error: 'Play reports not configured (PLAY_REPORTS_BUCKET / PLAY_REPORTS_SA_JSON)' as const }
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const rows: PlayRevenueRow[] = []
  const other = new Set<string>()
  const failedApps: Record<string, string> = {}
  let reportDate: string | null = null
  await Promise.all(Object.entries(PLAY_PACKAGE_IDS).map(async ([slug, pkg]) => {
    if (!pkg) return
    const m = await fetchPlayCached(pkg)
    if ('error' in m) { failedApps[slug] = m.error; return }
    for (const c of m.otherCurrencies) other.add(c)
    if (m.reportDate && (!reportDate || m.reportDate > reportDate)) reportDate = m.reportDate
    for (const d of m.daily) {
      if (d.date < since) continue
      const cents = Math.round(d.proceeds * 100)
      if (cents === 0) continue
      rows.push({ owner_id: owner, source: 'play', app_slug: slug, period: d.date, gross_cents: null, proceeds_cents: cents, currency: 'USD', units: d.units ?? 0, external_ref: '' })
    }
  }))
  return { rows, otherCurrencies: Array.from(other).sort(), failedApps, daysChecked: days, reportDate }
}
