import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { rest } from '@/lib/publish/store'
import { campaignsFor, RANGES, type Range } from '@/lib/ads/campaigns'
import { analyze, type MoneyFacts } from '@/lib/ads/insights'
import { cachedNarrative, chicagoDay, narrativeConfigured } from '@/lib/ads/narrative'
import { recentActions, runAction, type ActionRequest } from '@/lib/ads/actions'
import { adsReportForSession } from '@/lib/money/adsReport'
import { tiktokAdvertiserId, tiktokManagementScope } from '@/lib/analytics/tiktok'
import { adsManagerUrl } from '@/lib/ads/tiktok'
import { getPost } from '@/lib/publish/store'
import type { Action } from '@/lib/ads/insights'
import type { Promotion } from '@/lib/ads/meta'

/** Ties each action to the world: "Done <date>" from the log, the Ads
 *  Manager link while TikTok's scope is pending, /post prefilled for
 *  reuse_angle. Never throws. */
async function enrich(actions: Action[], promotions: Pick<Promotion, 'campaign_id' | 'network' | 'post_id' | 'remote_id'>[]): Promise<Action[]> {
  const log = await recentActions(30)
  const scope = new Map<string, boolean>()
  for (const a of actions) {
    if (a.platform !== 'tiktok' || !a.app_id || scope.has(a.app_id)) continue
    const adv = tiktokAdvertiserId(a.app_id)
    scope.set(a.app_id, adv ? await tiktokManagementScope(adv) : false)
  }
  const promoBy = new Map(promotions.map((p) => [`${p.network}:${p.campaign_id}`, p]))
  return Promise.all(actions.map(async (a) => {
    const out: Action = { ...a }
    const adv = a.platform === 'tiktok' && a.app_id ? tiktokAdvertiserId(a.app_id) : undefined
    if (adv) { out.advertiser_id = adv; out.manager_url = adsManagerUrl(adv, a.campaign_id) }
    const promo = promoBy.get(`${a.platform}:${a.campaign_id}`)
    if (promo?.post_id) out.post_id = promo.post_id
    if (!out.item_id && promo?.remote_id) out.item_id = promo.remote_id
    const done = log.get(`${a.platform}:${a.campaign_id}:${a.kind}`)
    if (done && !out.done) out.done = { at: done.created_at, note: `Done ${new Date(done.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, result_ids: done.result_ids ?? undefined }
    if (a.kind === 'reuse_angle') {
      const q = new URLSearchParams({ app: a.app_id ?? '', notes: `Reuse the angle of "${a.campaign_name}"` })
      if (promo?.post_id) {
        const post = await getPost(promo.post_id).catch(() => null)
        if (post) { if (post.caption) q.set('caption', post.caption); const m = post.media[0]; if (m?.url) q.set('media', m.url) }
      }
      out.href = `/post?${q}`; out.button = 'Open in Post'
    }
    // TikTok writes need the Ads Management scope: until then the button opens Ads Manager instead of erroring.
    if (a.platform === 'tiktok' && out.button && !out.href && a.kind !== 'reuse_angle' && scope.get(a.app_id ?? '') === false) {
      out.href = out.manager_url; out.button = 'Open in Ads Manager'; out.note = 'API permission pending — TikTok is reviewing the Ads Management scope (requested 2026-10-27); do it in Ads Manager for now.'
      delete out.blocked; delete out.confirm; delete out.confirm_fields
    }
    return out
  }))
}

// ─── /api/ads/insights?app=&range=&fresh=1&narrative=0 ───────────────────────
//
// Ad insights (FEAT-CLA-023): the rules engine's verdict per campaign and ad,
// the week's ranked actions, and Claude's narrative (summary, why / try next
// per campaign, ideas) — cached once a day per app + range; `fresh=1` is the
// Regenerate button (it also refetches the campaigns). `narrative=0` skips
// Claude (rules only, fast). POST runs one action from the card.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const u = new URL(req.url)
  const app = u.searchParams.get('app') || 'all'
  const range = (RANGES.includes(u.searchParams.get('range') as Range) ? u.searchParams.get('range') : '30d') as Range
  const fresh = u.searchParams.get('fresh') === '1'
  const wantNarrative = u.searchParams.get('narrative') !== '0'
  if (app !== 'all' && !PUBLISH_APPS.some((a) => a.id === app)) return NextResponse.json({ error: 'Unknown app.' }, { status: 400 })

  const [{ campaigns, errors }, money, promotions] = await Promise.all([
    campaignsFor(app, range, fresh),
    adsReportForSession(await supabaseServer(), range === '7d' ? 7 : range === '90d' ? 90 : 30).catch(() => null),
    rest<Pick<Promotion, 'campaign_id' | 'network' | 'goal' | 'audience' | 'daily_budget_cents' | 'start_at' | 'end_at' | 'post_id' | 'remote_id'>[]>('studio_promotions?campaign_id=not.is.null&select=campaign_id,network,goal,audience,daily_budget_cents,start_at,end_at,post_id,remote_id').catch(() => []),
  ])
  const facts = new Map<string, MoneyFacts>()
  for (const c of money?.campaigns ?? []) facts.set(`${c.platform}:${c.campaign_id}`, { installs: c.installs || undefined, cpi_cents: c.cpi_cents ?? undefined, est_roas: c.est_roas ?? undefined, platform_roas: c.platform_roas ?? undefined })
  const analysis = analyze(campaigns, facts, range)
  analysis.actions = await enrich(analysis.actions, promotions)

  let narrative = null, narrativeError: string | undefined
  if (wantNarrative && campaigns.length) {
    if (!narrativeConfigured()) narrativeError = 'ANTHROPIC_API_KEY isn’t set, so there’s no write-up — the verdicts above are the rules engine’s.'
    else narrative = await cachedNarrative({ app, range, rows: campaigns, analysis, promotions }, fresh).catch((e) => { narrativeError = (e as Error).message; return null })
  }
  const byId = new Map((narrative?.campaigns ?? []).map((c) => [c.campaign_id, c]))
  return NextResponse.json({
    day: chicagoDay(), range, app,
    campaigns: campaigns.map((r) => ({
      platform: r.platform, campaign_id: r.campaign_id, app_id: r.app_id, name: r.name, status: r.status, objective: r.objective,
      insight: analysis.campaigns[`${r.platform}:${r.campaign_id}`],
      ads: r.ads.map((a) => ({ ad_id: a.ad_id, name: a.name, insight: analysis.ads[`${r.platform}:${r.campaign_id}:${a.ad_id}`] })),
      narrative: byId.get(r.campaign_id) ? { why: byId.get(r.campaign_id)!.why, try_next: byId.get(r.campaign_id)!.try_next } : undefined,
    })),
    actions: analysis.actions,
    summary: narrative?.summary, ideas: narrative?.ideas ?? [], model: narrative?.model, generated_at: narrative?.generated_at, fallback: narrative?.fallback ?? false,
    installs_visible: !!money, errors: [...errors, ...(narrativeError ? [narrativeError] : [])],
  })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Partial<ActionRequest>
  if (!body.kind || (body.platform !== 'tiktok' && body.platform !== 'meta') || !body.campaign_id) return NextResponse.json({ error: 'kind, platform and campaign_id are required.' }, { status: 400 })
  try {
    const out = await runAction({ ...body, kind: body.kind, platform: body.platform, campaign_id: body.campaign_id, source: req.headers.get('x-studio-client') === 'ios' ? 'ios' : 'web' })
    return NextResponse.json({ ok: true, ...out })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
}
