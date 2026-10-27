// ─── Ad insights: the narrative (Claude) ─────────────────────────────────────
//
// SERVER ONLY. Puts words around the rules engine's numbers (./insights.ts):
// a summary for the "This week" card, a two-sentence "why" and a concrete
// "try next" per campaign, and up to three cross-app ideas. Same setup as
// /post captions (src/lib/publish/captions.ts): ANTHROPIC_API_KEY, raw
// Messages API call, the answer comes back through a tool schema. It gets the
// rule outputs, the figures, campaign names and targeting, each app's caption
// brief from Drive and the FEAT-CLA-020/021 playbook — and is told it may not
// invent a number or claim installs it can't see. Cached one per day, app and
// range in studio_ad_insights; "Regenerate" replaces it.
//
//   ANTHROPIC_INSIGHTS_MODEL — optional, defaults to claude-opus-5-5

import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { captionBrief } from '@/lib/publish/marketing'
import { rest } from '@/lib/publish/store'
import { tiktokCached } from '@/lib/analytics/tiktok'
import type { CampaignRow, Range } from './campaigns'
import type { Action, Analysis, Insight } from './insights'
import { STAGE_LABEL, VERDICT_LABEL } from './insights'
import { KID_APPS, type Promotion } from './meta'

const MODEL = () => process.env.ANTHROPIC_INSIGHTS_MODEL || 'claude-opus-5-5'
export const narrativeConfigured = () => !!process.env.ANTHROPIC_API_KEY

export type Narrative = {
  summary: string
  campaigns: { campaign_id: string; why: string; try_next: string }[]
  ideas: { app_id?: string; title: string; detail: string }[]
  model: string
  generated_at: string
  /** True when a safety decline was re-run on the fallback model (usage.iterations has a fallback_message). */
  fallback?: boolean
}

/** Chicago's date — the cache is per Brian's day, not UTC's. */
export const chicagoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// Condensed from vault FEAT-CLA-020 (safe zones) and FEAT-CLA-021 (Spark Ad playbook).
const PLAYBOOK = `Clarendon Labs ad playbook (vault FEAT-CLA-020 / 021 / 022):
- Every TikTok paid post runs through Ads Manager on the app's own ad account (never the in-app Promote button). Studio can create TikTok boosts (Spark Ads: Video views = 15-second focused view; Downloads = Traffic campaign with a single Download button to https://clarendon.dev/get/<app>?ct=<token>) and Meta boosts of posted FB/IG posts.
- A published Video views ad can't get a button later — plan the button before publishing; to add one, run a Traffic campaign.
- TikTok minimum $20/day; marketing plans say start small and put money behind what already works ("don't pay to find the hook, pay to amplify it").
- Safe zones: a promoted post gets "Sponsored" + a full-width CTA over the bottom third. TikTok safe box x 120–780, y 240–1260 on 1080×1920; Reels x 65–930, y 269–1248. Text or key action outside the box is a creative fix, not a targeting fix.
- One audience cut per ad group: Gag Order's lesbian cut goes with sapphic/wlw hashtags, the gay cut with drag/RuPaul — never mixed. TikTok and Meta allow NO targeting by sexual orientation; "Pride"/"drag" interests were refused — use the 28 queer cities + nightlife / game-night interests instead.
- Jinglewire is kid-directed: ads target parents only (25+), no interest/behaviour targeting of children, no attribution ever.
- Installs: only Apple's campaign tokens (App Store Connect, 5+ installs per link) or the platform's own attributed installs count. If an install figure isn't in the data, say installs aren't visible yet.
- Measure: 15-second views, cost per view, profile visits, follows for views campaigns; CTR, CPC, installs, CPI, est. ROAS for traffic / app promotion.`

const SYSTEM = `You are the ad analyst for Clarendon Labs, a one-person iOS studio in Chicago with five apps. Brian reads your output on a phone between other things: short, concrete, no filler.

You receive, for each campaign, the figures and the deterministic rules engine's verdict (Too early / Winning / OK / Needs work), reason and weakest stage. You do NOT re-judge; you explain and say what to try next.

Hard rules (break none):
- Use only the numbers you were given, quoted as given (round sensibly). Never invent a figure, a benchmark, a trend or a count. Never claim installs, downloads or revenue unless the data has them — say "installs aren't visible for this campaign yet" instead.
- Never suggest targeting by sexual orientation or gender identity (not allowed on any platform). For queer audiences suggest cities, culture interests and the right creative cut.
- For a kid-directed app (Jinglewire): parents only, 25+, never anything that targets or appeals to children.
- Don't say Android or Google Play. Don't call a paid app free.
- "why": 2 sentences max, plain words, name the stage that's weak or strong. "try_next": one concrete thing — a specific new hook line in the app's voice (from the brief), a CTA / goal change (e.g. "run it as Traffic with a Download button"), splitting audience cuts, a safe-zone fix, reusing a winning angle across apps, or the next A/B test (name both arms).
- "summary": 2–3 sentences for the whole week across apps; lead with the biggest decision.
- "ideas": 0–3 cross-app or next-test ideas not tied to one campaign. Skip it if there's nothing real to say.
Answer by calling the ad_insights tool.`

