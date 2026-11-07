import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { connectItem, plaid, plaidSandboxAvailable, productsFor } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// SANDBOX ONLY. Creates a fake connection to Plaid's test institution
// ("First Platypus Bank", ins_109508 — it has investment accounts too) without
// the Link UI, so the whole pipeline can be exercised with fake data.
//   { ownership }                                   Money: a test bank (transactions)
//   { scope: 'household', kind: 'bank'|'brokerage' } Household: a test bank or test brokerage
// Runs when PLAID_ENV=sandbox, or in production when PLAID_SANDBOX_SECRET is set
// (household investments are tested this way until Plaid approves the product).
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  if (!plaidSandboxAvailable()) return NextResponse.json({ error: 'sandbox only (set PLAID_SANDBOX_SECRET to use it next to production)' }, { status: 403 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const b = await req.json().catch(() => ({}))
  const scope: 'studio' | 'household' = b.scope === 'household' ? 'household' : 'studio'
  const ownership: 'business' | 'personal' = scope === 'household' ? 'personal' : b.ownership === 'business' ? 'business' : 'personal'
  const products = productsFor(scope === 'household' && b.kind === 'brokerage' ? 'brokerage' : 'bank')
  try {
    const pt = await plaid('/sandbox/public_token/create', {
      institution_id: 'ins_109508', initial_products: products,
      options: { webhook: `${process.env.SITE_ORIGIN ?? new URL(req.url).origin}/api/plaid/webhook` },
    }, { env: 'sandbox' })
    return NextResponse.json(await connectItem(db, pt.public_token, ownership, { scope, products }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
