import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { PLATFORMS, validate, type MediaItem, type MediaOverrides, type Platform, type Target } from '@/lib/publish/rules'
import { checkRepeat, type RepeatSpec } from '@/lib/publish/recur'
import { failedPosts, getPost, insertPost, listPosts, listSeries, updatePost, type Post, type TargetState } from '@/lib/publish/store'
import { createSeries, recaption } from '@/lib/publish/series'
import { run } from '@/lib/publish/runner'
import { APP_MARKETS, isMarket, marketFromName } from '@/lib/publish/markets'
import { anyPlatformTagged, assignPlatformMedia, isMaster } from '@/lib/publish/platformMedia'

// ─── /api/publish — the "post everywhere" queue ─────────────────────────────
//
// Same admin gate as the rest of the console. Used by /post on the site and
// the Compose screen in the Studio iOS app.
//
//   GET                       → { posts, series } recent + scheduled posts, live repeating series
//   POST                      → { appId, caption, overrides, media, mediaOverrides?, targets, scheduledAt?, repeat?, captionBy?, notes?, market?, editionGroup? }
//                               (mediaOverrides: { tiktok: [...], instagram: [...] } — a platform's own cut; see rules.ts mediaFor.
//                                Sent without it, files named for a platform (…_tiktok.mp4, …_ig-reels.mp4) are split
//                                by name here, so scripts and Claude projects just send every cut in `media`.
//                                splitByPlatform: false turns that off.)
//                               (one call per market edition; editions of one post share editionGroup)
//                               posts now (and waits up to ~45s for it to land), queues it,
//                               or — with `repeat` (see lib/publish/recur.ts) — starts a series
//   PATCH ?id=                → retry the failed platforms of a post
//   PATCH ?id=&action=recaption → fresh AI caption for a post that hasn't gone out
//   DELETE ?id=               → cancel a scheduled post (for a repeating post: skips just that copy),
//                               or clear a failed one (see clear() below)
//   DELETE ?failed=all[&app=] → clear every failed / partly-failed post (for one app)

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
  const targets = (Array.isArray(body.targets) ? body.targets : []) as Target[]
  const captionBy: 'brian' | 'ai' = body.captionBy === 'ai' ? 'ai' : 'brian'
  const notes = String(body.notes ?? '').slice(0, 1000)
  const source = req.headers.get('x-studio-client') === 'ios' ? 'studio-ios' : 'web'
  const given = body.market == null || body.market === '' ? null : body.market
  if (given !== null && !isMarket(given)) return bad('Unknown market.')
  let media = (Array.isArray(body.media) ? body.media : []) as MediaItem[]
  // The name the file had before upload (storage paths are <uuid>-<name>).
  const fileName = (u: unknown) => typeof u === 'string' ? decodeURIComponent(u.split('/').pop() ?? '').replace(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-/i, '') : ''
  // Per-platform cuts: only known platforms, only lists. {} when the client sends none.
  const rawMo = body.mediaOverrides && typeof body.mediaOverrides === 'object' && !Array.isArray(body.mediaOverrides) ? body.mediaOverrides as Record<string, unknown> : {}
  const mediaOverrides: MediaOverrides = {}
  for (const p of PLATFORMS) if (Array.isArray(rawMo[p.id])) mediaOverrides[p.id] = rawMo[p.id] as MediaItem[]
  // No cuts given but the files are named for platforms → split them by name (platformMedia.ts).
  if (!Object.keys(mediaOverrides).length && body.splitByPlatform !== false && media.length > 1) {
    const named = media.map((m, i) => ({ key: String(i), name: fileName(m?.url) }))
    if (anyPlatformTagged(named)) {
      const a = assignPlatformMedia(named)
      for (const p of PLATFORMS) mediaOverrides[p.id] = a[p.id].keys.map((k) => media[Number(k)])
      // The post's own media (Queue thumbnail, AI captions): the shared files, else Instagram's cut.
      const shared = media.filter((_, i) => !anyPlatformTagged([named[i]]) && !isMaster(named[i].name))
      media = shared.length ? shared : (mediaOverrides.instagram?.length ? mediaOverrides.instagram : media.slice(0, 1))
    }
  }
  const hasMo = Object.keys(mediaOverrides).length > 0
  const allMedia = [...media, ...Object.values(mediaOverrides).flat()] as MediaItem[]
  // A post sent without a market (an older client, a script) still lands in
  // the right country lane: read it from the first media file's name
  // (e.g. rol-condo-en-gb.mp4), for apps that post in more than one market.
  const market = given ?? ((APP_MARKETS[appId]?.length ?? 0) > 1 ? marketFromName(fileName(allMedia[0]?.url), appId) : null)
  const editionGroup = typeof body.editionGroup === 'string' && /^[0-9a-f-]{36}$/i.test(body.editionGroup) ? body.editionGroup : null
  if (!targets.length) return bad('Pick at least one place to post.')
  if (targets.some((t) => !PLATFORMS.some((p) => p.id === t.platform && p.formats.includes(t.format)))) return bad('Unknown platform or format.')
  if (allMedia.some((m) => !m || typeof m.url !== 'string' || !/^https:\/\//.test(m.url))) return bad('Media must be uploaded first.')

  const errors = validate(targets, media, caption, overrides, mediaOverrides).filter((i) => i.level === 'error')
  if (errors.length) return bad(errors.map((e) => e.text).join(' '))

  if (body.repeat) {
    const repeat = body.repeat as RepeatSpec
    const problems = checkRepeat(repeat)
    if (problems.length) return bad(problems.join(' '))
    if ((repeat.frames ?? []).some((u) => typeof u !== 'string' || !/^https:\/\//.test(u))) return bad('Frames must be uploaded first.')
    try {
      const { series, post } = await createSeries({ appId, caption, overrides, media, mediaOverrides, targets, repeat: { ...repeat, notes: repeat.notes ?? notes }, captionBy, source })
      return NextResponse.json({ post, series })
    } catch (e) { return bad((e as Error).message, 500) }
  }

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null
  if (when && isNaN(when.getTime())) return bad('Bad schedule time.')
  const later = when && when.getTime() > Date.now() + 60_000

  try {
    const row = await insertPost({
      app_id: appId, caption, overrides, media,
      // Only written when used, so posts still save before the column exists.
      ...(hasMo ? { media_overrides: mediaOverrides } : {}),
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
  // A failed platform starts over from a bare target: no containerId, no
  // Threads carousel children — those expire (~24h), so a retry must make new
  // ones rather than publish the ids the failed attempt left behind.
  const targets = post.targets.map((t) => t.status === 'failed' ? { platform: t.platform, format: t.format, ...(t.tiktok ? { tiktok: t.tiktok } : {}), status: 'pending' as const } : t)
  const fresh = await updatePost(id, { targets, status: 'publishing' })
  return NextResponse.json({ post: await run(fresh, 45_000) })
}

/** Clear a failure from the queue. Nothing went out → the post is hidden
 *  (canceled). Some platforms went out → the post stays (it's live), the
 *  failed platforms become skipped and it counts as done. The row is kept
 *  either way, so the history isn't lost. */
const clear = (post: Post) => post.status === 'partial'
  ? updatePost(post.id, { status: 'done', targets: post.targets.map((t) => t.status === 'failed' ? { ...t, status: 'skipped' as const } : t) })
  : updatePost(post.id, { status: 'canceled' })

export async function DELETE(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const q = new URL(req.url).searchParams
  if (q.get('failed') === 'all') {
    try {
      const list = await failedPosts(q.get('app') || undefined)
      await Promise.all(list.map(clear))
      return NextResponse.json({ cleared: list.length })
    } catch (e) { return bad((e as Error).message, 500) }
  }
  const id = q.get('id') ?? ''
  const post = await getPost(id).catch(() => null)
  if (!post) return bad('Not found.', 404)
  if (post.status === 'failed' || post.status === 'partial') return NextResponse.json({ post: await clear(post) })
  if (post.status !== 'scheduled') return bad('Only scheduled or failed posts can be removed from the queue.')
  return NextResponse.json({ post: await updatePost(id, { status: 'canceled' }) })
}
