import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { postsByIds, updateScheduled, type Post } from '@/lib/publish/store'
import { MIN_LEAD_MS, type BulkResponse } from '@/lib/publish/edit'

// ─── /api/publish/bulk — several scheduled posts at once ────────────────────
//
//   POST { ids, action: 'cancel' }            → cancel each (a repeating post's copy is skipped)
//   POST { ids, action: 'shift', minutes }    → move each by ±minutes
// → BulkResponse { updated, skipped }. Only status='scheduled' posts change;
// anything else (already out, canceled, would land in the past) is skipped
// with a reason. Used by /post Queue + Calendar and the Studio iOS app.

export const dynamic = 'force-dynamic'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return bad('not authorised', 401)
  const body = await req.json().catch(() => null) as { ids?: unknown; action?: unknown; minutes?: unknown } | null
  if (!body) return bad('Expected JSON.')
  const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))) : []
  if (!ids.length) return bad('Pick at least one post.')
  if (ids.length > 200) return bad('200 posts at most at once.')
  const action = body.action
  if (action !== 'cancel' && action !== 'shift') return bad('action must be cancel or shift.')
  const minutes = Number(body.minutes)
  if (action === 'shift' && (!Number.isFinite(minutes) || minutes === 0 || Math.abs(minutes) > 60 * 24 * 366)) return bad('minutes must be a non-zero number (up to a year).')

  try {
    const posts = await postsByIds(ids)
    const out: BulkResponse = { updated: [], skipped: [] }
    for (const id of ids) if (!posts.some((p) => p.id === id)) out.skipped.push({ id, reason: 'Not found.' })
    await Promise.all(posts.map(async (p: Post) => {
      if (p.status !== 'scheduled') { out.skipped.push({ id: p.id, reason: `Not scheduled (${p.status}).` }); return }
      let patch: Partial<Post>
      if (action === 'cancel') patch = { status: 'canceled' }
      else {
        const at = new Date(new Date(p.scheduled_at ?? Date.now()).getTime() + minutes * 60_000)
        if (at.getTime() < Date.now() + MIN_LEAD_MS) { out.skipped.push({ id: p.id, reason: 'Would land in the past.' }); return }
        patch = { scheduled_at: at.toISOString() }
      }
      const row = await updateScheduled(p.id, patch)
      if (row) out.updated.push(row)
      else out.skipped.push({ id: p.id, reason: 'Started going out.' })
    }))
    return NextResponse.json(out)
  } catch (e) { return bad((e as Error).message, 500) }
}
