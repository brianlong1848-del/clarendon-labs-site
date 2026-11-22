// ─── Upcoming: everything that's about to go out ─────────────────────────────
//
// SERVER ONLY. One list for "what's coming", used by /analytics, each app's
// page, the console's Up next and (through /api/upcoming) the Studio app:
//
//   post    — a scheduled post in the queue: its media, the caption each
//             platform will get (overrides applied), platforms + formats,
//             market (country), hashtags, time.
//   repeat  — the next runs of a repeating series that aren't in the queue yet
//             (the runner only materializes one copy at a time), so the
//             calendar shows what the rule will do, not just the next copy.
//   boost   — a paid boost (Meta or TikTok) that hasn't ended: dates, budget,
//             goal and the full audience (places, ages, gender, interests,
//             hashtags) with the post it promotes.
//
// Plus checks a reviewer would make — empty feed captions, the same video
// twice in three days, two posts on one account within 30 minutes, a boost
// that would spend while the app's ads are meant to be paused — and the days
// with nothing scheduled for an app that is otherwise posting.

import { listSeries, postsBetween, rest, type Post, type Series } from '@/lib/publish/store'
import { upcoming as nextRuns, describeRule } from '@/lib/publish/recur'
import { FORMAT_LABEL, type Platform } from '@/lib/publish/rules'
import { MARKETS, isMarket } from '@/lib/publish/markets'
import { strategyFor } from '@/lib/ads/strategy'
import type { Promotion } from '@/lib/ads/meta'

export type UpMedia = { url: string; kind: 'image' | 'video'; width: number; height: number }
export type UpTarget = { platform: Platform; format: string; label: string }
export type UpMarket = { id: string; flag: string; name: string; short: string }
type Base = { id: string; app_id: string; at: string; checks: string[] }
export type UpPost = Base & {
  kind: 'post'
  post_id: string; series_id?: string | null; occurrence?: number | null
  targets: UpTarget[]
  /** The caption each platform will get (its override, else the shared caption). */
  captions: Partial<Record<Platform, string>>
  media: UpMedia[]; hashtags: string[]; market: UpMarket | null
  caption_by?: 'brian' | 'ai'; notes?: string
  /** For the PostDrawer (edit / reschedule / cancel / new caption in place). */
  raw: Post
}
export type UpRepeat = Base & {
  kind: 'repeat'
  series_id: string; rule: string; caption: string; caption_mode: 'fresh' | 'same'
  targets: UpTarget[]; media: UpMedia[]; hashtags: string[]
}
export type UpBoost = Base & {
  kind: 'boost'
  promotion_id: string; network: 'meta' | 'tiktok'; platform: string; status: string; live: boolean
  start_at: string; end_at: string; goal: string; daily_budget_cents: number; total_cents: number
  campaign_id: string | null
  audience: { places: string[]; ages: string; gender: string; interests: string[]; hashtags: string[]; expand?: boolean; languages?: number }
  post: { caption: string; media: UpMedia[]; permalink: string | null } | null
}
export type UpcomingItem = UpPost | UpRepeat | UpBoost
export type UpcomingPayload = {
  from: string; to: string; days: number; app: string
  items: UpcomingItem[]
  /** Chicago days in the window with nothing scheduled, per app that posts in the window. */
  gaps: { app_id: string; days: string[] }[]
  counts: { posts: number; repeats: number; boosts: number; by_platform: Partial<Record<Platform, number>>; checks: number }
  generated_at: string
}

const TAG = /(^|\s)(#[\p{L}\p{N}_]+)/gu
const hashtagsOf = (...texts: string[]) => [...new Set(texts.flatMap((t) => [...(t ?? '').matchAll(TAG)].map((m) => m[2])))].slice(0, 12)
const chicagoDay = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(d))
const targetsOf = (ts: { platform: Platform; format: string }[]): UpTarget[] =>
  ts.map((t) => ({ platform: t.platform, format: t.format, label: t.platform === 'tiktok' ? 'Video' : FORMAT_LABEL[t.format as keyof typeof FORMAT_LABEL] ?? t.format }))
const mediaOf = (m: { url: string; kind: 'image' | 'video'; width: number; height: number }[] | undefined): UpMedia[] =>
  (m ?? []).map(({ url, kind, width, height }) => ({ url, kind, width, height }))
/** What a platform shows: its own cut when the post has one. */
const mediaFor = (p: Post, platform?: Platform) => mediaOf((platform && p.media_overrides?.[platform]) || p.media)

