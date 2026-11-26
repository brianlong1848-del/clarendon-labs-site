// ─── Stripe (website sales) → revenue rows ───────────────────────────────────
//
// Website purchases (YulePick Host Pass from the yulepick-ios hostpass_checkout
// function, Gag Order unlocks from gagorder-web /api/checkout) go through one
// Stripe account. This reads its balance transactions — the money that actually
// moved, after Stripe's fee — and writes one row per app per UTC day next to the
// App Store ('asc') and Google Play ('play') rows, as source 'stripe'. Money
// labels it "Website".
//
//   gross_cents    = charges − refunds (what the buyer paid, net of refunds)
//   proceeds_cents = Stripe's net: charges − Stripe fees − refunds
//   units          = number of charges (a refund doesn't take one back)
//
// A refund lands on the day Stripe booked it, like the stores do.
//
// App: the checkout session's metadata.product (yulepick_* → yulepick,
// gagorder_* → gagorder), else the session's success URL / statement
// descriptor, else 'studio'.
//
// Test purchases: charges whose buyer email is in STRIPE_TEST_EMAILS (comma
// list), or whose charge/session metadata has test=true, go to their own rows
// (external_ref 'test', is_test true). The Money views skip those, so they're
// on the books for reference but never count as customer revenue.
//
// Non-USD balance transactions are reported back, not written — same rule as
// ascRevenue.ts.

const API = 'https://api.stripe.com/v1'

export type StripeRevenueRow = {
  owner_id: string
  source: 'stripe'
  app_slug: string
  period: string
  gross_cents: number
  proceeds_cents: number
  currency: 'USD'
  units: number
  external_ref: '' | 'test'
  is_test: boolean
}

type Obj = Record<string, unknown>
type List = { data: Obj[]; has_more: boolean }
type Sale = { app: string; test: boolean }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const meta = (o: Obj | null | undefined) => ((o?.metadata ?? {}) as Record<string, string>)

async function stripeGet<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Stripe ${path.split('?')[0]}: HTTP ${res.status} ${str((j as Obj | null)?.error && ((j as Obj).error as Obj).message)}`.trim())
  return j as T
}

/** Every page of a Stripe list endpoint. `query` must not include limit/starting_after. */
async function listAll(key: string, path: string, query: string): Promise<Obj[]> {
  const out: Obj[] = []
  let after = ''
  for (let page = 0; page < 50; page++) {
    const j = await stripeGet<List>(key, `${path}?limit=100&${query}${after ? `&starting_after=${after}` : ''}`)
    out.push(...j.data)
    if (!j.has_more || !j.data.length) break
    after = str(j.data[j.data.length - 1].id)
  }
  return out
}

function appFrom(product: string, hint: string): string {
  const p = product.toLowerCase(), h = hint.toLowerCase()
  if (p.startsWith('yulepick')) return 'yulepick'
  if (p.startsWith('gagorder')) return 'gagorder'
  if (h.includes('yulepick')) return 'yulepick'
  if (h.includes('gagorder') || h.includes('gag order')) return 'gagorder'
  return 'studio'
}

export function stripeConfigured() { return !!process.env.STRIPE_SECRET_KEY }

export async function stripeRevenueRows(owner: string, days: number) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { error: 'STRIPE_SECRET_KEY not set' as const }
  const testEmails = new Set((process.env.STRIPE_TEST_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
  const since = Math.floor(Date.now() / 1000) - days * 86400

  // Checkout sessions carry metadata.product; charges mostly don't. Look back
  // further than the window so a refund in the window finds its original sale.
  const sessions = await listAll(key, '/checkout/sessions', `created[gte]=${since - 180 * 86400}`)
  const byIntent = new Map<string, Obj>()
  for (const s of sessions) if (str(s.payment_intent)) byIntent.set(str(s.payment_intent), s)

  const txns = await listAll(key, '/balance_transactions', `created[gte]=${since}&expand[]=data.source`)

  const chargeCache = new Map<string, Obj>()
  async function chargeOf(id: string): Promise<Obj | null> {
    if (!id) return null
    if (!chargeCache.has(id)) chargeCache.set(id, await stripeGet<Obj>(key!, `/charges/${id}`).catch(() => ({})))
    return chargeCache.get(id) ?? null
  }
  function classify(charge: Obj | null, intent: string): Sale {
    const s = byIntent.get(intent) ?? null
    const email = (str((charge?.billing_details as Obj | undefined)?.email) || str(charge?.receipt_email)
      || str((s?.customer_details as Obj | undefined)?.email) || str(s?.customer_email)).toLowerCase()
    const test = (!!email && testEmails.has(email)) || meta(charge).test === 'true' || meta(s).test === 'true'
    const product = meta(s).product || meta(charge).product || ''
    const hint = [str(s?.success_url), str(charge?.calculated_statement_descriptor), str(charge?.description), str(charge?.statement_descriptor_suffix)].join(' ')
    return { app: appFrom(product, hint), test }
  }

  const agg = new Map<string, StripeRevenueRow>()
  const other = new Set<string>()
  const skipped: Record<string, number> = {}
  const tests: { period: string; app_slug: string; gross_cents: number; proceeds_cents: number }[] = []
  for (const t of txns) {
    const type = str(t.type)
    const isCharge = type === 'charge' || type === 'payment'
    const isRefund = type === 'refund' || type === 'payment_refund'
    if (!isCharge && !isRefund) { skipped[type] = (skipped[type] ?? 0) + 1; continue }
    const cur = str(t.currency).toUpperCase()
    if (cur !== 'USD') { other.add(cur); continue }
    const src = (typeof t.source === 'object' && t.source ? t.source : {}) as Obj
    const charge = isCharge ? src : await chargeOf(str(src.charge))
    const sale = classify(charge, str(src.payment_intent) || str(charge?.payment_intent))
    const period = new Date(Number(t.created) * 1000).toISOString().slice(0, 10)
    const k = `${sale.app}|${period}|${sale.test}`
    const row = agg.get(k) ?? {
      owner_id: owner, source: 'stripe', app_slug: sale.app, period, gross_cents: 0, proceeds_cents: 0,
      currency: 'USD', units: 0, external_ref: sale.test ? 'test' : '', is_test: sale.test,
    } satisfies StripeRevenueRow
    row.gross_cents += Number(t.amount)
    row.proceeds_cents += Number(t.net)
    if (isCharge) row.units += 1
    agg.set(k, row)
  }
  const rows = Array.from(agg.values()).sort((a, b) => a.period.localeCompare(b.period) || a.app_slug.localeCompare(b.app_slug))
  for (const r of rows) if (r.is_test) tests.push({ period: r.period, app_slug: r.app_slug, gross_cents: r.gross_cents, proceeds_cents: r.proceeds_cents })
  return {
    rows, otherCurrencies: Array.from(other).sort(), skippedTypes: skipped, transactions: txns.length,
    testRows: tests, testEmailsConfigured: testEmails.size,
  }
}
