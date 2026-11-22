import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { buildUpcoming } from '@/lib/upcoming'

// ─── GET /api/upcoming?app=<id>|all&days=14 ──────────────────────────────────
//
// Everything about to go out — scheduled posts (caption per platform, media,
// platforms, country), the next runs of repeating series, and boosts with
// their audience, budget and dates — plus review checks and empty days.
// Shape: UpcomingPayload in src/lib/upcoming.ts. Used by /analytics, each app
// page, the console's Up next, and the Studio app. days: 1–60.

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const app = q.get('app') || 'all'
  if (app !== 'all' && !PUBLISH_APPS.some((a) => a.id === app)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  const days = Math.min(60, Math.max(1, Number(q.get('days')) || 14))
  try {
    return NextResponse.json(await buildUpcoming(app, days))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
