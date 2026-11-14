import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { buildCalendar } from '@/lib/publish/calendar'

// ─── GET /api/publish/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&app=<id>|all][&country=<iso2>]
//
// The /post Calendar (and Studio's): posts in the range plus a footer of
// numbers per day and the World strip → CalendarResponse (lib/publish/calendar.ts).
// `from`/`to` are inclusive America/Chicago days, at most 400 days apart.
// &only=posts skips the store / ad / scoreboard reads (days + world come back empty).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return bad('not authorised', 401)
  const q = new URL(req.url).searchParams
  const from = q.get('from') ?? '', to = q.get('to') ?? ''
  if (!DATE.test(from) || !DATE.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) return bad('from and to must be YYYY-MM-DD.')
  if (to < from) return bad('to is before from.')
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) return bad('400 days at most.')
  const app = q.get('app') || 'all'
  if (app !== 'all' && !PUBLISH_APPS.some((a) => a.id === app)) return bad('Unknown app.')
  const country = q.get('country')?.toLowerCase() || null
  if (country && !/^[a-z]{2}$/.test(country)) return bad('country must be an ISO-2 code.')
  try {
    return NextResponse.json(await buildCalendar({ from, to, app, country, appIds: PUBLISH_APPS.map((a) => a.id), ...(q.get('only') === 'posts' ? { only: 'posts' as const } : {}) }))
  } catch (e) { return bad((e as Error).message, 500) }
}
