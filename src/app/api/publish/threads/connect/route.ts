import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { THREADS_SCOPES, signState, threadsRedirect } from '@/lib/publish/tokens'

// POST ?app=<id> → { url } to send the browser (or Studio iOS) to Threads'
// sign-in. Whichever Threads account is signed in on threads.net is the one
// that gets connected to this app.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!consoleAuthed(req)) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const appId = new URL(req.url).searchParams.get('app') ?? ''
  if (!PUBLISH_APPS.some((a) => a.id === appId)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  const clientId = process.env.THREADS_APP_ID
  if (!clientId || !process.env.THREADS_APP_SECRET) return NextResponse.json({ error: 'Set THREADS_APP_ID and THREADS_APP_SECRET first.' }, { status: 503 })
  const url = new URL('https://threads.net/oauth/authorize')
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: threadsRedirect(req), scope: THREADS_SCOPES,
    response_type: 'code', state: signState(appId),
  }).toString()
  return NextResponse.json({ url: url.toString() })
}
