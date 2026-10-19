// ─── AI captions (Claude) ───────────────────────────────────────────────────
//
// SERVER ONLY. Writes one caption per destination — an Instagram Reel, a
// TikTok, a Thread and a Facebook post each get copy written for how that
// platform is read — from:
//   • still frames of the video (or the photos themselves),
//   • the app's caption brief in Drive Marketing/<App>-brief-captions.md,
//   • Brian's notes and draft, and the captions this post already used
//     (so a repeating post never says the same thing twice).
//
//   ANTHROPIC_API_KEY        — required (Vercel env only)
//   ANTHROPIC_CAPTION_MODEL  — optional, defaults to claude-sonnet-5-5

import { PLATFORMS, FORMAT_LABEL, ratioName, type MediaItem, type Platform, type Target } from './rules'
import { PUBLISH_APPS } from './platforms'
import { captionBrief } from './marketing'
import { APP_MARKET_NOTES, MARKETS, storeLinkFor, type MarketId } from './markets'
import { STORE_APPS } from '@/lib/ads/store'

const MODEL = () => process.env.ANTHROPIC_CAPTION_MODEL || 'claude-sonnet-5-5'
export const captionsConfigured = () => !!process.env.ANTHROPIC_API_KEY

export type CaptionInput = {
  appId: string
  targets: Target[]
  media: MediaItem[]
  /** Public image URLs Claude looks at (video frames or the photos). */
  frames: string[]
  notes?: string
  /** Brian's own words, if any — kept as the intent, not copied verbatim. */
  draft?: string
  /** Captions already used for this post; don't repeat them. */
  avoid?: string[]
  /** The market edition this caption is for: its language variant, local
   *  App Store link and local hashtags (markets.ts). Omitted = US English. */
  market?: MarketId
}
export type CaptionOutput = {
  caption: string
  overrides: Partial<Record<Platform, string>>
  model: string
  brief: 'drive' | 'built-in'
}

const GUIDE: Record<string, string> = {
  'instagram:reel': 'Instagram Reel. First line is the hook (it shows above "more"). 1–4 short lines total, a clear call to action ("link in bio" — links in Instagram captions are not clickable), then 3–6 relevant hashtags on the last line. Under 600 characters.',
  'instagram:feed': 'Instagram feed post / carousel. Hook first line; if it is a carousel, give a reason to swipe. 2–5 short lines, "link in bio" CTA, 3–6 hashtags at the end. Under 800 characters.',
  'facebook:reel': 'Facebook Reel. One or two punchy conversational lines; the App Store link can go in directly (clickable on Facebook). 0–2 hashtags. Under 300 characters.',
  'facebook:post': 'Facebook Page post. Friendly, a little longer and more explanatory than Instagram, written for people who share with friends and family. Include the App Store link directly (clickable). 0–2 hashtags. Under 600 characters.',
  'threads:post': 'Threads post. HARD LIMIT 500 characters — aim for 150–300. Conversational, sounds like a person not an ad; ending with a question that invites replies works well. At most one topic tag, no hashtag lists. A link is fine.',
  'tiktok:post': 'TikTok video caption. Short: a hook or punchline in under ~150 characters, then AT MOST 4 hashtags (the TikTok limit) mixing one broad and a few niche ones. Never "gay" + a place (#gaychicago, #gaynyc…): TikTok removes them as restricted — use #queer<city>, #gaytiktok or #lgbtq instead. No links (not clickable on TikTok) — say "link in bio" if a CTA fits. Native, lowercase-casual is fine.',
}

const SYSTEM = `You write social captions for Clarendon Labs, a one-person iOS app studio in Chicago ("apps for the group chat").
You get the app's caption brief (voice, facts, do-nots), still frames from the video or the photos being posted, and the list of destinations.
Write ONE caption per destination, each native to that platform — not the same text resized.

Hard rules (break none):
- Only say true things. Describe what is actually visible in the frames and what the brief says the app does. Never invent features, prices, ratings, download counts, awards, reviews or testimonials.
- iOS only: never mention Android or Google Play.
- If the brief says the app is paid or has a trial, never call it free.
- AI avatars or actors in a video are never presented as real users.
- If the brief marks the app as kid-directed, write to parents only, never to children.
- No emoji walls: at most 2 emoji per caption, none is fine.
- Hashtags only at the end of a caption, never mid-sentence, and never more than 6.
- If you are given previous captions, the new ones must take a clearly different angle and opening line.
Return the captions with the post_captions tool.`

/** The destinations that actually take a caption (Instagram Stories don't). */
const captioned = (targets: Target[]) => targets.filter((t) => !(t.platform === 'instagram' && t.format === 'story'))

