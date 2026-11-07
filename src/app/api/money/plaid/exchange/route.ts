import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { connectItem, productsFor } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// After Plaid Link succeeds: swap the public token, vault the access token,
// create the account rows (tagged business or personal, studio or household,
// with Plaid's type/subtype), run the first sync for each linked product.
//   { public_token, ownership: 'business' | 'personal' }                 Money (scope studio)
//   { public_token, scope: 'household', kind: 'bank' | 'brokerage' }     Household (always personal)
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const b = await req.json().catch(() => ({}))
  const { public_token } = b
  const scope: 'studio' | 'household' = b.scope === 'household' ? 'household' : 'studio'
  const ownership: 'business' | 'personal' = scope === 'household' ? 'personal' : b.ownership
  if (typeof public_token !== 'string' || !['business', 'personal'].includes(ownership)) {
    return NextResponse.json({ error: 'public_token and ownership (business|personal) required' }, { status: 400 })
  }
  const products = productsFor(scope === 'household' && b.kind === 'brokerage' ? 'brokerage' : 'bank')
  try {
    return NextResponse.json(await connectItem(db, public_token, ownership, { scope, products }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
