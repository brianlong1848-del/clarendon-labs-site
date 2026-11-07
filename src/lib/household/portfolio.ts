// ─── The household picture ───────────────────────────────────────────────────
//
// SERVER ONLY. One function, buildPicture(), assembles everything the Overview,
// Holdings and the advisor need: accounts with values, holdings priced live
// (FMP) or at Plaid's close, net worth with 1-day / 30-day / YTD deltas,
// allocation vs the target, and the cash buffer. Reads the household tables
// through the service-role client (the routes have already checked the member).

import type { StudioDb } from '@/lib/money/studioDb'
import { chicagoDay, fmpStatus, getSetting, heldTickers, quotesFor, refreshQuotes, type Quote } from './marketData'

export type Bucket = 'equity_us' | 'equity_intl' | 'bonds' | 'cash' | 'other'
export const BUCKETS: Bucket[] = ['equity_us', 'equity_intl', 'bonds', 'cash', 'other']
export const BUCKET_LABEL: Record<Bucket, string> = { equity_us: 'US stocks', equity_intl: 'International stocks', bonds: 'Bonds', cash: 'Cash', other: 'Other' }
export const DEFAULT_TARGET: Record<Bucket, number> = { equity_us: 60, equity_intl: 20, bonds: 15, cash: 5, other: 0 }

export type AccountRow = {
  id: string; institution: string | null; name: string | null; mask: string | null
  account_type: string | null; account_subtype: string | null; plaid_item_id: string | null
  balance_current_cents: number | null; balance_available_cents: number | null; balance_updated_at: string | null
  is_liability: boolean; item_status: string | null; last_synced_at: string | null; last_error: string | null; products: string[] | null
  /** What it is worth to the household right now (holdings at live prices for brokerages). */
  value_cents: number
  holdings_count: number
}

export type HoldingRow = {
  account_id: string; account_name: string; institution: string | null
  security_id: string; ticker: string | null; name: string | null; type: string | null; is_cash_equivalent: boolean
  quantity: number; cost_basis_cents: number | null; institution_price: number | null; institution_value_cents: number; as_of: string
  price: number | null; price_source: 'fmp' | 'plaid' | 'institution'; price_as_of: string | null; change_pct: number | null
  value_cents: number; gain_cents: number | null; gain_pct: number | null; weight: number
  bucket: Bucket; sector: string | null
}

export type Picture = {
  asOf: string
  accounts: AccountRow[]
  holdings: HoldingRow[]
  netWorth: { total_cents: number; assets_cents: number; liabilities_cents: number; investments_cents: number }
  deltas: { d1_cents: number | null; d30_cents: number | null; ytd_cents: number | null }
  allocation: { actual_cents: Record<Bucket, number>; actual_pct: Record<Bucket, number>; target_pct: Record<Bucket, number>; drift_pts: Record<Bucket, number> }
  cash: { cents: number; avg_monthly_outflow_cents: number; months: number | null; target_months: number }
  concentration: { names: { ticker: string; weight: number }[]; sectors: { sector: string; weight: number }[] }
  fmp: Awaited<ReturnType<typeof fmpStatus>>
  settings: Record<string, unknown>
}

type Security = { id: string; ticker: string | null; name: string | null; type: string | null; cusip: string | null; is_cash_equivalent: boolean | null; close_price: number | null; close_price_as_of: string | null }
type Holding = { account_id: string; security_id: string; quantity: number; cost_basis_cents: number | null; institution_price: number | null; institution_value_cents: number; as_of: string }

const round = (n: number) => Math.round(n)

/** Asset-class bucket for one security, from Plaid's type, FMP's profile (if cached) and the household's own overrides. */
function classify(s: Security, profile: { isEtf?: boolean; isFund?: boolean; country?: string; sector?: string } | undefined, overrides: Record<string, Bucket>): Bucket {
  if (s.ticker && overrides[s.ticker]) return overrides[s.ticker]
  if (s.is_cash_equivalent || s.type === 'cash') return 'cash'
  if (s.type === 'fixed income') return 'bonds'
  if (s.type === 'derivative' || s.type === 'cryptocurrency' || s.type === 'loan' || s.type === 'other') return 'other'
  const name = (s.name ?? '').toLowerCase()
  if (/\bbond|treasury|fixed income|aggregate|\bbnd\b|\bagg\b|money market/.test(name)) return 'bonds'
  if (/international|intl|emerging|ex-us|ex us|europe|pacific|global ex|developed markets|\bvxus\b|\bvea\b|\bvwo\b|\bveu\b/.test(name)) return 'equity_intl'
  if (profile?.country && profile.country !== 'US') return 'equity_intl'
  return 'equity_us'
}

