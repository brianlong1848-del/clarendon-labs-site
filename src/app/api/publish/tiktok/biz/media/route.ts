import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { bizConfigured, ensureMediaVerified } from '@/lib/publish/tiktokBiz'

// POST → one-time (idempotent) check that TikTok has verified the studio-media
// URL prefix as ours, so it will pull videos from it.
export const dynamic = 'force-dynamic'

export async function POST() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  if (!bizConfigured()) return NextResponse.json({ error: 'Set TIKTOK_BIZ_SECRET and TIKTOK_BIZ_AUTH_URL first.' }, { status: 503 })
  try { return NextResponse.json(await ensureMediaVerified()) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
