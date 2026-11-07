// ─── Plaid Investments (Household) ───────────────────────────────────────────
//
// SERVER ONLY. Holdings and investment transactions for brokerage / retirement
// / HSA items linked with the `investments` product (FEAT-CLA-027 section C).
// Read-only by design: nothing in this file, or anywhere in the console, calls
// a brokerage or bank *write* API. Plaid gives us balances, positions and the
// trade history; the household acts on advice themselves.
//
//   /investments/holdings/get      → securities (upsert) + holdings (one row per
//                                    account × security; rows Plaid no longer
//                                    returns are deleted) + account balances
//   /investments/transactions/get  → investment_transactions, paginated with
//                                    offset; first run 24 months, then from the
//                                    last synced date − 7 days
//
// Runs from the household cron, the HOLDINGS / INVESTMENTS_TRANSACTIONS
// webhooks, and "Sync now" on the Household page. Plaid's Investments Refresh
// add-on is not used: daily is enough, FMP covers intraday prices.

import { plaid } from './plaid'
import type { StudioDb } from './studioDb'

export type InvestSyncResult = { itemId: string; holdings?: number; securities?: number; transactions?: number; error?: string }

const cents = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null)
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)

async function markItem(db: StudioDb, itemId: string, fields: Record<string, unknown>) {
  const r = await db.patch('plaid_items', `id=eq.${encodeURIComponent(itemId)}`, { ...fields, updated_at: new Date().toISOString() })
  if (!r.ok) console.error(`[plaid-inv] status write ${itemId}: ${r.error}`)
}

const securityRow = (s: any) => ({
  id: s.security_id, ticker: s.ticker_symbol ?? null, name: s.name ?? null, type: s.type ?? null,
  cusip: s.cusip ?? null, isin: s.isin ?? null, currency: s.iso_currency_code ?? 'USD',
  is_cash_equivalent: !!s.is_cash_equivalent,
  close_price: typeof s.close_price === 'number' ? s.close_price : null,
  close_price_as_of: s.close_price_as_of ?? null,
  updated_at: new Date().toISOString(),
})

const balanceFields = (a: any) => ({
  balance_current_cents: cents(a.balances?.current), balance_available_cents: cents(a.balances?.available),
  balance_currency: a.balances?.iso_currency_code ?? null, balance_updated_at: new Date().toISOString(),
})