export async function buildPicture(db: StudioDb, opts: { refreshQuotes?: boolean } = {}): Promise<Picture> {
  const [accts, hold, settingsRows] = await Promise.all([
    db.select<Omit<AccountRow, 'value_cents' | 'holdings_count'>[]>('v_household_accounts', 'select=*&order=institution,name'),
    db.select<Holding[]>('holdings', 'select=account_id,security_id,quantity,cost_basis_cents,institution_price,institution_value_cents,as_of'),
    db.select<{ key: string; value: unknown }[]>('household_settings', 'select=key,value'),
  ])
  if (!accts.ok) throw new Error(accts.error)
  const settings: Record<string, unknown> = {}
  for (const r of settingsRows.ok ? settingsRows.data : []) settings[r.key] = r.value
  const overrides = (settings.asset_class_overrides as Record<string, Bucket> | undefined) ?? {}
  const target: Record<Bucket, number> = { ...DEFAULT_TARGET, ...((settings.target_allocation as Partial<Record<Bucket, number>> | undefined) ?? {}) }
  const targetMonths = Number(settings.cash_buffer_months ?? 6) || 6

  const holdingsRaw = hold.ok ? hold.data : []
  const secIds = Array.from(new Set(holdingsRaw.map((h) => h.security_id)))
  const secs = secIds.length ? await db.select<Security[]>('securities', `select=id,ticker,name,type,cusip,is_cash_equivalent,close_price,close_price_as_of&id=in.(${secIds.map(encodeURIComponent).join(',')})`) : { ok: true as const, data: [] as Security[] }
  const secById = new Map((secs.ok ? secs.data : []).map((s) => [s.id, s]))

  // Prices: refresh what is stale (when asked), then read the cache + Plaid closes.
  const tickers = await heldTickers(db)
  if (opts.refreshQuotes) await refreshQuotes(db, tickers).catch((e) => console.error('[household] quotes', e))
  const quotes: Record<string, Quote> = await quotesFor(db, tickers)
  // Cached FMP profiles (never a new call here) for sector / country.
  const profKeys = tickers.map((t) => `profile:symbol=${t}`)
  const prof = profKeys.length ? await db.select<{ key: string; value: { data?: { sector?: string; country?: string; isEtf?: boolean; isFund?: boolean }[] } }[]>('fmp_cache', `select=key,value&key=in.(${profKeys.map(encodeURIComponent).join(',')})`) : { ok: true as const, data: [] }
  const profileBy = new Map<string, { sector?: string; country?: string; isEtf?: boolean; isFund?: boolean }>()
  for (const r of prof.ok ? prof.data : []) { const p = r.value?.data?.[0]; if (p) profileBy.set(r.key.slice('profile:symbol='.length), p) }

  const acctBy = new Map(accts.data.map((a) => [a.id, a]))
  const holdings: HoldingRow[] = holdingsRaw.map((h) => {
    const s = secById.get(h.security_id) ?? { id: h.security_id, ticker: null, name: null, type: null, cusip: null, is_cash_equivalent: false, close_price: null, close_price_as_of: null }
    const a = acctBy.get(h.account_id)
    const q = s.ticker ? quotes[s.ticker] : undefined
    const price = q?.price ?? h.institution_price ?? s.close_price ?? null
    const price_source: HoldingRow['price_source'] = q ? q.source : 'institution'
    const value_cents = price != null && !s.is_cash_equivalent ? round(Number(h.quantity) * price * 100) : Number(h.institution_value_cents)
    const gain_cents = h.cost_basis_cents != null ? value_cents - Number(h.cost_basis_cents) : null
    const p = s.ticker ? profileBy.get(s.ticker) : undefined
    return {
      account_id: h.account_id, account_name: `${a?.name ?? 'Account'}${a?.mask ? ` ···${a.mask}` : ''}`, institution: a?.institution ?? null,
      security_id: s.id, ticker: s.ticker, name: s.name, type: s.type, is_cash_equivalent: !!s.is_cash_equivalent,
      quantity: Number(h.quantity), cost_basis_cents: h.cost_basis_cents != null ? Number(h.cost_basis_cents) : null,
      institution_price: h.institution_price, institution_value_cents: Number(h.institution_value_cents), as_of: h.as_of,
      price, price_source, price_as_of: q?.as_of ?? h.as_of, change_pct: q?.change_pct ?? null,
      value_cents, gain_cents, gain_pct: gain_cents != null && h.cost_basis_cents ? (gain_cents / Number(h.cost_basis_cents)) * 100 : null,
      weight: 0, bucket: classify(s, p, overrides), sector: p?.sector ?? null,
    }
  })
  const investments_cents = holdings.reduce((n, h) => n + h.value_cents, 0)
  for (const h of holdings) h.weight = investments_cents > 0 ? (h.value_cents / investments_cents) * 100 : 0

  // Account values: brokerages = their holdings when we have any, else the balance.
  const heldBy = new Map<string, { value: number; n: number }>()
  for (const h of holdings) { const x = heldBy.get(h.account_id) ?? { value: 0, n: 0 }; x.value += h.value_cents; x.n++; heldBy.set(h.account_id, x) }
  const accounts: AccountRow[] = accts.data.map((a) => {
    const hb = heldBy.get(a.id)
    const bal = Number(a.balance_current_cents ?? 0)
    return { ...a, value_cents: a.is_liability ? bal : hb?.n ? hb.value : bal, holdings_count: hb?.n ?? 0 }
  })
  const assets_cents = accounts.filter((a) => !a.is_liability).reduce((n, a) => n + a.value_cents, 0)
  const liabilities_cents = accounts.filter((a) => a.is_liability).reduce((n, a) => n + Math.abs(a.value_cents), 0)
  const total_cents = assets_cents - liabilities_cents

  // Snapshots: write today's, read the comparison points.
  const today = chicagoDay()
  const yearStart = `${today.slice(0, 4)}-01-01`
  const ago = (d: number) => new Date(Date.parse(today + 'T12:00:00Z') - d * 86400_000).toISOString().slice(0, 10)
  if (accounts.length) {
    await db.upsert('household_snapshots', [{ day: today, net_worth_cents: total_cents, assets_cents, liabilities_cents, by_account: accounts.map((a) => ({ id: a.id, value_cents: a.value_cents })) }], 'day')
  }
  const snaps = await db.select<{ day: string; net_worth_cents: number }[]>('household_snapshots', `select=day,net_worth_cents&day=lt.${today}&order=day.desc&limit=400`)
  const at = (onOrBefore: string) => (snaps.ok ? snaps.data.find((s) => s.day <= onOrBefore) : undefined)
  const delta = (s: { net_worth_cents: number } | undefined) => (s ? total_cents - Number(s.net_worth_cents) : null)
  const deltas = { d1_cents: delta(at(ago(1))), d30_cents: delta(at(ago(30))), ytd_cents: delta(at(ago(1)) && at(yearStart) ? at(yearStart) : undefined) }

  // Allocation: holdings by bucket, plus depository cash as cash.
  const actual_cents = { equity_us: 0, equity_intl: 0, bonds: 0, cash: 0, other: 0 } as Record<Bucket, number>
  for (const h of holdings) actual_cents[h.bucket] += h.value_cents
  const depositoryCash = accounts.filter((a) => !a.is_liability && a.account_type === 'depository').reduce((n, a) => n + Number(a.balance_available_cents ?? a.balance_current_cents ?? 0), 0)
  actual_cents.cash += depositoryCash
  const allocTotal = BUCKETS.reduce((n, b) => n + actual_cents[b], 0)
  const actual_pct = Object.fromEntries(BUCKETS.map((b) => [b, allocTotal > 0 ? (actual_cents[b] / allocTotal) * 100 : 0])) as Record<Bucket, number>
  const drift_pts = Object.fromEntries(BUCKETS.map((b) => [b, actual_pct[b] - (target[b] ?? 0)])) as Record<Bucket, number>

  // Cash buffer: cash on hand vs average monthly outflow over the last 90 days.
  const since = ago(90)
  const flows = await db.select<{ amount_cents: number; plaid_category: string | null }[]>('transactions', `select=amount_cents,plaid_category&scope=eq.household&posted_on=gte.${since}&amount_cents=gt.0`)
  const outflow = (flows.ok ? flows.data : []).filter((t) => !/^TRANSFER|^LOAN_PAYMENTS|^BANK_FEES$/.test(t.plaid_category ?? '')).reduce((n, t) => n + Number(t.amount_cents), 0)
  const avg_monthly_outflow_cents = round(outflow / 3)
  const cashCents = actual_cents.cash
  const cash = { cents: cashCents, avg_monthly_outflow_cents, months: avg_monthly_outflow_cents > 0 ? cashCents / avg_monthly_outflow_cents : null, target_months: targetMonths }

  // Concentration: biggest names and sectors by weight of investments.
  const byName = new Map<string, number>()
  const bySector = new Map<string, number>()
  for (const h of holdings) {
    if (h.is_cash_equivalent) continue
    const key = h.ticker ?? h.name ?? h.security_id
    byName.set(key, (byName.get(key) ?? 0) + h.weight)
    if (h.sector) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.weight)
  }
  const concentration = {
    names: Array.from(byName).map(([ticker, weight]) => ({ ticker, weight })).sort((a, b) => b.weight - a.weight).slice(0, 8),
    sectors: Array.from(bySector).map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight).slice(0, 8),
  }

  return {
    asOf: new Date().toISOString(), accounts, holdings: holdings.sort((a, b) => b.value_cents - a.value_cents),
    netWorth: { total_cents, assets_cents, liabilities_cents, investments_cents },
    deltas, allocation: { actual_cents, actual_pct, target_pct: target, drift_pts }, cash, concentration,
    fmp: await fmpStatus(db), settings,
  }
}

