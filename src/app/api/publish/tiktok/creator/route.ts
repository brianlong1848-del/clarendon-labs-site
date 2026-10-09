import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { creatorInfo, tiktokAudited, tiktokToken } from '@/lib/publish/tiktok'

// GET ?app=<id> → what TikTok allows for this account right now: nickname,
// privacy choices, which interactions are switched off, longest video. TikTok
// requires the composer to ask for this fresh before each post.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const appId = new URL(req.url).searchParams.get('app') ?? ''
  if (!PUBLISH_APPS.some((a) => a.id === appId)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  try {
    const row = await tiktokToken(appId)
    if (!row) return NextResponse.json({ error: 'TikTok isn’t connected for this app.' }, { status: 404 })
    return NextResponse.json({ creator: await creatorInfo(row.token), audited: tiktokAudited() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
