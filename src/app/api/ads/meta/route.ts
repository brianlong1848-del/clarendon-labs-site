import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { getPost } from '@/lib/publish/store'
import {
  adsStatus, checkPromote, DEFAULT_AUDIENCE, estimateReach, GOALS, listPromotions, promote, promotionResults,
  searchInterests, searchPlaces, setPromotionStatus, savedPresets, savePreset, deletePreset, type Audience, type PromoteInput,
} from '@/lib/ads/meta'
import { PUBLISH_APPS } from '@/lib/publish/platforms'

// ─── /api/ads/meta — promote posts on Facebook / Instagram ──────────────────
//
// Same admin gate as the rest of the console. Used by /post on the site and
// (next) the Studio iOS app's Promote sheet.
//
//   GET                              → { status, goals, defaults, promotions[] (with live results) }
//   GET ?search=places|interests&q=  → { results } for the audience picker
//   POST { action: 'estimate', audience, platform } → { reach: { low, high } | null }
//   POST { postId, platform, goal, dailyBudgetCents, startAt, endAt, audience }
//        → creates campaign + ad set + ad on the shared ad account; spends money.
//   POST { action: 'savePreset', appId, name, platform?, goal?, dailyUsd?, days?, audience } → { preset }
//   DELETE ?preset=<id>                 → removes a saved preset
//   PATCH ?id=&action=pause|resume|stop
//   GET also returns savedPresets[] (built-ins live in lib/ads/presets.ts).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const u = new URL(req.url)
  const search = u.searchParams.get('search'), q = (u.searchParams.get('q') ?? '').trim()
  try {
    if (search) {
      if (q.length < 2) return NextResponse.json({ results: [] })
      return NextResponse.json({ results: search === 'interests' ? await searchInterests(q) : await searchPlaces(q) })
    }
    const [status, promos, presets] = await Promise.all([adsStatus(), listPromotions().catch(() => []), savedPresets()])
    const withResults = await Promise.all(promos.map(async (p, i) => ({
      ...p, results: i < 20 && p.status !== 'failed' && p.status !== 'creating' ? await promotionResults(p) : null,
    })))
    return NextResponse.json({
      status,
      goals: Object.entries(GOALS).map(([id, g]) => ({ id, label: g.label })),
      defaults: DEFAULT_AUDIENCE,
      promotions: withResults,
      savedPresets: presets,
    })
  } catch (e) { return bad((e as Error).message, 500) }
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const body = await req.json().catch(() => null)
  if (!body) return bad('Expected JSON.')

  if (body.action === 'estimate') {
    const platform = body.platform === 'facebook' ? 'facebook' : 'instagram'
    return NextResponse.json({ reach: await estimateReach(body.audience as Audience, platform) })
  }

  if (body.action === 'savePreset') {
    const appId = String(body.appId ?? ''), name = String(body.name ?? '').trim()
    if (!PUBLISH_APPS.some((a) => a.id === appId)) return bad('Unknown app.')
    if (!name) return bad('Give the preset a name.')
    try {
      return NextResponse.json({ preset: await savePreset({ appId, name, platform: body.platform, goal: body.goal, dailyUsd: Number(body.dailyUsd) || undefined, days: Number(body.days) || undefined, audience: body.audience as Audience }) })
    } catch (e) { return bad((e as Error).message, 500) }
  }

  // The post has to be one Studio published; take ids from our own row, not the client.
  const p = body.postId ? await getPost(String(body.postId)) : null
  if (!p) return bad('Post not found.')
  const target = p.targets.find((t) => t.platform === body.platform && t.status === 'published' && t.remoteId)
  if (!target) return bad('That post isn’t live on that platform yet.')
  if (target.platform === 'instagram' && target.format === 'story') return bad('Instagram stories can’t be promoted from here — promote a feed post or Reel.')

  const input: PromoteInput = {
    appId: p.app_id, postId: p.id, platform: target.platform as 'facebook' | 'instagram', remoteId: target.remoteId!, permalink: target.permalink,
    goal: body.goal, dailyBudgetCents: Math.round(Number(body.dailyBudgetCents)), startAt: String(body.startAt ?? ''), endAt: String(body.endAt ?? ''),
    audience: { ...DEFAULT_AUDIENCE, ...(body.audience ?? {}) },
    source: req.headers.get('x-studio-client') === 'ios' ? 'studio-ios' : 'web',
  }
  const problems = checkPromote(input)
  if (problems.length) return bad(problems.join(' '))

  const status = await adsStatus()
  if (!status.ready) return bad(status.reasons.join(' '), 409)
  try {
    return NextResponse.json({ promotion: await promote(input) })
  } catch (e) { return bad(`Meta didn’t accept it: ${(e as Error).message}`, 502) }
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const u = new URL(req.url)
  const id = u.searchParams.get('id'), action = u.searchParams.get('action')
  if (!id || !['pause', 'resume', 'stop'].includes(action ?? '')) return bad('Expected ?id=&action=pause|resume|stop')
  try {
    return NextResponse.json({ promotion: await setPromotionStatus(id, action as 'pause' | 'resume' | 'stop') })
  } catch (e) { return bad((e as Error).message, 502) }
}

export async function DELETE(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const id = new URL(req.url).searchParams.get('preset')
  if (!id) return bad('Expected ?preset=')
  try { await deletePreset(id); return NextResponse.json({ ok: true }) } catch (e) { return bad((e as Error).message, 500) }
}
