import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { getPost } from '@/lib/publish/store'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { tiktokAdvertiserId } from '@/lib/analytics/tiktok'
import {
  accountVideos, AGE_GROUPS, checkTikTokPromote, clearTikTokPromotion, DEFAULT_TT_AUDIENCE, listTikTokPromotions, promoteTikTok,
  searchHashtags, searchInterests, searchLocations, setTikTokPromotionStatus, tiktokAdsStatus, tiktokPromotionResults, TT_GOALS, TT_LIMITS,
  adsManagerUrl, type TikTokAudience, type TikTokPromoteInput,
} from '@/lib/ads/tiktok'

// ─── /api/ads/tiktok — boost a TikTok post as a Spark Ad (FEAT-CLA-022) ─────
//
// Same contract as /api/ads/meta, one ad account per app. Same admin gate.
//
//   GET [?app=]                       → { status (per app), goals, defaults, ageGroups, promotions[] (with live results) }
//   GET ?app=&search=locations|interests|hashtags&q=  → { results }
//   GET ?app=&videos=1                → { videos } — posts on the app's TikTok account (identity/video/get)
//   POST { action: 'estimate' }       → { reach: null } — TikTok gives no audience estimate through the API; the UI says so
//   POST { postId | itemId+appId, goal, dailyBudgetCents, startAt, endAt, audience, audienceName?, paused? }
//        → creates campaign + ad group + Spark Ad on the app's ad account; spends money unless paused.
//   PATCH ?id=&action=pause|resume|stop|clear

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const u = new URL(req.url)
  const app = u.searchParams.get('app') ?? ''
  const search = u.searchParams.get('search'), q = (u.searchParams.get('q') ?? '').trim()
  try {
    if (search) {
      const advertiserId = tiktokAdvertiserId(app)
      if (!advertiserId) return bad('Pick an app with a TikTok ad account.')
      if (q.length < 2) return NextResponse.json({ results: [] })
      const results = search === 'locations' ? await searchLocations(advertiserId, q)
        : search === 'hashtags' ? await searchHashtags(advertiserId, q)
        : await searchInterests(advertiserId, q)
      return NextResponse.json({ results })
    }
    if (u.searchParams.get('videos')) {
      if (!PUBLISH_APPS.some((a) => a.id === app)) return bad('Unknown app.')
      return NextResponse.json({ videos: await accountVideos(app) })
    }
    const apps = PUBLISH_APPS.filter((a) => !app || a.id === app)
    const [statuses, promos] = await Promise.all([
      Promise.all(apps.map(async (a) => [a.id, await tiktokAdsStatus(a.id)] as const)),
      listTikTokPromotions().catch(() => []),
    ])
    const withResults = await Promise.all(promos.map(async (p, i) => ({
      ...p, results: i < 20 && p.status !== 'failed' && p.status !== 'creating' ? await tiktokPromotionResults(p) : null,
      adsManager: tiktokAdvertiserId(p.app_id) ? adsManagerUrl(tiktokAdvertiserId(p.app_id)!) : undefined,
    })))
    const status = Object.fromEntries(statuses)
    return NextResponse.json({
      status: app ? status[app] : status,
      statusByApp: status,
      goals: Object.entries(TT_GOALS).map(([id, g]) => ({ id, label: g.label })),
      defaults: DEFAULT_TT_AUDIENCE, ageGroups: AGE_GROUPS, limits: TT_LIMITS,
      promotions: withResults,
    })
  } catch (e) { return bad((e as Error).message, 500) }
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const body = await req.json().catch(() => null)
  if (!body) return bad('Expected JSON.')
  if (body.action === 'estimate') return NextResponse.json({ reach: null, note: 'TikTok doesn’t give an audience estimate through the API; Ads Manager shows one.' })

  let appId = String(body.appId ?? ''), itemId = String(body.itemId ?? ''), postId: string | null = null, permalink: string | null = null
  if (body.postId) {
    // A Studio post: take the video id from our own row, not the client.
    const p = await getPost(String(body.postId))
    if (!p) return bad('Post not found.')
    const t = p.targets.find((t) => t.platform === 'tiktok' && t.status === 'published' && t.remoteId)
    if (!t) return bad('That post isn’t live on TikTok yet.')
    appId = p.app_id; itemId = t.remoteId!; postId = p.id; permalink = t.permalink ?? null
  } else if (body.permalink) permalink = String(body.permalink)

  const input: TikTokPromoteInput = {
    appId, postId, itemId, permalink, goal: body.goal, dailyBudgetCents: Math.round(Number(body.dailyBudgetCents)),
    startAt: String(body.startAt ?? ''), endAt: String(body.endAt ?? ''),
    audience: { ...DEFAULT_TT_AUDIENCE, ...(body.audience ?? {}) } as TikTokAudience,
    audienceName: body.audienceName ? String(body.audienceName) : undefined, paused: !!body.paused,
    source: req.headers.get('x-studio-client') === 'ios' ? 'studio-ios' : 'web',
  }
  const problems = checkTikTokPromote(input)
  if (problems.length) return bad(problems.join(' '))
  const status = await tiktokAdsStatus(appId)
  if (!status.ready) return bad(status.reasons.join(' '), 409)
  try {
    return NextResponse.json({ promotion: await promoteTikTok(input) })
  } catch (e) { return bad(`TikTok didn’t accept it: ${(e as Error).message}`, 502) }
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const u = new URL(req.url)
  const id = u.searchParams.get('id'), action = u.searchParams.get('action')
  if (!id) return bad('Expected ?id=&action=pause|resume|stop|clear')
  try {
    if (action === 'clear') { await clearTikTokPromotion(id); return NextResponse.json({ ok: true }) }
    if (!['pause', 'resume', 'stop'].includes(action ?? '')) return bad('Expected ?id=&action=pause|resume|stop|clear')
    return NextResponse.json({ promotion: await setTikTokPromotionStatus(id, action as 'pause' | 'resume' | 'stop') })
  } catch (e) { return bad((e as Error).message, 502) }
}
