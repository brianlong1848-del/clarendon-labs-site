import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { ascRevenueRows } from '@/lib/money/ascRevenue'

// Nightly (see vercel.json): pull App Store Connect daily sales → revenue rows
// in the studio money database. Idempotent — re-running just rewrites the same
// (source, app, day) rows, so a short overlapping window is safe and heals
// late-published days. Backfill by calling it signed in with ?days=90.
//
// Auth: Vercel Cron's CRON_SECRET bearer, or the signed-in admin session.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const cron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` && !!process.env.CRON_SECRET
  if (!cron && !(await consoleAuthed())) return new NextResponse('Unauthorized', { status: 401 })

  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'Studio DB env missing (STUDIO_SUPABASE_SERVICE_KEY / STUDIO_OWNER_ID)' }, { status: 500 })

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 7, 1), 120)
  const out = await ascRevenueRows(db.owner, days)
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })

  const saved = await db.upsert('revenue', out.rows, 'source,app_slug,period,external_ref')
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 })
  return NextResponse.json({
    ok: true, daysChecked: out.daysChecked, rowsWritten: out.rows.length,
    otherCurrencies: out.otherCurrencies, failedDays: out.failedDays,
  })
}
