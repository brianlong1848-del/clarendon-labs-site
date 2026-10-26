// ─── Repeating posts: series → copies ───────────────────────────────────────
//
// SERVER ONLY. A series never publishes anything itself. It keeps exactly one
// upcoming copy in studio_posts (an ordinary scheduled post the existing
// runner publishes), created up to LEAD before it's due so the queue shows it
// — caption included — and Brian can rewrite or skip that one copy. When the
// copy is published, skipped or fails, the runner makes the next one.

import { nextAfter, type RepeatSpec } from './recur'
import { captionsConfigured, writeCaptions } from './captions'
import { isMarket } from './markets'
import { nextBest } from './timing'
import {
  insertPost, insertSeries, openCopy, pastCaptions, seriesDue, updatePost, updateSeries, cancelOpenCopies, getSeries,
  type Post, type Series, type TargetState,
} from './store'
import type { MediaItem, MediaOverrides, Platform, Target } from './rules'

const LEAD = 48 * 3600_000

export const specOf = (s: Series): RepeatSpec => ({
  rule: s.rule, startsAt: s.starts_at, endsAt: s.ends_at, maxRuns: s.max_runs, captionMode: s.caption_mode, notes: s.notes, frames: s.frames,
})

/** When the next copy goes out — sync rules via recur.ts, 'auto' via timing.ts. */
/** `fresh` = starting or resuming: an auto rule may pick the very next good slot
 *  instead of keeping its usual spacing from `after`. */
export async function nextTime(spec: RepeatSpec, appId: string, targets: Target[], after: Date, runsSoFar: number, fresh = false): Promise<Date | null> {
  if (spec.rule.kind !== 'auto') return nextAfter(spec, after, runsSoFar)
  if (spec.maxRuns != null && runsSoFar >= spec.maxRuns) return null
  const startsAt = spec.startsAt ? new Date(spec.startsAt) : null
  const start = startsAt && startsAt > after ? startsAt : fresh ? new Date(0) : after
  const next = await nextBest(appId, targets, start, spec.rule.perWeek, spec.rule.tz)
  return next && spec.endsAt && next > new Date(spec.endsAt) ? null : next ?? null
}

const pending = (targets: Target[]) => targets.map((t) => ({ ...t, status: 'pending' }) as TargetState)

export async function createSeries(input: {
  appId: string; caption: string; overrides: Partial<Record<Platform, string>>; media: MediaItem[]; mediaOverrides?: MediaOverrides; targets: Target[]
  repeat: RepeatSpec; captionBy: 'brian' | 'ai'; source: string
}): Promise<{ series: Series; post: Post | null }> {
  const first = await nextTime(input.repeat, input.appId, input.targets, new Date(), 0, true)
  if (!first) throw new Error('None of those times are in the future.')
  const series = await insertSeries({
    app_id: input.appId, caption: input.caption, overrides: input.overrides, media: input.media, targets: input.targets,
    ...(input.mediaOverrides && Object.keys(input.mediaOverrides).length ? { media_overrides: input.mediaOverrides } : {}),
    frames: (input.repeat.frames ?? []).slice(0, 6), notes: (input.repeat.notes ?? '').slice(0, 1000),
    caption_mode: input.repeat.captionMode === 'same' ? 'same' : 'fresh', rule: input.repeat.rule,
    starts_at: input.repeat.startsAt ?? null, ends_at: input.repeat.endsAt ?? null, max_runs: input.repeat.maxRuns ?? null,
    status: 'active', next_at: first.toISOString(), source: input.source,
  })
  // The first copy goes out with exactly the caption Brian saw and approved.
  const post = await materialize(series, { firstCaptionBy: input.captionBy })
  return { series: (await getSeries(series.id)) ?? series, post }
}

