// ─── Ad insights: running an action ──────────────────────────────────────────
//
// SERVER ONLY. The buttons on the "This week" card (FEAT-CLA-023): pause /
// resume, delete a campaign that never delivered, raise / lower the daily budget by 25%, duplicate a views campaign
// as Traffic with a Download button (TikTok: duplicateTikTokAsTraffic; Meta
// Studio boosts: the existing promote() flow with goal downloads). Everything
// goes through the existing Meta / TikTok code paths; nothing runs without
// Brian pressing the button and confirming. Every run is logged in
// studio_ad_actions (status done / failed / dry_run) so the card can say
// "Done <date>". TikTok writes answer 40001 until the Ads Management scope
// is approved — the error comes back in words, never swallowed.

import { tiktokAdvertiserId, tiktokCall } from '@/lib/analytics/tiktok'
import { LIMITS, getPromotion, metaCampaignInfo, metaGet, metaPost, promote, setPromotionStatus, type Promotion } from './meta'
import { TT_LIMITS, campaignToken, duplicateTikTokAsTraffic, setCampaignStatus, setTikTokPromotionStatus } from './tiktok'
import { getPost, insertPost, rest } from '@/lib/publish/store'
import { captionsConfigured, writeCaptions } from '@/lib/publish/captions'
import { bestSlots, heatFor } from '@/lib/publish/timing'
import { defaultFormat, validate, type Platform, type Target } from '@/lib/publish/rules'
import type { ActionKind } from './insights'

export type ActionRequest = {
  kind: ActionKind
  platform: 'tiktok' | 'meta'
  campaign_id: string
  app_id?: string | null
  promotion_id?: string
  /** For raise / lower: the new daily budget in cents (the card proposes ±25%). */
  amount_cents?: number
  /** For duplicate_as_traffic: the confirm sheet. */
  options?: { budget_cents?: number; pause_original?: boolean; dry_run?: boolean }
  /** Ids the card carried (logged as source_ids). */
  source_ids?: Record<string, unknown>
  source?: string
}
export type ActionResult = { message: string; result_ids?: Record<string, unknown>; dry_run?: boolean; payloads?: Record<string, unknown>; notes?: string[] }

export type ActionLog = {
  id: string; created_at: string; app: string | null; platform: string; action_type: string; campaign_id: string | null
  source_ids: Record<string, unknown> | null; result_ids: Record<string, unknown> | null; status: 'done' | 'failed' | 'dry_run'; error: string | null
}

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
const scopeHint = (e: unknown) => {
  const m = (e as Error).message ?? String(e)
  return /code 40001/.test(m) ? `${m} — TikTok hasn’t approved the Ads Management scope yet (requested 2026-10-27); do this in Ads Manager for now.` : m
}

async function promotionFor(r: ActionRequest): Promise<Promotion | null> {
  if (r.promotion_id) return getPromotion(r.promotion_id)
  return (await rest<Promotion[]>(`studio_promotions?network=eq.${r.platform}&campaign_id=eq.${encodeURIComponent(r.campaign_id)}&limit=1`).catch(() => []))[0] ?? null
}

/** Writes the run to studio_ad_actions; a missing table never fails the action. */
async function logAction(r: ActionRequest, status: ActionLog['status'], result?: ActionResult, error?: string) {
  await rest('studio_ad_actions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    app: r.app_id ?? null, platform: r.platform, action_type: r.kind, campaign_id: r.campaign_id,
    source_ids: { ...(r.source_ids ?? {}), promotion_id: r.promotion_id, options: r.options, amount_cents: r.amount_cents },
    result_ids: result?.result_ids ?? (result?.payloads ? { payloads: result.payloads } : null), status, error: error ?? null, source: r.source ?? 'web',
  }) }).catch((e) => console.warn('[actions] log failed:', (e as Error).message))
}

/** Recent completed actions, keyed "platform:campaign_id:kind" → the latest. */
export async function recentActions(days = 30): Promise<Map<string, ActionLog>> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = await rest<ActionLog[]>(`studio_ad_actions?status=eq.done&created_at=gte.${since}&order=created_at.desc&limit=200`).catch(() => [])
  const out = new Map<string, ActionLog>()
  for (const row of rows) { const k = `${row.platform}:${row.campaign_id}:${row.action_type}`; if (!out.has(k)) out.set(k, row) }
  return out
}

