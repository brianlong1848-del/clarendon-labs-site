import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { PLATFORMS, type Platform } from '@/lib/publish/rules'
import { bestSlots, heatFor, suggestWeekly } from '@/lib/publish/timing'

// GET /api/publish/besttime?app=&platforms=instagram,tiktok&perWeek=2&tz=America/Chicago
//   → { heat[168], basis, reason, best[] (next 5 best hours, 12h apart),
//       auto[] (the next ~4 copies an auto repeat would use), weekly {days,times} }
// Used by "Best time" in Schedule, "Suggest days & times" and the auto repeat
// preview on /post and in the Studio app.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const app = q.get('app') ?? ''
  if (!PUBLISH_APPS.some((a) => a.id === app)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  const platforms = (q.get('platforms') ?? '').split(',').filter((p): p is Platform => PLATFORMS.some((x) => x.id === p))
  const perWeek = Math.max(1, Math.min(14, Number(q.get('perWeek')) || 2))
  let tz = q.get('tz') || 'America/Chicago'
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { tz = 'America/Chicago' }

  try {
    const h = await heatFor(app, platforms, tz)
    const gap = Math.max(12, Math.round((168 / perWeek) * 0.6))
    const auto: Date[] = []
    let cursor = new Date(0)
    for (let i = 0; i < 4; i++) {
      const plan = bestSlots(h.heat, new Date(Math.max(Date.now(), cursor.getTime() + gap * 3600_000 - 3600_000)), perWeek, tz, gap)
      const next = plan.sort((a, b) => a.getTime() - b.getTime())[0]
      if (!next) break
      auto.push(next); cursor = next
    }
    return NextResponse.json({
      ...h,
      best: bestSlots(h.heat, new Date(), 5, tz, 12).map((d) => d.toISOString()),
      auto: auto.map((d) => d.toISOString()),
      weekly: suggestWeekly(h.heat, Math.max(1, Math.min(7, Number(q.get('days')) || perWeek))),
    })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
