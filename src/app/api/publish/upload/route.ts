import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { signedUpload } from '@/lib/publish/store'

// Hands the composer a one-time upload URL in the studio-media bucket. The
// file goes straight from the browser/iPhone to storage; platforms then pull
// it from the public URL.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!consoleAuthed(req)) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const { appId, filename } = await req.json().catch(() => ({}))
  if (!PUBLISH_APPS.some((a) => a.id === appId)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  try { return NextResponse.json(await signedUpload(appId, String(filename ?? 'file'))) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
