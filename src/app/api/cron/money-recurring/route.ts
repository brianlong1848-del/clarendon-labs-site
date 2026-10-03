import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'

// Vercel Cron, daily (vercel.json): posts every due manual subscription as a
// transaction via post_due_recurring() in clarendon-studio. The function is
// idempotent (one row per subscription per date), so a retry can't double-post.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const r = await db.rpc<number>('post_due_recurring', {})
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ posted: r.data })
}
