import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { PLATFORMS, validate, type MediaItem, type Platform, type Target } from '@/lib/publish/rules'
import { checkRepeat, type RepeatSpec } from '@/lib/publish/recur'
import { getPost, insertPost, listPosts, listSeries, updatePost, type TargetState } from '@/lib/publish/store'
import { createSeries, recaption } from '@/lib/publish/series'
import { run } from '@/lib/publish/runner'
import { isMarket } from '@/lib/publish/markets'

// ─── /api/publish — the "post everywhere" queue ─────────────────────────────
//
// Same admin gate as the rest of the console. Used by /post on the site and
// the Compose screen in the Studio iOS app.
//
//   GET                       → { posts, series } recent + scheduled posts, live repeating series
//   POST                      → { appId, caption, overrides, media, targets, scheduledAt?, repeat?, captionBy?, notes?, market?, editionGroup? }
//                               (one call per market edition; editions of one post share editionGroup)
//                               posts now (and waits up to ~45s for it to land), queues it,
//                               or — with `repeat` (see lib/publish/recur.ts) — starts a series
//   PATCH ?id=                → retry the failed platforms of a post
//   PATCH ?id=&action=recaption → fresh AI caption for a post that hasn't gone out
//   DELETE ?id=               → cancel a scheduled post (for a repeating post: skips just that copy)

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET() {
  if (!(await consoleAuthed())) return deny()
  try {
    const [posts, series] = await Promise.all([listPosts(), listSeries().catch(() => [])])
    return NextResponse.json({ posts, series })
  } catch (e) { return bad((e as Error).message, 500) }
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const body = await req.json().catch(() => null)
  if (!body) return bad('Expected JSON.')

  const appId = String(body.appId ?? '')
  if (!PUBLISH_APPS.some((a) => a.id === appId)) return bad('Unknown app.')
  const caption = String(body.caption ?? '')
  const overrides = (body.overrides ?? {}) as Partial<Record<Platform, string>>
  const media = (Array.isArray(body.media) ? body.media : []) as MediaItem[]
  const targets = (Array.isArray(body.targets) ? body.targets : []) as Target[]
  const captionBy: 'brian' | 'ai' = body.captionBy === 'ai' ? 'ai' : 'brian'
  const notes = String(body.notes ?? '').slice(0, 1000)
  const source = req.headers.get('x-studio-client') === 'ios' ? 'studio-ios' : 'web'
  const market = body.market == null || body.market === '' ? null : body.market
  if (market !== null && !isMarket(market)) return bad('Unknown market.')
  const editionGroup = typeof body.editionGroup === 'string' && /^[0-9a-f-]{36}$/i.test(body.editionGroup) ? body.editionGroup : null
  if (!targets.length) return bad('Pick at least one place to post.')
  if (targets.some((t) => !PLATFORMS.some((p) => p.id === t.platform && p.formats.includes(t.format)))) return bad('Unknown platform or format.')
  if (media.some((m) => typeof m.url !== 'string' || !/^https:\/\//.test(m.url))) return bad('Media must be uploaded first.')

  const errors = validate(targets, media, caption, overrides).filter((i) => i.level === 'error')
  if (errors.length) return bad(errors.map((e) => e.text).join(' '))

  if (body.repeat) {
    const repeat = body.repeat as RepeatSpec
    const problems = checkRepeat(repeat)
    if (problems.length) return bad(problems.join(' '))
    if ((repeat.frames ?? []).some((u) => typeof u !== 'string' || !/^https:\/\//.test(u))) return bad('Frames must be uploaded first.')
    try {
      const { series, post } = await createSeries({ appId, caption, overrides, media, targets, repeat: { ...repeat, notes: repeat.notes ?? notes }, captionBy, source })
      return NextResponse.json({ post, series })
    } catch (e) { return bad((e as Error).message, 500) }
  }

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null
  if (when && isNaN(when.getTime())) return bad('Bad schedule time.')
  const later = when && when.getTime() > Date.now() + 60_000

  try {
    const row = await insertPost({
      app_id: appId, caption, overrides, media,
      targets: targets.map((t) => ({ ...t, status: 'pending' }) as TargetState),
      status: later ? 'scheduled' : 'publishing',
      scheduled_at: (when ?? new Date()).toISOString(),
      source, notes, caption_by: captionBy,
      ...(market ? { market } : {}), ...(editionGroup ? { edition_group: editionGroup } : {}),
    })
    const post = later ? row : await run(row, 45_000)
    return NextResponse.json({ post })
  } catch (e) { return bad((e as Error).message, 500) }
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const q = new URL(req.url).searchParams
  const id = q.get('id') ?? ''
  const post = await getPost(id).catch(() => null)
  if (!post) return bad('Not found.', 404)
  if (q.get('action') === 'recaption') {
    try { return NextResponse.json({ post: await recaption(post) }) } catch (e) { return bad((e as Error).message, 500) }
  }
  const targets = post.targets.map((t) => t.status === 'failed' ? { platform: t.platform, format: t.format, ...(t.tiktok ? { tiktok: t.tiktok } : {}), status: 'pending' as const } : t)
  const fresh = await updatePost(id, { targets, status: 'publishing' })
  return NextResponse.json({ post: await run(fresh, 45_000) })
}

export async function DELETE(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const post = await getPost(id).catch(() => null)
  if (!post) return bad('Not found.', 404)
  if (post.status !== 'scheduled') return bad('Only scheduled posts can be canceled.')
  return NextResponse.json({ post: await updatePost(id, { status: 'canceled' }) })
}
