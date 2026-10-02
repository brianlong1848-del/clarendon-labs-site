import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { connectItem } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// After Plaid Link succeeds: swap the public token, vault the access token,
// create the account rows (tagged business or personal), run the first sync.
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const { public_token, ownership } = await req.json().catch(() => ({}))
  if (typeof public_token !== 'string' || !['business', 'personal'].includes(ownership)) {
    return NextResponse.json({ error: 'public_token and ownership (business|personal) required' }, { status: 400 })
  }
  try {
    return NextResponse.json(await connectItem(db, public_token, ownership))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