export async function writeCaptions(input: CaptionInput): Promise<CaptionOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('AI captions aren’t set up yet (ANTHROPIC_API_KEY is not set).')
  const app = PUBLISH_APPS.find((a) => a.id === input.appId)
  if (!app) throw new Error('Unknown app.')
  const targets = captioned(input.targets)
  if (!targets.length) return { caption: '', overrides: {}, model: MODEL(), brief: 'built-in' }

  const brief = await captionBrief(input.appId)
  const m = input.media
  const mediaLine = !m.length ? 'No media — text-only post.'
    : m.length > 1 ? `A ${m.length}-item carousel (${m.filter((x) => x.kind === 'video').length} videos).`
    : `One ${m[0].kind}, ${ratioName(m[0].width / m[0].height)}${m[0].duration ? `, ${Math.round(m[0].duration)} seconds` : ''}.`

  const text = [
    `App: ${app.name}`,
    `Caption brief (from Drive Marketing/, ${brief.source}):\n<brief>\n${brief.text || '(none)'}\n</brief>`,
    `What is being posted: ${mediaLine}${input.frames.length ? ` The ${input.frames.length} image(s) above are ${m[0]?.kind === 'video' ? 'frames from the video, in order' : 'the photos'}.` : ''}`,
    input.notes?.trim() ? `Brian's notes on this post: ${input.notes.trim()}` : '',
    input.draft?.trim() ? `Brian's draft (keep the intent, improve the words):\n${input.draft.trim()}` : '',
    input.avoid?.length ? `Captions this post has already used — do NOT reuse their hooks or wording:\n${input.avoid.map((c, i) => `${i + 1}. ${c.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}` : '',
    marketBlock(input.appId, input.market),
    `Destinations:\n${targets.map((t) => `- ${t.platform}: ${GUIDE[`${t.platform}:${t.format}`] ?? GUIDE[`${t.platform}:post`]}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')

  const props: Record<string, { type: 'string'; description: string }> = {}
  for (const t of targets) props[t.platform] = { type: 'string', description: `Caption for ${PLATFORMS.find((p) => p.id === t.platform)!.name} ${FORMAT_LABEL[t.format]}` }

  const call = async (withImages: boolean) => {
    const content = [
      ...(withImages ? input.frames.slice(0, 6).map((url) => ({ type: 'image', source: { type: 'url', url } })) : []),
      { type: 'text', text },
    ]
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(45_000),
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 8000, system: SYSTEM,  // room for the model's thinking + the captions
        tools: [{ name: 'post_captions', description: 'One caption per destination.', input_schema: { type: 'object', properties: props, required: Object.keys(props) } }],
        // Newer models (extended thinking on by default) reject a forced
        // tool_choice ("tool"/"any"), so let the model choose and ask for the
        // tool in the prompt; a JSON answer in plain text is accepted too.
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Answer by calling the post_captions tool (or, if you cannot, reply with only a JSON object with the same keys).' }] }],
      }),
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  }

  let r = await call(input.frames.length > 0)
  // An image Anthropic couldn't fetch shouldn't cost the caption: retry text-only.
  if (!r.ok && r.status === 400 && input.frames.length) r = await call(false)
  if (!r.ok) throw new Error(`Claude couldn’t write captions: ${r.body?.error?.message ?? `HTTP ${r.status}`}`)
  const blocks = (r.body.content ?? []) as { type: string; input?: Record<string, string>; text?: string }[]
  let out = blocks.find((c) => c.type === 'tool_use')?.input
  if (!out) {
    const text = blocks.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    try { out = json ? JSON.parse(json) : undefined } catch { out = undefined }
  }
  if (!out) throw new Error('Claude didn’t return captions.')

  const overrides: Partial<Record<Platform, string>> = {}
  for (const t of targets) {
    const spec = PLATFORMS.find((p) => p.id === t.platform)!
    overrides[t.platform] = fit(String(out[t.platform] ?? '').trim(), t.platform === 'instagram' ? Math.min(spec.captionMax, 2200) : spec.captionMax)
  }
  const first = targets[0].platform
  return { caption: overrides[first] ?? '', overrides, model: MODEL(), brief: brief.source }
}

/** Language, dialect and local details for one market edition. */
function marketBlock(appId: string, id?: MarketId): string {
  if (!id || id === 'us') return ''
  const m = MARKETS[id]
  const link = storeLinkFor((STORE_APPS as Record<string, { store?: string }>)[appId]?.store, m)
  return [
    `MARKET EDITION: ${m.flag} ${m.name}. Write EVERY caption entirely in ${m.langName} (${m.lang}) — native copy for people there, not a translation of an English caption.`,
    `Language variant: ${m.voice}`,
    APP_MARKET_NOTES[appId]?.[id] ? `App wording for this market: ${APP_MARKET_NOTES[appId]![id]}` : '',
    'Hashtags: local ones people in this market actually use, in the local language (plus the app name tag). Keep the per-platform hashtag limits.',
    'Calls to action and "link in bio" in the local language (e.g. "lien en bio", "link en la bio", "Link in Bio").',
    link ? `Where a link is allowed (Facebook, Threads), use this market's App Store link: ${link}` : '',
    'The brief is written in English; its facts and do-nots still apply in every language.',
  ].filter(Boolean).join('\n')
}

/** Trim to a limit on a word boundary (Threads' 500 is the one that bites). */
function fit(s: string, max: number) {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trimEnd() + '…'
}
