import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { connectItem, plaid, plaidEnv } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// SANDBOX ONLY. Creates a fake bank connection (Plaid's "First Platypus Bank"
// test institution) without the Link UI, so the whole pipeline can be exercised
// with fake data. Refuses to run unless PLAID_ENV=sandbox.
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  if (plaidEnv() !== 'sandbox') return NextResponse.json({ error: 'sandbox only' }, { status: 403 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const { ownership } = await req.json().catch(() => ({}))
  try {
    const pt = await plaid('/sandbox/public_token/create', {
      institution_id: 'ins_109508', initial_products: ['transactions'],
      options: { webhook: `${process.env.SITE_ORIGIN ?? new URL(req.url).origin}/api/plaid/webhook` },
    })
    return NextResponse.json(await connectItem(db, pt.public_token, ownership === 'business' ? 'business' : 'personal'))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