/** Make the next copy of a series, if it has none open. Returns it (or null). */
export async function materialize(s: Series, opts: { firstCaptionBy?: 'brian' | 'ai' } = {}): Promise<Post | null> {
  if (s.status !== 'active' || !s.next_at) return null
  if (await openCopy(s.id)) return null
  const at = new Date(s.next_at)
  const occurrence = s.runs + 1
  const after = await nextTime(specOf(s), s.app_id, s.targets, at, occurrence)
  // Claim this occurrence first (only succeeds if nobody else advanced `runs`).
  const claimed = await updateSeries(s.id, { runs: occurrence, next_at: after?.toISOString() ?? null, status: after ? 'active' : 'ended' }, s.runs)
  if (!claimed) return null

  let caption = s.caption, overrides = s.overrides, captionBy: 'brian' | 'ai' = opts.firstCaptionBy ?? 'brian', error: string | null = null
  if (occurrence > 1) {
    const prev = await pastCaptions(s.id, 6).catch(() => [])
    if (s.caption_mode === 'same') {
      captionBy = 'brian'
    } else if (captionsConfigured()) {
      try {
        const out = await writeCaptions({
          appId: s.app_id, targets: s.targets, media: s.media, frames: s.frames, notes: s.notes, draft: s.caption,
          avoid: prev.flatMap((p) => [p.caption, ...Object.values(p.overrides ?? {})]).filter(Boolean).slice(0, 10),
        })
        caption = out.caption; overrides = out.overrides; captionBy = 'ai'
      } catch (e) { error = (e as Error).message }
    } else error = 'Fresh captions need ANTHROPIC_API_KEY — this copy reused the original caption.'
  }

  const post = await insertPost({
    app_id: s.app_id, caption, overrides, media: s.media, targets: pending(s.targets),
    ...(s.media_overrides && Object.keys(s.media_overrides).length ? { media_overrides: s.media_overrides } : {}),
    status: 'scheduled', scheduled_at: at.toISOString(), source: s.source,
    series_id: s.id, occurrence, notes: s.notes, caption_by: captionBy,
  })
  if (error !== s.last_error) await updateSeries(s.id, { last_error: error }).catch(() => null)
  return post
}

/** Runner hook: top up every active series that has a copy due within LEAD. */
export async function materializeDue(budgetMs = 25_000): Promise<number> {
  const started = Date.now()
  let made = 0
  for (const s of await seriesDue(LEAD).catch(() => [] as Series[])) {
    if (Date.now() - started > budgetMs) break
    if (await materialize(s).catch(() => null)) made++
  }
  return made
}

/** Pause / resume / end from the queue. Pausing or ending skips the waiting copy. */
export async function setSeriesState(id: string, action: 'pause' | 'resume' | 'end'): Promise<Series | null> {
  const s = await getSeries(id)
  if (!s) return null
  if (action === 'resume') {
    const next = await nextTime(specOf(s), s.app_id, s.targets, new Date(), s.runs, true)
    const fresh = await updateSeries(id, { status: next ? 'active' : 'ended', next_at: next?.toISOString() ?? null })
    if (fresh) await materialize(fresh).catch(() => null)
    return getSeries(id)
  }
  await cancelOpenCopies(id)
  return updateSeries(id, action === 'pause' ? { status: 'paused' } : { status: 'ended', next_at: null })
}

/** "Rewrite caption" on a waiting copy — a fresh take, different from earlier ones. */
export async function recaption(post: Post): Promise<Post> {
  if (post.status !== 'scheduled') throw new Error('Only a post that hasn’t gone out yet can be rewritten.')
  const s = post.series_id ? await getSeries(post.series_id) : null
  const prev = s ? await pastCaptions(s.id, 6).catch(() => []) : []
  const out = await writeCaptions({
    appId: post.app_id, targets: post.targets, media: post.media, frames: s?.frames ?? post.media.filter((m) => m.kind === 'image').map((m) => m.url).slice(0, 4),
    notes: post.notes || s?.notes, draft: s?.caption ?? post.caption,
    market: isMarket(post.market) ? post.market : undefined,
    avoid: [post.caption, ...Object.values(post.overrides ?? {}), ...prev.flatMap((p) => [p.caption, ...Object.values(p.overrides ?? {})])].filter(Boolean).slice(0, 10) as string[],
  })
  return updatePost(post.id, { caption: out.caption, overrides: out.overrides, caption_by: 'ai' })
}