const AGE_LABEL: Record<string, [number, number]> = { AGE_18_24: [18, 24], AGE_25_34: [25, 34], AGE_35_44: [35, 44], AGE_45_54: [45, 54], AGE_55_100: [55, 65] }
function audienceOf(p: Promotion): UpBoost['audience'] {
  const a = (p.audience ?? {}) as unknown as Record<string, unknown>
  if (p.network === 'tiktok') {
    const groups = (a.ageGroups as string[] | undefined) ?? []
    const lo = Math.min(...groups.map((g) => AGE_LABEL[g]?.[0] ?? 99)), hi = Math.max(...groups.map((g) => AGE_LABEL[g]?.[1] ?? 0))
    return {
      places: ((a.locations as { name: string }[] | undefined) ?? []).map((l) => l.name),
      ages: groups.length ? `${lo}–${hi === 65 ? '55+' : hi}` : 'All ages',
      gender: String(a.gender ?? 'all'),
      interests: ((a.interests as { name: string }[] | undefined) ?? []).map((i) => i.name),
      hashtags: ((a.hashtags as { name: string }[] | undefined) ?? []).map((h) => `#${h.name.replace(/^#/, '')}`),
    }
  }
  return {
    places: ((a.places as { name: string }[] | undefined) ?? []).map((pl) => pl.name),
    ages: `${a.ageMin ?? 18}–${Number(a.ageMax ?? 65) >= 65 ? '65+' : a.ageMax}`,
    gender: String(a.genders ?? 'all'),
    interests: ((a.interests as { name: string }[] | undefined) ?? []).map((i) => i.name),
    hashtags: [], expand: !!a.expand, languages: (a.locales as number[] | undefined)?.length || undefined,
  }
}

