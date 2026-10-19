import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { PLATFORMS, type MediaItem, type Target } from '@/lib/publish/rules'
import { captionsConfigured, writeCaptions } from '@/lib/publish/captions'
import { captionBrief } from '@/lib/publish/marketing'
import { isMarket } from '@/lib/publish/markets'

// POST /api/publish/captions — "Write captions" in the composer.
//   { appId, targets, media, frames, notes?, draft?, market? } → { caption, overrides, model, brief }
//   market: write in that edition's language variant (markets.ts)
// GET  /api/publish/captions?app= → { ready, brief } so the composer can say
//   whether AI captions are on and whether the Drive brief was found.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const https = (u: unknown) => typeof u === 'string' && /^https:\/\//.test(u)

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const app = new URL(req.url).searchParams.get('app') ?? ''
  const brief = PUBLISH_APPS.some((a) => a.id === app) ? (await captionBrief(app)).source : null
  return NextResponse.json({ ready: captionsConfigured(), brief })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || !PUBLISH_APPS.some((a) => a.id === b.appId)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })
  const targets = (Array.isArray(b.targets) ? b.targets : []) as Target[]
  if (!targets.length || targets.some((t) => !PLATFORMS.some((p) => p.id === t.platform))) return NextResponse.json({ error: 'Pick where it’s going first.' }, { status: 400 })
  const frames = (Array.isArray(b.frames) ? b.frames : []).filter(https).slice(0, 6) as string[]
  const media = (Array.isArray(b.media) ? b.media : []) as MediaItem[]
  try {
    return NextResponse.json(await writeCaptions({ appId: b.appId, targets, media, frames, notes: String(b.notes ?? '').slice(0, 1000), draft: String(b.draft ?? '').slice(0, 3000), market: isMarket(b.market) ? b.market : undefined }))
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