/** Everything Plaid knows about one investments item: positions, then the trade history. */
export async function syncInvestments(db: StudioDb, itemId: string): Promise<InvestSyncResult> {
  const id = encodeURIComponent(itemId)
  const fail = async (error: string, extra: Record<string, unknown> = {}): Promise<InvestSyncResult> => {
    console.error(`[plaid-inv] ${itemId}: ${error}`)
    await markItem(db, itemId, { last_error: error.slice(0, 500), ...extra })
    return { itemId, error }
  }

  const tok = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
  if (!tok.ok || !tok.data) return fail(tok.ok ? 'no access token stored' : tok.error)
  const accessToken = tok.data

  const [item, accts] = await Promise.all([
    db.select<any[]>('plaid_items', `select=investments_synced_to,products&id=eq.${id}`),
    db.select<any[]>('money_accounts', `select=id,plaid_account_id&plaid_item_id=eq.${id}`),
  ])
  if (!item.ok || !accts.ok) return fail(`db read failed: ${[item, accts].map((r) => (r.ok ? '' : r.error)).join(' ').trim()}`)
  if (!accts.data.length) return { itemId, error: 'no account rows yet (exchange still running?)' }
  const accountId = new Map<string, string>(accts.data.map((a: any) => [a.plaid_account_id, a.id as string]))

  let securities = 0, holdings = 0, transactions = 0
  try {
    // ── Holdings ──
    const h = await plaid('/investments/holdings/get', { access_token: accessToken })
    const secRows = ((h.securities ?? []) as any[]).map(securityRow)
    if (secRows.length) {
      const up = await db.upsert('securities', secRows, 'id')
      if (!up.ok) return fail(up.error)
      securities = secRows.length
    }
    const asOf = today()
    const hRows = ((h.holdings ?? []) as any[])
      .filter((x) => accountId.has(x.account_id) && x.security_id)
      .map((x) => ({
        account_id: accountId.get(x.account_id)!, security_id: x.security_id, owner_id: db.owner,
        quantity: Number(x.quantity ?? 0),
        cost_basis_cents: cents(x.cost_basis),
        institution_price: typeof x.institution_price === 'number' ? x.institution_price : null,
        institution_value_cents: cents(x.institution_value) ?? 0,
        as_of: x.institution_price_as_of ?? asOf,
        updated_at: new Date().toISOString(),
      }))
    if (hRows.length) {
      const up = await db.upsert('holdings', hRows, 'account_id,security_id')
      if (!up.ok) return fail(up.error)
    }
    holdings = hRows.length
    // Positions that are gone (sold out) disappear from the response: drop them.
    const ids = Array.from(accountId.values())
    const existing = await db.select<any[]>('holdings', `select=account_id,security_id&account_id=in.(${ids.join(',')})`)
    if (existing.ok) {
      const keep = new Set(hRows.map((r) => `${r.account_id}|${r.security_id}`))
      const stale = existing.data.filter((e) => !keep.has(`${e.account_id}|${e.security_id}`))
      for (const s of stale) await db.remove('holdings', `account_id=eq.${s.account_id}&security_id=eq.${encodeURIComponent(s.security_id)}`)
    }
    for (const a of (h.accounts ?? []) as any[]) {
      if (!accountId.has(a.account_id)) continue
      await db.patch('money_accounts', `plaid_account_id=eq.${encodeURIComponent(a.account_id)}`, { ...balanceFields(a), account_type: a.type ?? null, account_subtype: a.subtype ?? null })
    }

    // ── Transactions ──
    const since: string | null = item.data[0]?.investments_synced_to ?? null
    const start = since ? new Date(Date.parse(since) - 7 * 86400_000).toISOString().slice(0, 10) : daysAgo(730)
    const end = today()
    let offset = 0, total = Infinity
    const deadline = Date.now() + 40_000
    while (offset < total && Date.now() < deadline) {
      const page = await plaid('/investments/transactions/get', {
        access_token: accessToken, start_date: start, end_date: end, options: { count: 500, offset },
      })
      total = Number(page.total_investment_transactions ?? 0)
      const moreSecs = ((page.securities ?? []) as any[]).map(securityRow)
      if (moreSecs.length) await db.upsert('securities', moreSecs, 'id')
      const rows = ((page.investment_transactions ?? []) as any[])
        .filter((t) => accountId.has(t.account_id))
        .map((t) => ({
          id: t.investment_transaction_id, owner_id: db.owner, account_id: accountId.get(t.account_id)!,
          security_id: t.security_id ?? null, posted_on: t.date, type: t.type ?? 'other', subtype: t.subtype ?? null,
          quantity: typeof t.quantity === 'number' ? t.quantity : null, price: typeof t.price === 'number' ? t.price : null,
          amount_cents: cents(t.amount) ?? 0, fees_cents: cents(t.fees) ?? 0, name: t.name ?? null,
        }))
      if (rows.length) {
        const up = await db.upsert('investment_transactions', rows, 'id')
        if (!up.ok) return fail(up.error)
      }
      transactions += rows.length
      offset += (page.investment_transactions ?? []).length
      if (!(page.investment_transactions ?? []).length) break
    }
    if (offset >= total) await markItem(db, itemId, { investments_synced_to: end, last_synced_at: new Date().toISOString(), last_error: null, status: 'ok' })
    else await markItem(db, itemId, { last_error: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/PRODUCT_NOT_READY/.test(msg)) {
      await markItem(db, itemId, { last_error: 'Plaid is still pulling holdings from the brokerage — will retry when it says it is ready.' })
      return { itemId, securities, holdings, transactions, error: 'pending' }
    }
    if (/ITEM_LOGIN_REQUIRED|PENDING_EXPIRATION|ACCESS_NOT_GRANTED/.test(msg)) return fail(msg, { status: 'needs_reauth' })
    return fail(msg)
  }
  console.log(`[plaid-inv] ${itemId}: ${securities} securities, ${holdings} holdings, ${transactions} transactions`)
  return { itemId, securities, holdings, transactions }
}

/** Every household item: transactions items run /transactions/sync, investments items run the above. */
export async function syncHousehold(db: StudioDb) {
  const { syncItem } = await import('./plaid')
  const items = await db.select<{ id: string; institution: string | null; products: string[] | null }[]>('plaid_items', "select=id,institution,products&scope=eq.household&order=institution")
  if (!items.ok) throw new Error(items.error)
  return Promise.all(items.data.map(async (i) => {
    const products = i.products ?? ['transactions']
    const out: { itemId: string; institution: string | null; transactions?: Awaited<ReturnType<typeof syncItem>>; investments?: InvestSyncResult } = { itemId: i.id, institution: i.institution }
    if (products.includes('transactions')) out.transactions = await syncItem(db, i.id)
    if (products.includes('investments')) out.investments = await syncInvestments(db, i.id)
    return out
  }))
}