export async function buildUpcoming(app: string, days: number): Promise<UpcomingPayload> {
  const now = new Date(), until = new Date(now.getTime() + days * 86400000)
  const appFilter = app === 'all' ? undefined : app
  const [posts, series, promos, recent] = await Promise.all([
    postsBetween(now.toISOString(), until.toISOString(), appFilter).catch(() => [] as Post[]),
    listSeries().catch(() => [] as Series[]),
    rest<Promotion[]>(`studio_promotions?hidden=eq.false&end_at=gt.${encodeURIComponent(now.toISOString())}&status=in.(creating,active,paused)${appFilter ? `&app_id=eq.${appFilter}` : ''}&order=start_at.asc&limit=100`).catch(() => [] as Promotion[]),
    // The last three days too, for "same video twice" against what already went out.
    postsBetween(new Date(now.getTime() - 3 * 86400000).toISOString(), now.toISOString(), appFilter).catch(() => [] as Post[]),
  ])
  const items: UpcomingItem[] = []

  for (const p of posts.filter((x) => x.status === 'scheduled' && x.scheduled_at)) {
    const captions: Partial<Record<Platform, string>> = {}
    for (const t of p.targets) captions[t.platform] = (p.overrides?.[t.platform] ?? p.caption ?? '').trim()
    const m = p.market && isMarket(p.market) ? MARKETS[p.market] : null
    items.push({
      kind: 'post', id: `post:${p.id}`, post_id: p.id, app_id: p.app_id, at: p.scheduled_at!, series_id: p.series_id, occurrence: p.occurrence,
      targets: targetsOf(p.targets), captions, media: mediaFor(p, p.targets[0]?.platform), hashtags: hashtagsOf(p.caption, ...Object.values(p.overrides ?? {})),
      market: m ? { id: m.id, flag: m.flag, name: m.name, short: m.short } : null, caption_by: p.caption_by, notes: p.notes, checks: [], raw: p,
    })
  }

  // Runs a repeating series will make that aren't in the queue yet.
  for (const s of series.filter((x) => x.status === 'active' && (!appFilter || x.app_id === appFilter))) {
    const queued = new Set(posts.filter((p) => p.series_id === s.id && p.scheduled_at).map((p) => p.scheduled_at!.slice(0, 16)))
    const spec = { rule: s.rule, startsAt: s.starts_at, endsAt: s.ends_at, maxRuns: s.max_runs, captionMode: s.caption_mode, notes: s.notes }
    for (const d of nextRuns(spec, 10, now).filter((d) => d < until && !queued.has(d.toISOString().slice(0, 16)))) {
      items.push({ kind: 'repeat', id: `repeat:${s.id}:${d.toISOString()}`, series_id: s.id, app_id: s.app_id, at: d.toISOString(), rule: describeRule(s.rule),
        caption: s.caption, caption_mode: s.caption_mode, targets: targetsOf(s.targets), media: mediaOf(s.media), hashtags: hashtagsOf(s.caption), checks: [] })
    }
  }

  // Boosts, with the post they promote.
  const postIds = [...new Set(promos.map((p) => p.post_id).filter((x): x is string => !!x))]
  const boostPosts = postIds.length ? await rest<Post[]>(`studio_posts?id=in.(${postIds.map(encodeURIComponent).join(',')})&select=id,caption,overrides,media,media_overrides,targets`).catch(() => [] as Post[]) : []
  for (const b of promos) {
    const p = boostPosts.find((x) => x.id === b.post_id)
    const start = Date.parse(b.start_at), end = Date.parse(b.end_at)
    const spanDays = Math.max(1, Math.ceil((end - Math.max(start, now.getTime())) / 86400000))
    const plat = (b.platform === 'tiktok' ? 'tiktok' : b.platform) as Platform
    items.push({
      kind: 'boost', id: `boost:${b.id}`, promotion_id: b.id, app_id: b.app_id, at: start > now.getTime() ? b.start_at : now.toISOString(),
      network: b.network, platform: b.platform, status: b.status, live: b.status === 'active' && start <= now.getTime(),
      start_at: b.start_at, end_at: b.end_at, goal: String(b.goal), daily_budget_cents: b.daily_budget_cents,
      total_cents: b.status === 'paused' ? 0 : b.daily_budget_cents * spanDays, campaign_id: b.campaign_id,
      audience: audienceOf(b), checks: [],
      post: p ? { caption: (p.overrides?.[plat] ?? p.caption ?? '').trim(), media: mediaFor(p, plat), permalink: b.permalink } : b.permalink ? { caption: '', media: [], permalink: b.permalink } : null,
    })
  }

  items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  // ── Checks ──────────────────────────────────────────────────────────────
  const firstUrl = (m: UpMedia[]) => (m[0]?.url ?? '').split('?')[0]
  const shipped = recent.filter((p) => p.status === 'done' || p.status === 'partial')
  for (const it of items) {
    if (it.kind === 'post') {
      for (const t of it.targets) if (t.format !== 'story' && !it.captions[t.platform]) it.checks.push(`No caption on ${t.platform === 'tiktok' ? 'TikTok' : t.platform[0].toUpperCase() + t.platform.slice(1)}`)
      if (!it.media.length && it.targets.some((t) => t.platform !== 'threads' && t.platform !== 'facebook')) it.checks.push('No media attached')
      const url = firstUrl(it.media), at = Date.parse(it.at)
      if (url) {
        const twin = [...items.filter((o) => o !== it && o.kind === 'post' && o.app_id === it.app_id && Math.abs(Date.parse(o.at) - at) < 3 * 86400000 && Date.parse(o.at) < at),
          ...shipped.filter((p) => p.app_id === it.app_id && firstUrl(mediaOf(p.media)) === url).map(() => null)]
          .some((o) => o === null || (o.kind === 'post' && firstUrl(o.media) === url && o.targets.some((t) => it.targets.some((u) => u.platform === t.platform && u.format === t.format))))
        if (twin) it.checks.push('Same video on the same account within 3 days')
      }
      const clash = items.find((o) => o !== it && o.kind === 'post' && o.app_id === it.app_id && Math.abs(Date.parse(o.at) - at) < 30 * 60000 && Date.parse(o.at) <= at
        && o.targets.some((t) => t.format !== 'story' && it.targets.some((u) => u.format !== 'story' && u.platform === t.platform)))
      if (clash) it.checks.push('Two feed posts on one account within 30 minutes')
    }
    if (it.kind === 'boost') {
      const s = strategyFor(it.app_id)
      if (s?.ads_state === 'paused' && it.status !== 'paused') it.checks.push(`${s.name} ads are meant to be paused — this boost will spend`)
      if (!it.audience.places.length) it.checks.push('No location set')
    }
  }

  // ── Gaps: days with nothing for an app that posts in this window ─────────
  const dayList = Array.from({ length: days }, (_, i) => chicagoDay(new Date(now.getTime() + i * 86400000)))
  const appsPosting = [...new Set(items.filter((i) => i.kind !== 'boost').map((i) => i.app_id))]
  const gaps = appsPosting.map((a) => {
    const busy = new Set(items.filter((i) => i.app_id === a && i.kind !== 'boost').map((i) => chicagoDay(i.at)))
    return { app_id: a, days: dayList.filter((d) => !busy.has(d)) }
  }).filter((g) => g.days.length && g.days.length < days)

  const byPlatform: Partial<Record<Platform, number>> = {}
  for (const it of items) if (it.kind !== 'boost') for (const t of it.targets) byPlatform[t.platform] = (byPlatform[t.platform] ?? 0) + 1
  return {
    from: now.toISOString(), to: until.toISOString(), days, app, items, gaps,
    counts: { posts: items.filter((i) => i.kind === 'post').length, repeats: items.filter((i) => i.kind === 'repeat').length, boosts: items.filter((i) => i.kind === 'boost').length,
      by_platform: byPlatform, checks: items.reduce((n, i) => n + i.checks.length, 0) },
    generated_at: now.toISOString(),
  }
}
