// ─── App Store Connect → revenue rows ────────────────────────────────────────
//
// Developer proceeds per app per day, in USD, from the daily Sales Reports
// (same parsing as the analytics page — see src/lib/analytics/appstore.ts for
// why proceeds include in-app purchases via Parent Identifier). Proceeds are
// the source of truth for revenue; bank deposits are matched to them later
// (payouts). Non-USD proceeds are NOT written (summing currencies would be
// wrong) — they're reported back so the monthly Finance report can cover them.

import { getDay, getSku, signAppStoreJWT, type Row } from '@/lib/analytics/appstore'
import { analyticsRegistry } from '@/lib/analytics/registry'

export type RevenueRow = {
  owner_id: string
  source: 'asc'
  app_slug: string
  period: string
  gross_cents: null
  proceeds_cents: number
  currency: 'USD'
  units: number
  external_ref: string
}

function dayProceeds(rows: Row[], appleAppId: string, sku: string | null, other: Set<string>) {
  let usd = 0, units = 0
  for (const r of rows) {
    const isApp = r.appleId === appleAppId
    const isChild = !!sku && r.parent === sku && !isApp
    if (!isApp && !isChild) continue
    const amount = r.units * r.proceeds
    if (amount === 0) continue
    if (r.currency && r.currency !== 'USD') { other.add(r.currency); continue }
    usd += amount
    units += r.units
  }
  return { cents: Math.round(usd * 100), units }
}

export async function ascRevenueRows(owner: string, days: number) {
  const jwt = signAppStoreJWT()
  const vendor = process.env.ASC_VENDOR_NUMBER
  if (!jwt || !vendor) return { error: 'ASC env vars missing' as const }

  const apps = analyticsRegistry()
  const skus = await Promise.all(apps.map((a) => getSku(a.appStoreId, jwt)))
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10))
  const reports = await Promise.all(dates.map((d) => getDay(d, jwt, vendor)))

  const rows: RevenueRow[] = []
  const other = new Set<string>()
  const failedDays: string[] = []
  reports.forEach((rep, i) => {
    if (rep === 'error') { failedDays.push(dates[i]); return }
    if (rep === 'missing') return // not published yet, or no sales at all that day
    apps.forEach((app, j) => {
      const { cents, units } = dayProceeds(rep, app.appStoreId, skus[j], other)
      if (cents !== 0) rows.push({
        owner_id: owner, source: 'asc', app_slug: app.id, period: dates[i],
        gross_cents: null, proceeds_cents: cents, currency: 'USD', units, external_ref: '',
      })
    })
  })
  return { rows, otherCurrencies: Array.from(other).sort(), failedDays, daysChecked: days }
}