/** Runs one action; resolves to a result for the UI, rejects with a plain-words reason. */
export async function runAction(r: ActionRequest): Promise<ActionResult> {
  try {
    const out = await execute(r)
    await logAction(r, out.dry_run ? 'dry_run' : 'done', out)
    return out
  } catch (e) {
    const msg = scopeHint(e)
    await logAction(r, 'failed', undefined, msg)
    throw new Error(msg)
  }
}

async function execute(r: ActionRequest): Promise<ActionResult> {
  const promo = await promotionFor(r)
  const advertiserId = r.platform === 'tiktok' ? tiktokAdvertiserId(r.app_id ?? promo?.app_id ?? '') : undefined
  switch (r.kind) {
    case 'pause':
    case 'resume': {
      const action = r.kind
      if (promo) {
        await (r.platform === 'meta' ? setPromotionStatus(promo.id, action) : setTikTokPromotionStatus(promo.id, action))
      } else if (r.platform === 'meta') {
        await metaPost(r.campaign_id, { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' })
      } else {
        if (!advertiserId) throw new Error('No TikTok ad account id for this app.')
        await setCampaignStatus(advertiserId, r.campaign_id, action === 'pause' ? 'DISABLE' : 'ENABLE')
      }
      return { message: action === 'pause' ? 'Paused. Resume it here or in Ads Manager.' : 'Resumed.', result_ids: { campaign_id: r.campaign_id, status: action === 'pause' ? 'paused' : 'active' } }
    }
    case 'raise_budget':
    case 'lower_budget': {
      const factor = r.kind === 'raise_budget' ? 1.25 : 0.8
      if (r.platform === 'meta') {
        const info = (await metaCampaignInfo()).get(r.campaign_id)
        const current = info?.daily_budget_cents
        if (current) {
          const next = clamp(r.amount_cents ?? Math.round(current * factor), LIMITS.minDailyCents, LIMITS.maxDailyCents)
          await metaPost(r.campaign_id, { daily_budget: String(next) })
          return { message: `Daily budget ${usd(current)} → ${usd(next)}.`, result_ids: { campaign_id: r.campaign_id, daily_budget_cents: next } }
        }
        const sets = (await metaGet(`${r.campaign_id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data as { id: string; name: string; daily_budget?: string }[]
        const withBudget = sets.filter((s) => s.daily_budget)
        if (!withBudget.length) throw new Error('This campaign has no daily budget to change (lifetime budget?). Change it in Ads Manager.')
        const changes: string[] = []; const ids: Record<string, number> = {}
        for (const s of withBudget) {
          const cur = Number(s.daily_budget)
          const next = clamp(Math.round(cur * factor), LIMITS.minDailyCents, LIMITS.maxDailyCents)
          await metaPost(s.id, { daily_budget: String(next) })
          changes.push(`${s.name}: ${usd(cur)} → ${usd(next)}`); ids[s.id] = next
        }
        return { message: `Ad set budget${changes.length > 1 ? 's' : ''} ${changes.join('; ')}.`, result_ids: { adsets: ids } }
      }
      if (!advertiserId) throw new Error('No TikTok ad account id for this app.')
      const camp = await tiktokCall('/campaign/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [r.campaign_id] }), fields: JSON.stringify(['campaign_id', 'budget', 'budget_mode']) } })
      const c = camp.list?.[0]
      if (c?.budget_mode === 'BUDGET_MODE_DAY' && Number(c.budget) > 0) {
        const cur = Math.round(Number(c.budget) * 100)
        const next = clamp(r.amount_cents ?? Math.round(cur * factor), TT_LIMITS.minDailyCents, TT_LIMITS.maxDailyCents)
        await tiktokCall('/campaign/budget/update/', { method: 'POST', body: { advertiser_id: advertiserId, campaign_id: r.campaign_id, budget: next / 100 } })
        return { message: `Daily budget ${usd(cur)} → ${usd(next)}.`, result_ids: { campaign_id: r.campaign_id, daily_budget_cents: next } }
      }
      const groups = await tiktokCall('/adgroup/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [r.campaign_id] }), fields: JSON.stringify(['adgroup_id', 'adgroup_name', 'budget', 'budget_mode']) } })
      const daily = (groups.list ?? []).filter((g: any) => g.budget_mode === 'BUDGET_MODE_DAY' && Number(g.budget) > 0)
      if (!daily.length) throw new Error('No daily budget found on this campaign or its ad groups. Change it in Ads Manager.')
      const changes: string[] = []; const ids: Record<string, number> = {}
      for (const g of daily) {
        const cur = Math.round(Number(g.budget) * 100)
        const next = clamp(Math.round(cur * factor), TT_LIMITS.minDailyCents, TT_LIMITS.maxDailyCents)
        await tiktokCall('/adgroup/budget/update/', { method: 'POST', body: { advertiser_id: advertiserId, adgroup_id: g.adgroup_id, budget: next / 100, budget_mode: 'BUDGET_MODE_DAY' } })
        changes.push(`${g.adgroup_name}: ${usd(cur)} → ${usd(next)}`); ids[g.adgroup_id] = next
      }
      return { message: `Ad group budget${changes.length > 1 ? 's' : ''} ${changes.join('; ')}.`, result_ids: { adgroups: ids } }
    }
    case 'duplicate_as_traffic': {
      const budget = clamp(r.options?.budget_cents ?? 2000, TT_LIMITS.minDailyCents, TT_LIMITS.maxDailyCents)
      const pauseOriginal = r.options?.pause_original !== false
      if (r.platform === 'tiktok') {
        const app = r.app_id ?? promo?.app_id
        if (!app) throw new Error('Which app is this campaign for?')
        const out = await duplicateTikTokAsTraffic({ appId: app, campaignId: r.campaign_id, dailyBudgetCents: budget, pauseOriginal, dryRun: !!r.options?.dry_run, source: r.source })
        if (out.dry_run) return { message: 'Dry run — payloads built, nothing created.', dry_run: true, payloads: out.payloads, notes: out.notes }
        return { message: `Created the Traffic campaign at ${usd(budget)}/day with a Download button${pauseOriginal ? ' and paused the original' : ''}. It shows in Post → Boosts.`, result_ids: out.result_ids, payloads: out.payloads, notes: out.notes }
      }
      if (!promo) throw new Error('Only a Studio boost can be duplicated here (it needs the post and audience). Duplicate it in Ads Manager instead.')
      if (r.options?.dry_run) {
        const payload = { appId: promo.app_id, postId: promo.post_id, platform: promo.platform, remoteId: promo.remote_id, goal: 'downloads', dailyBudgetCents: budget, ctToken: campaignToken(promo.app_id, 'downloads').replace(/^tt-/, 'meta-'), audience: promo.audience, pause_original: pauseOriginal }
        return { message: 'Dry run — payload built, nothing created.', dry_run: true, payloads: { promote: payload } }
      }
      const now = new Date(), end = new Date(now.getTime() + 7 * 86400000)
      const p = await promote({ appId: promo.app_id, postId: promo.post_id, platform: promo.platform as 'facebook' | 'instagram', remoteId: promo.remote_id, permalink: promo.permalink,
        goal: 'downloads', dailyBudgetCents: budget, startAt: now.toISOString(), endAt: end.toISOString(), audience: promo.audience, source: r.source ?? 'insights-duplicate',
        ctToken: campaignToken(promo.app_id, 'downloads', now).replace(/^tt-/, 'meta-') })
      if (pauseOriginal) await setPromotionStatus(promo.id, 'pause').catch(() => undefined)
      return { message: `Created the Traffic boost at ${usd(budget)}/day with a Download button${pauseOriginal ? ' and paused the original' : ''}. It shows in Post → Boosts.`, result_ids: { campaign_id: p.campaign_id, adset_id: p.adset_id, ad_id: p.ad_id, promotion_id: p.id } }
    }
    case 'delete_campaign': {
      // Only offered for campaigns that never delivered (zero impressions for
      // DEAD_DAYS+), so nothing of value goes with it. Both platforms keep the
      // spend history of deleted campaigns in their reports.
      if (r.platform === 'meta') {
        await metaPost(r.campaign_id, { status: 'DELETED' })
      } else {
        if (!advertiserId) throw new Error('No TikTok ad account id for this app.')
        await tiktokCall('/campaign/status/update/', { method: 'POST', body: { advertiser_id: advertiserId, campaign_ids: [r.campaign_id], operation_status: 'DELETE' } })
      }
      return { message: 'Deleted. It can’t switch back on now.', result_ids: { campaign_id: r.campaign_id, status: 'deleted' } }
    }
    case 'reuse_angle':
      return scheduleRepost(r, promo)
    default:
      throw new Error('That action is a link, not a button.')
  }
}

// ── Reuse a winning ad organically (2026-11-22) ──────────────────────────────
//
// The ad's own Studio post (same video, same app) goes back out as an organic
// post on the Meta surfaces it hasn't been on yet (Instagram, Facebook), with a
// fresh Claude caption, at the next best hour for that app. It is *scheduled*,
// never published on the spot: it sits in Post → Queue where it can be edited or
// canceled. TikTok is left out on purpose — the original is already a TikTok
// post when the ad was a Spark ad, and TikTok posts need per-post privacy
// settings Brian picks in the composer.
const REPOST_ON: Platform[] = ['instagram', 'facebook']

async function scheduleRepost(r: ActionRequest, promo: Promotion | null): Promise<ActionResult> {
  const postId = (typeof r.source_ids?.post_id === 'string' ? r.source_ids.post_id : undefined) ?? promo?.post_id
  if (!postId) throw new Error('This ad wasn’t made in Studio, so there’s no file to repost. Use Open in Post and pick the video.')
  const src = await getPost(postId).catch(() => null)
  if (!src?.media?.length) throw new Error('The original post’s video isn’t on file any more. Use Open in Post and pick the video.')
  const appId = r.app_id ?? promo?.app_id ?? src.app_id
  const already = new Set(src.targets.filter((t) => t.status === 'published').map((t) => t.platform))
  const platforms = REPOST_ON.filter((p) => !already.has(p))
  if (!platforms.length) throw new Error('It’s already on Instagram and Facebook. Post it to TikTok from Post if you want it there too.')
  const targets: Target[] = platforms.map((p) => ({ platform: p, format: defaultFormat(p, src.media) }))

  const notes = 'Organic repost of an ad that earned attention. No spend. Write it as a native post, not an ad.'
  let caption = src.caption, overrides: Partial<Record<Platform, string>> = {}, captionBy: 'brian' | 'ai' = 'brian'
  if (captionsConfigured()) {
    try {
      const out = await writeCaptions({ appId, targets, media: src.media, frames: src.media.filter((m) => m.kind === 'image').map((m) => m.url).slice(0, 4), notes, draft: src.caption, avoid: [src.caption].filter(Boolean) })
      caption = out.caption; overrides = out.overrides; captionBy = 'ai'
    } catch { /* fall back to the original caption */ }
  }
  const problems = validate(targets, src.media, caption, overrides).filter((i) => i.level === 'error')
  if (problems.length) throw new Error(`Can’t schedule it as is: ${problems.map((p) => p.text).join(' ')} Use Open in Post.`)

  const tz = 'America/Chicago'
  const heat = await heatFor(appId, platforms, tz).catch(() => null)
  const at = (heat ? bestSlots(heat.heat, new Date(Date.now() + 2 * 3600_000), 1, tz, 12)[0] : undefined)
    ?? new Date(Date.now() + 24 * 3600_000)
  if (r.options?.dry_run) return { message: 'Dry run — nothing scheduled.', dry_run: true, payloads: { targets, caption, at: at.toISOString() } }

  const post = await insertPost({
    app_id: appId, caption, overrides, media: src.media,
    ...(src.media_overrides && Object.keys(src.media_overrides).length ? { media_overrides: src.media_overrides } : {}),
    targets: targets.map((t) => ({ ...t, status: 'pending' as const })),
    status: 'scheduled', scheduled_at: at.toISOString(), source: r.source === 'ios' ? 'studio-ios' : 'insights-repost', notes, caption_by: captionBy,
    ...(src.market ? { market: src.market } : {}),
  })
  const when = at.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const where = platforms.map((p) => p === 'instagram' ? 'Instagram' : 'Facebook').join(' + ')
  return { message: `Scheduled on ${where} for ${when} CT${captionBy === 'ai' ? ' with a fresh caption' : ''}. Edit or cancel it in Post → Queue.`, result_ids: { post_id: post?.id, scheduled_at: at.toISOString(), platforms } }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
