// ─── Ad insights: running an action ──────────────────────────────────────────
//
// SERVER ONLY. The buttons on the "This week" card (FEAT-CLA-023): pause /
// resume, raise / lower the daily budget by 25%, duplicate a winning views
// boost as a paused Traffic campaign. Everything goes through the existing
// Meta / TikTok code paths (src/lib/ads/meta.ts, src/lib/ads/tiktok.ts);
// nothing runs without Brian pressing the button and confirming. TikTok
// writes answer 40001 until the Ads Management scope is approved — the error
// is returned in words, never swallowed.

import { tiktokAdvertiserId, tiktokCall } from '@/lib/analytics/tiktok'
import { LIMITS, getPromotion, metaCampaignInfo, metaGet, metaPost, promote, setPromotionStatus, type Promotion } from './meta'
import { TT_LIMITS, promoteTikTok, setCampaignStatus, setTikTokPromotionStatus } from './tiktok'
import { rest } from '@/lib/publish/store'
import type { ActionKind } from './insights'

export type ActionRequest = {
  kind: ActionKind
  platform: 'tiktok' | 'meta'
  campaign_id: string
  app_id?: string | null
  promotion_id?: string
  /** For raise / lower: the new daily budget in cents (the card proposes ±25%). */
  amount_cents?: number
  source?: string
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

/** Runs one action; resolves to a one-line result for the UI, rejects with a plain-words reason. */
export async function runAction(r: ActionRequest): Promise<string> {
  const promo = await promotionFor(r)
  const advertiserId = r.platform === 'tiktok' ? tiktokAdvertiserId(r.app_id ?? promo?.app_id ?? '') : undefined
  try {
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
        return action === 'pause' ? 'Paused. Resume it here or in Ads Manager.' : 'Resumed.'
      }
      case 'raise_budget':
      case 'lower_budget': {
        if (r.platform === 'meta') {
          const info = (await metaCampaignInfo()).get(r.campaign_id)
          const current = info?.daily_budget_cents
          if (current) {
            const next = clamp(r.amount_cents ?? Math.round(current * (r.kind === 'raise_budget' ? 1.25 : 0.8)), LIMITS.minDailyCents, LIMITS.maxDailyCents)
            await metaPost(r.campaign_id, { daily_budget: String(next) })
            return `Daily budget ${usd(current)} → ${usd(next)}.`
          }
          // Budget lives on the ad sets.
          const sets = (await metaGet(`${r.campaign_id}/adsets`, { fields: 'id,name,daily_budget', limit: '50' })).data as { id: string; name: string; daily_budget?: string }[]
          const withBudget = sets.filter((s) => s.daily_budget)
          if (!withBudget.length) throw new Error('This campaign has no daily budget to change (lifetime budget?). Change it in Ads Manager.')
          const changes: string[] = []
          for (const s of withBudget) {
            const cur = Number(s.daily_budget)
            const next = clamp(Math.round(cur * (r.kind === 'raise_budget' ? 1.25 : 0.8)), LIMITS.minDailyCents, LIMITS.maxDailyCents)
            await metaPost(s.id, { daily_budget: String(next) })
            changes.push(`${s.name}: ${usd(cur)} → ${usd(next)}`)
          }
          return `Ad set budget${changes.length > 1 ? 's' : ''} ${changes.join('; ')}.`
        }
        if (!advertiserId) throw new Error('No TikTok ad account id for this app.')
        // TikTok: campaign-level budget first (how Studio and Brian set it), else the ad groups.
        const camp = await tiktokCall('/campaign/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [r.campaign_id] }), fields: JSON.stringify(['campaign_id', 'budget', 'budget_mode']) } })
        const c = camp.list?.[0]
        const factor = r.kind === 'raise_budget' ? 1.25 : 0.8
        if (c?.budget_mode === 'BUDGET_MODE_DAY' && Number(c.budget) > 0) {
          const cur = Math.round(Number(c.budget) * 100)
          const next = clamp(r.amount_cents ?? Math.round(cur * factor), TT_LIMITS.minDailyCents, TT_LIMITS.maxDailyCents)
          await tiktokCall('/campaign/budget/update/', { method: 'POST', body: { advertiser_id: advertiserId, campaign_id: r.campaign_id, budget: next / 100 } })
          return `Daily budget ${usd(cur)} → ${usd(next)}.`
        }
        const groups = await tiktokCall('/adgroup/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [r.campaign_id] }), fields: JSON.stringify(['adgroup_id', 'adgroup_name', 'budget', 'budget_mode']) } })
        const daily = (groups.list ?? []).filter((g: any) => g.budget_mode === 'BUDGET_MODE_DAY' && Number(g.budget) > 0)
        if (!daily.length) throw new Error('No daily budget found on this campaign or its ad groups. Change it in Ads Manager.')
        const changes: string[] = []
        for (const g of daily) {
          const cur = Math.round(Number(g.budget) * 100)
          const next = clamp(Math.round(cur * factor), TT_LIMITS.minDailyCents, TT_LIMITS.maxDailyCents)
          await tiktokCall('/adgroup/budget/update/', { method: 'POST', body: { advertiser_id: advertiserId, adgroup_id: g.adgroup_id, budget: next / 100, budget_mode: 'BUDGET_MODE_DAY' } })
          changes.push(`${g.adgroup_name}: ${usd(cur)} → ${usd(next)}`)
        }
        return `Ad group budget${changes.length > 1 ? 's' : ''} ${changes.join('; ')}.`
      }
      case 'duplicate_traffic': {
        if (!promo) throw new Error('Only a Studio boost can be duplicated here (it needs the post and audience). Duplicate it in Ads Manager instead.')
        const now = new Date(), end = new Date(now.getTime() + 7 * 86400000)
        if (r.platform === 'meta') {
          const p = await promote({ appId: promo.app_id, postId: promo.post_id, platform: promo.platform as 'facebook' | 'instagram', remoteId: promo.remote_id, permalink: promo.permalink,
            goal: 'downloads', dailyBudgetCents: promo.daily_budget_cents, startAt: now.toISOString(), endAt: end.toISOString(), audience: promo.audience, source: r.source ?? 'insights' })
          await setPromotionStatus(p.id, 'pause').catch(() => undefined)
          return `Created a paused Traffic boost (${usd(promo.daily_budget_cents)}/day, 7 days). Resume it from Post → Boosts.`
        }
        const p = await promoteTikTok({ appId: promo.app_id, postId: promo.post_id, itemId: promo.remote_id, permalink: promo.permalink, goal: 'downloads',
          dailyBudgetCents: Math.max(promo.daily_budget_cents, TT_LIMITS.minDailyCents), startAt: now.toISOString(), endAt: end.toISOString(),
          audience: promo.audience as unknown as Parameters<typeof promoteTikTok>[0]['audience'], paused: true, source: r.source ?? 'insights' })
        if (p.status === 'failed') throw new Error(p.error ?? 'TikTok refused the campaign.')
        return `Created a paused Traffic boost (${usd(Math.max(promo.daily_budget_cents, TT_LIMITS.minDailyCents))}/day, 7 days). Resume it from Post → Boosts.`
      }
      default:
        throw new Error('That action is advice, not a button.')
    }
  } catch (e) { throw new Error(scopeHint(e)) }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