/** Household cash flow by Plaid category over the last `days` days (positive = money out). */
export async function cashflowByCategory(db: StudioDb, days = 90) {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const r = await db.select<{ amount_cents: number; plaid_category: string | null; merchant: string | null; posted_on: string }[]>('transactions', `select=amount_cents,plaid_category,merchant,posted_on&scope=eq.household&posted_on=gte.${since}&order=posted_on.desc&limit=3000`)
  const rows = r.ok ? r.data : []
  const by = new Map<string, { out_cents: number; in_cents: number; n: number }>()
  for (const t of rows) {
    const k = t.plaid_category ?? 'UNCATEGORIZED'
    const x = by.get(k) ?? { out_cents: 0, in_cents: 0, n: 0 }
    if (Number(t.amount_cents) > 0) x.out_cents += Number(t.amount_cents); else x.in_cents += -Number(t.amount_cents)
    x.n++; by.set(k, x)
  }
  const categories = Array.from(by).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.out_cents - a.out_cents)
  const income_cents = rows.filter((t) => Number(t.amount_cents) < 0 && /INCOME|TRANSFER_IN/.test(t.plaid_category ?? '')).reduce((n, t) => n - Number(t.amount_cents), 0)
  const outflow_cents = rows.filter((t) => Number(t.amount_cents) > 0 && !/^TRANSFER|^LOAN_PAYMENTS/.test(t.plaid_category ?? '')).reduce((n, t) => n + Number(t.amount_cents), 0)
  // Likely recurring bills: same merchant 3+ times, ~monthly.
  const byMerchant = new Map<string, { dates: string[]; amounts: number[] }>()
  for (const t of rows) {
    if (Number(t.amount_cents) <= 0 || !t.merchant) continue
    const k = t.merchant.toLowerCase().trim()
    const x = byMerchant.get(k) ?? { dates: [], amounts: [] }
    x.dates.push(t.posted_on); x.amounts.push(Number(t.amount_cents)); byMerchant.set(k, x)
  }
  const recurring = Array.from(byMerchant).filter(([, v]) => v.dates.length >= 3).map(([merchant, v]) => {
    const ds = v.dates.map((d) => Date.parse(d)).sort()
    const gaps = ds.slice(1).map((d, i) => (d - ds[i]) / 86400_000)
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    return { merchant, charges: v.dates.length, avg_gap_days: Math.round(avgGap), last_amount_cents: v.amounts[0], last_charge: v.dates[0], monthly: avgGap >= 26 && avgGap <= 35 }
  }).filter((r) => r.monthly).sort((a, b) => b.last_amount_cents - a.last_amount_cents).slice(0, 25)
  return { since, days, income_cents, outflow_cents, categories, recurring, transactions: rows.length }
}

/** Shortcut used by Settings and the advisor. */
export const householdSetting = getSetting
