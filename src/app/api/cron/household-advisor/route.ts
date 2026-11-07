import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { advisorConfigured, runAdvisor, weeklyDue } from '@/lib/household/advisor'

// Vercel Cron, hourly (vercel.json). Runs the weekly household brief when the
// configured hour (household_settings.advisor_schedule, default Monday 07:00
// Central) comes round and no weekly run happened in the last six days. Then
// pushes a Studio notification, when push is wired (see studio-ios handoff).
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  if (!advisorConfigured()) return NextResponse.json({ skipped: 'ANTHROPIC_API_KEY not set' })
  if (!(await weeklyDue(db))) return NextResponse.json({ skipped: 'not due' })
  try {
    const r = await runAdvisor(db, 'weekly')
    console.log(`[advisor] weekly brief ${r.id}: ${r.output.actions.length} actions`)
    await notifyStudio('Household brief is ready', r.output.summary_md.slice(0, 120)).catch((e) => console.error('[advisor] push', e))
    return NextResponse.json({ ran: r.id, actions: r.output.actions.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

/** Studio push: posts to STUDIO_PUSH_URL (bearer STUDIO_PUSH_TOKEN) when those are set; otherwise a no-op. */
async function notifyStudio(title: string, body: string) {
  const url = process.env.STUDIO_PUSH_URL, token = process.env.STUDIO_PUSH_TOKEN
  if (!url || !token) return
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, body, route: '/household/advisor' }), signal: AbortSignal.timeout(10_000) })
}