type Input = {
  app: string | 'all'; range: Range
  rows: CampaignRow[]; analysis: Analysis
  promotions: Pick<Promotion, 'campaign_id' | 'network' | 'goal' | 'audience' | 'daily_budget_cents' | 'start_at' | 'end_at'>[]
}

function campaignBlock(r: CampaignRow, i: Insight, p?: Input['promotions'][number]) {
  const m = i.metrics
  const app = PUBLISH_APPS.find((a) => a.id === r.app_id)?.name ?? 'Shared'
  const f = (v?: number, d = 2) => (v == null ? 'n/a' : Number(v.toFixed(d)))
  const usd = (c?: number) => (c == null ? 'n/a' : `$${(c / 100).toFixed(2)}`)
  const lines = [
    `campaign_id: ${r.campaign_id} | ${app} | ${r.platform} | "${r.name}" | objective ${r.objective ?? 'n/a'} (${i.objective_kind}) | status ${r.status ?? 'unknown'}${r.budget_daily_cents ? ` | budget ${usd(r.budget_daily_cents)}/day` : ''}${r.promotion_id ? ' | Studio boost' : ''}`,
    `  spend ${usd(m.spend_cents)} | impressions ${m.impressions ?? 'n/a'} | reach ${r.reach ?? 'n/a'} | frequency ${f(m.frequency, 1)} | 2s views ${r.views2s ?? 'n/a'} | 15s views ${r.views15s ?? 'n/a'} | watched to end ${r.views100 ?? 'n/a'} | clicks ${r.clicks ?? 'n/a'} | follows ${r.follows ?? 'n/a'} | profile visits ${r.profile_visits ?? 'n/a'} | likes ${r.likes ?? 'n/a'} | shares ${r.shares ?? 'n/a'}`,
    `  hook rate ${f(m.hook_rate)} | hold rate ${f(m.hold_rate)} | CTR ${f(m.ctr)}% | CPC ${usd(m.cpc_cents)} | CPM ${usd(m.cpm_cents)} | cost per 15s view ${usd(m.cost_per_view15_cents)} | follows per $ ${f(m.follows_per_dollar)} | installs ${m.installs ?? 'not visible'} | CPI ${usd(m.cpi_cents)} | est. ROAS ${f(m.est_roas)}`,
    m.trend ? `  trend (last 3 days vs 3 before): CTR change ${f(m.trend.ctr_change)} | frequency change ${f(m.trend.frequency_change)} | fatigue ${m.trend.fatigue}` : '',
    `  verdict: ${VERDICT_LABEL[i.verdict]} | weakest stage: ${i.weakest ? STAGE_LABEL[i.weakest] : 'n/a'} | grades: ${Object.entries(i.grades).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    `  reason: ${i.reason}`,
    p ? `  targeting (Studio boost): goal ${p.goal}, ${JSON.stringify(p.audience).slice(0, 600)}` : '',
    r.ads.length ? `  ads: ${r.ads.map((a) => `"${a.name}" (${a.status ?? 'status n/a'}, ${usd(a.spend_cents)}, CTR ${a.ctr ?? 'n/a'}%)`).join('; ')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export async function writeNarrative(input: Input): Promise<Narrative> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Ad insights aren’t set up yet (ANTHROPIC_API_KEY is not set).')
  const appIds = Array.from(new Set(input.rows.map((r) => r.app_id).filter((x): x is string => !!x)))
  const briefs = await Promise.all(appIds.map(async (id) => ({ id, brief: await captionBrief(id).catch(() => ({ text: '', source: 'built-in' as const })) })))
  const promoBy = new Map(input.promotions.map((p) => [`${p.network}:${p.campaign_id}`, p]))
  const text = [
    `Week of ${chicagoDay()} · window ${input.range} · scope ${input.app === 'all' ? 'every app' : PUBLISH_APPS.find((a) => a.id === input.app)?.name ?? input.app}.`,
    `<playbook>\n${PLAYBOOK}\n</playbook>`,
    ...briefs.map((b) => `<brief app="${b.id}"${KID_APPS.has(b.id) ? ' kid_directed="true"' : ''}>\n${b.brief.text || '(no brief on file)'}\n</brief>`),
    `<campaigns>\n${input.rows.map((r) => campaignBlock(r, input.analysis.campaigns[`${r.platform}:${r.campaign_id}`], promoBy.get(`${r.platform}:${r.campaign_id}`))).join('\n\n')}\n</campaigns>`,
    `<ranked_actions>\n${input.analysis.actions.map((a, i) => `${i + 1}. [${a.kind}] ${a.title} — ${a.detail}`).join('\n') || '(none)'}\n</ranked_actions>`,
    'Write the summary, one entry per campaign_id above, and ideas. Call the ad_insights tool.',
  ].join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(90_000),
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(), max_tokens: 8000, system: SYSTEM,
      fallbacks: 'default',   // a safety decline is re-run on Anthropic's default fallback model
      tools: [{ name: 'ad_insights', description: 'The week’s ad insights.', input_schema: {
        type: 'object', additionalProperties: false, required: ['summary', 'campaigns', 'ideas'],
        properties: {
          summary: { type: 'string' },
          campaigns: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['campaign_id', 'why', 'try_next'],
            properties: { campaign_id: { type: 'string' }, why: { type: 'string' }, try_next: { type: 'string' } } } },
          ideas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'detail'],
            properties: { app_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' } } } },
        } }, strict: true }],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Claude couldn’t write the insights: ${body?.error?.message ?? `HTTP ${res.status}`}`)
  if (body.stop_reason === 'refusal') throw new Error('Claude declined to write the insights (safety classifier).')
  const blocks = (body.content ?? []) as { type: string; input?: Record<string, unknown>; text?: string }[]
  let out = blocks.find((c) => c.type === 'tool_use')?.input
  if (!out) {
    const plain = blocks.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    const json = plain.match(/\{[\s\S]*\}/)?.[0]
    try { out = json ? JSON.parse(json) : undefined } catch { out = undefined }
  }
  if (!out || typeof out.summary !== 'string') throw new Error('Claude didn’t return insights.')
  const known = new Set(input.rows.map((r) => r.campaign_id))
  const fallback = Array.isArray(body.usage?.iterations) && body.usage.iterations.some((e: { type?: string }) => e?.type === 'fallback_message')
  console.log(`[insights] narrative for ${input.app}/${input.range} by ${body.model ?? MODEL()}${fallback ? ' (FALLBACK model)' : ''}, ${body.usage?.input_tokens ?? '?'} in / ${body.usage?.output_tokens ?? '?'} out`)
  return {
    summary: String(out.summary).trim(),
    campaigns: (Array.isArray(out.campaigns) ? out.campaigns : []).filter((c: any) => known.has(String(c?.campaign_id))).map((c: any) => ({ campaign_id: String(c.campaign_id), why: String(c.why ?? '').trim(), try_next: String(c.try_next ?? '').trim() })),
    ideas: (Array.isArray(out.ideas) ? out.ideas : []).slice(0, 3).map((i: any) => ({ app_id: i?.app_id ? String(i.app_id) : undefined, title: String(i?.title ?? '').trim(), detail: String(i?.detail ?? '').trim() })).filter((i: { title: string }) => i.title),
    model: String(body.model ?? MODEL()), generated_at: new Date().toISOString(), fallback,
  }
}

// ── Per-day cache (studio_ad_insights) ──────────────────────────────────────

type Row = { day: string; app: string; range: string; narrative: Narrative; model: string | null; created_at: string }

export async function cachedNarrative(input: Input, fresh = false): Promise<Narrative | null> {
  const day = chicagoDay()
  const key = `narrative:${day}:${input.app}:${input.range}`
  if (!fresh) {
    const hit = (await rest<Row[]>(`studio_ad_insights?day=eq.${day}&app=eq.${encodeURIComponent(input.app)}&range=eq.${input.range}&select=day,app,range,narrative,model,created_at&limit=1`).catch(() => []))[0]
    if (hit?.narrative?.summary) return hit.narrative
  }
  // One Claude call per day/app/range even when the card and the Campaigns rows ask at once.
  const n = await tiktokCached(key, fresh, () => writeNarrative(input), 24 * 60 * 60_000)
  await rest('studio_ad_insights?on_conflict=day,app,range', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ day, app: input.app, range: input.range, narrative: n, model: n.model }),
  }).catch(() => { /* the answer still goes back; only the cache missed */ })
  return n
}

export const actionsBlocked = (a: Action) => a.blocked
