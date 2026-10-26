import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { driveConfigured, fileStream } from '@/lib/drive'

// One Drive file's bytes, streamed to the phone (GET ?id=<fileId>). Studio then
// prepares and uploads it exactly like a pick from Photos or Files, so the
// composer, AI frames and per-platform matching all work unchanged.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !/^[\w-]+$/.test(id)) return NextResponse.json({ error: 'Which file?' }, { status: 400 })
  try {
    const upstream = await fileStream(id)
    const headers = new Headers({ 'Cache-Control': 'private, no-store' })
    for (const h of ['content-type', 'content-length']) { const v = upstream.headers.get(h); if (v) headers.set(h, v) }
    return new Response(upstream.body, { status: 200, headers })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: driveConfigured() ? 502 : 503 })
  }
}
