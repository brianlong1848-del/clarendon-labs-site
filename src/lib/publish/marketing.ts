// ─── Marketing folder sync ──────────────────────────────────────────────────
//
// SERVER ONLY. The link between /post and Drive "Clarendon/Marketing":
//
//   <App>-brief-captions.md  READ  — voice, facts, hashtags and do-nots the AI
//                                    writes captions from. Owned by the
//                                    marketing project; edit it there and the
//                                    next caption picks it up (10-min cache).
//   <App>-post-log.md        WRITE — every post that goes out from /post or the
//                                    Studio app is appended here (date, where,
//                                    caption, links). The site is this file's
//                                    only writer (vault rule 13: one writer per
//                                    file), so the marketing project reads it
//                                    instead of re-logging posts by hand.

import { findFile, readText, writeText, driveConfigured } from '@/lib/drive'
import { PLATFORMS, FORMAT_LABEL, captionFor, ratioName } from './rules'
import { describeRule, type RepeatRule } from './recur'
import type { Post } from './store'

export const MARKETING_FOLDER = process.env.DRIVE_MARKETING_FOLDER_ID || '1-vzqBJv0-EeSM6Lt4NJyBNx0coNJNzmz'

/** How each app is spelled in Drive file names (matches <App>-marketing-log.md). */
export const DRIVE_NAME: Record<string, string> = {
  rolligan: 'Rolligan', gagorder: 'GagOrder', yulepick: 'Yulepick', borea: 'Borea', jinglewire: 'Jinglewire',
}
export const briefName = (appId: string) => `${DRIVE_NAME[appId] ?? appId}-brief-captions.md`
export const postLogName = (appId: string) => `${DRIVE_NAME[appId] ?? appId}-post-log.md`

// Used only when Drive isn't reachable, so captions never go out knowing nothing.
const FALLBACK: Record<string, string> = {
  rolligan: 'Rolligan (pronounced "roll again") — a push-your-luck dice party game for iPhone. Friends without iPhones join from the web. App Store: https://apps.apple.com/us/app/rolligan/id6774974562 . Tagline: "Push your luck. Bank or bust."',
  gagorder: 'Gag Order — "the queer party game": a pass-and-play party card game for iPhone and Apple TV, with web play for friends. App Store: https://apps.apple.com/us/app/gag-order-party-game/id6776382535',
  yulepick: 'YulePick — a Secret Santa app for friends, families and coworkers: random secret assignments, exclusions, private reveal. Holiday launch; check the brief before naming a store link.',
  borea: 'Borea — macro and calorie tracker with an AI coach. Paid with a 7-day free trial — never call it a free app. App Store: https://apps.apple.com/app/id6799219647 . Site: boreaapp.com',
  jinglewire: 'Jinglewire: Video Call Santa — live AI Santa video calls for kids, bought by parents, with a wish-list report to the parent after every call. KID-DIRECTED: write to parents only, never to children; always present Santa as AI; never say "for kids" in a way that targets children or claim "COPPA compliant". US only, holiday 2026.',
}

const briefCache = new Map<string, { at: number; text: string; source: 'drive' | 'built-in' }>()

/** The app's caption brief from Drive (cached 10 minutes), else built-in facts. */
export async function captionBrief(appId: string): Promise<{ text: string; source: 'drive' | 'built-in' }> {
  const hit = briefCache.get(appId)
  if (hit && Date.now() - hit.at < 600_000) return hit
  let out: { text: string; source: 'drive' | 'built-in' } = { text: FALLBACK[appId] ?? '', source: 'built-in' }
  if (driveConfigured()) {
    try {
      const f = await findFile(briefName(appId), MARKETING_FOLDER)
      if (f) out = { text: (await readText(f.id)).slice(0, 24_000), source: 'drive' }
    } catch { /* fall back to the built-in facts */ }
  }
  briefCache.set(appId, { ...out, at: Date.now() })
  return out
}

const CT = 'America/Chicago'
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: CT, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const ymd = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: CT })

/** Appends one finished post to Marketing/<App>-post-log.md. Throws if Drive or the file isn't there. */
export async function logPost(post: Post, series?: { rule: RepeatRule } | null): Promise<void> {
  if (!driveConfigured()) throw new Error('Drive not connected.')
  const f = await findFile(postLogName(post.app_id), MARKETING_FOLDER)
  if (!f) throw new Error(`${postLogName(post.app_id)} is missing from Marketing/.`)

  const name = (p: string) => PLATFORMS.find((x) => x.id === p)?.name ?? p
  const where = post.targets.map((t) => `${name(t.platform)}${t.platform === 'instagram' || t.platform === 'facebook' ? ' ' + FORMAT_LABEL[t.format] : ''}`).join(', ')
  const ok = post.targets.filter((t) => t.status === 'published').length
  const m = post.media
  const mediaLine = !m.length ? 'Text only'
    : m.length > 1 ? `${m.length}-item carousel (${m.filter((x) => x.kind === 'video').length} video)`
    : `1 ${m[0].kind}, ${ratioName(m[0].width / m[0].height)}${m[0].duration ? `, ${Math.round(m[0].duration)}s` : ''}`

  const lines = [
    '',
    `### ${stamp(post.scheduled_at ?? post.created_at)} CT — ${where}`,
    `- Result: ${ok === post.targets.length ? 'Posted everywhere' : `Posted ${ok} of ${post.targets.length}`}`,
    `- Sent from: ${post.source === 'studio-ios' ? 'Studio iPhone app' : 'clarendon.dev/post'}${post.series_id ? ` · repeat #${post.occurrence ?? '?'}${series ? ` (${describeRule(series.rule)})` : ''}` : ''}`,
    `- Caption written by: ${post.caption_by === 'ai' ? 'AI (Claude), from the caption brief' : 'Brian'}`,
    `- Media: ${mediaLine}${m[0]?.url ? ` — ${m.map((x) => x.url).join(' , ')}` : ''}`,
    ...(post.notes ? [`- Notes: ${post.notes.replace(/\s+/g, ' ').trim()}`] : []),
  ]
  for (const t of post.targets) {
    const text = t.format === 'story' ? '' : captionFor(t.platform, post.caption, post.overrides)
    lines.push(`- **${name(t.platform)}${t.platform === 'instagram' || t.platform === 'facebook' ? ' ' + FORMAT_LABEL[t.format] : ''}** — ${t.status === 'published' ? (t.permalink ?? 'live') : `failed: ${t.error ?? 'unknown error'}`}`)
    if (text) lines.push(...text.split('\n').map((l) => `  > ${l}`))
  }

  let body = await readText(f.id)
  body = /^\*\*Last updated:\*\*.*$/m.test(body)
    ? body.replace(/^\*\*Last updated:\*\*.*$/m, `**Last updated:** ${ymd()} (auto, clarendon.dev/post)`)
    : body
  await writeText(f.id, body.replace(/\s*$/, '\n') + lines.join('\n') + '\n')
}
