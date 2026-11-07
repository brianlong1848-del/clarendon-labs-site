import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { PLAID_DAYS_REQUESTED, PLAID_WEBHOOK_URL, plaid, plaidConfigured, plaidEnv, plaidSandboxAvailable, productsFor, type LinkKind } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'

// Link token for Plaid Link.
//   { itemId }                      update mode for an item that needs re-auth (no new item)
//   { kind: 'bank' | 'brokerage' }  what is being connected → products (default bank → transactions)
//   { env: 'sandbox' }              household testing against Plaid's sandbox while Investments is in review
// The scope (studio | household) is decided at exchange time, not here.
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db || !plaidConfigured()) return NextResponse.json({ error: 'Plaid or studio DB env not configured' }, { status: 500 })
  const b = await req.json().catch(() => ({}))
  const itemId: string | undefined = typeof b.itemId === 'string' ? b.itemId : undefined
  const kind: LinkKind = b.kind === 'brokerage' ? 'brokerage' : 'bank'
  const env = b.env === 'sandbox' ? 'sandbox' : plaidEnv()
  if (env === 'sandbox' && !plaidSandboxAvailable()) return NextResponse.json({ error: 'Sandbox isn’t configured (PLAID_SANDBOX_SECRET).' }, { status: 400 })
  try {
    let access_token: string | undefined
    if (itemId) {
      const t = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
      if (t.ok && t.data) access_token = t.data
    }
    const products = productsFor(kind)
    const out = await plaid('/link/token/create', {
      client_name: 'Clarendon Labs', language: 'en', country_codes: ['US'],
      user: { client_user_id: db.owner },
      webhook: PLAID_WEBHOOK_URL,
      // OAuth banks send the user back here; must match Plaid Dashboard → Allowed redirect URIs exactly.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
      ...(access_token
        ? { access_token }
        : { products, ...(products.includes('transactions') ? { transactions: { days_requested: PLAID_DAYS_REQUESTED } } : {}) }),
    }, access_token ? {} : { env })
    return NextResponse.json({ link_token: out.link_token, products, env })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
