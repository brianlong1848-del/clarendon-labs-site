import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { notify } from '@/lib/push/notify'
import { ascRevenueRows } from '@/lib/money/ascRevenue'
import { playRevenueRows } from '@/lib/money/playRevenue'
import { stripeRevenueRows } from '@/lib/money/stripeRevenue'

// Nightly (see vercel.json): pull App Store Connect daily sales → revenue rows
// in the studio money database, then Google Play's estimated proceeds (source
// 'play', src/lib/money/playRevenue.ts) and website sales from Stripe (source
// 'stripe', src/lib/money/stripeRevenue.ts; Money calls it "Website") in the same run. Idempotent —
// re-running just rewrites the same (source, app, day) rows, so a short
// overlapping window is safe and heals late-published days. Backfill by
// calling it signed in with ?days=90.
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

  // Google Play, same window. A Play problem never fails the App Store write above.
  const play = await playRevenueRows(db.owner, days).catch((e) => ({ error: e instanceof Error ? e.message : 'Play reports unavailable' as string }))
  let playResult: Record<string, unknown>
  if ('error' in play) playResult = { error: play.error }
  else {
    const savedPlay = await db.upsert('revenue', play.rows, 'source,app_slug,period,external_ref')
    playResult = savedPlay.ok
      ? { rowsWritten: play.rows.length, reportDate: play.reportDate, otherCurrencies: play.otherCurrencies, failedApps: play.failedApps }
      : { error: savedPlay.error, rowsWritten: 0 }
  }

  // Stripe (website sales), same window. Like Play, a Stripe problem never fails the store writes.
  const stripe = await stripeRevenueRows(db.owner, days).catch((e) => ({ error: e instanceof Error ? e.message : 'Stripe unavailable' as string }))
  let stripeResult: Record<string, unknown>
  if ('error' in stripe) stripeResult = { error: stripe.error }
  else {
    const savedStripe = await db.upsert('revenue', stripe.rows, 'source,app_slug,period,external_ref')
    const byApp: Record<string, { gross_cents: number; proceeds_cents: number; units: number }> = {}
    for (const r of stripe.rows) {
      if (r.is_test) continue
      const x = (byApp[r.app_slug] ??= { gross_cents: 0, proceeds_cents: 0, units: 0 })
      x.gross_cents += r.gross_cents; x.proceeds_cents += r.proceeds_cents; x.units += r.units
    }
    stripeResult = savedStripe.ok
      ? { rowsWritten: stripe.rows.length, transactions: stripe.transactions, byApp, testRows: stripe.testRows,
          otherCurrencies: stripe.otherCurrencies, skippedTypes: stripe.skippedTypes, testEmailsConfigured: stripe.testEmailsConfigured }
      : { error: savedStripe.error, rowsWritten: 0 }
  }

  // Studio push (FEAT-CLA-027): the newest day with money in it — only when there was any.
  if (cron) {
    const playRows = 'error' in play ? [] : play.rows
    const stripeRows = 'error' in stripe ? [] : stripe.rows.filter((r) => !r.is_test)
    const all = [...out.rows.map((r) => ({ ...r, store: 'App Store' })), ...playRows.map((r) => ({ ...r, store: 'Google Play' })), ...stripeRows.map((r) => ({ ...r, store: 'Website' }))]
    const latest = all.filter((r) => r.proceeds_cents > 0).sort((a, b) => b.period.localeCompare(a.period))[0]
    if (latest) {
      const sameDay = all.filter((r) => r.period === latest.period && r.proceeds_cents > 0)
      const total = sameDay.reduce((s, r) => s + r.proceeds_cents, 0)
      const stores = Array.from(new Set(sameDay.map((r) => r.store)))
      const apps = sameDay.map((r) => `${r.app_slug} $${(r.proceeds_cents / 100).toFixed(2)}${stores.length > 1 ? ` (${r.store})` : ''}`).join(' · ')
      await notify({ kind: 'sales', title: `$${(total / 100).toFixed(2)} in ${stores.length > 1 ? 'sales' : stores[0]} proceeds · ${latest.period}`, body: apps, link: 'studio://money', dedupe: `sales:${latest.period}` }).catch(() => undefined)
    }
  }
  return NextResponse.json({
    ok: true, daysChecked: out.daysChecked, rowsWritten: out.rows.length,
    otherCurrencies: out.otherCurrencies, failedDays: out.failedDays,
    play: playResult,
    stripe: stripeResult,
  })
}
