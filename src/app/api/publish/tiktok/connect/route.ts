import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { authorizeUrl, tiktokConfigured } from '@/lib/publish/tiktok'

// POST ?app=<id> → { url } to send the browser to TikTok's sign-in. TikTok
// shows its account picker every time, so pick the app's own account there.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const appId = new URL(req.url).searchParams.get('app') ?? ''
  if (!PUBLISH_APPS.some((a) => a.id === appId)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  if (!tiktokConfigured()) return NextResponse.json({ error: 'Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET first.' }, { status: 503 })
  return NextResponse.json({ url: authorizeUrl(appId) })
}
