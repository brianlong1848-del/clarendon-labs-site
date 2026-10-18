import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { setSeriesState } from '@/lib/publish/series'

// PATCH /api/publish/series?id=&action=pause|resume|end — control a repeating post.
// Pause and end skip the copy that's waiting; resume picks up from the next
// time on the schedule after now (missed times are not posted late).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const action = q.get('action')
  if (action !== 'pause' && action !== 'resume' && action !== 'end') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  try {
    const series = await setSeriesState(q.get('id') ?? '', action)
    return series ? NextResponse.json({ series }) : NextResponse.json({ error: 'Not found.' }, { status: 404 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
