// ─── Ad insights: tying actions to the world ─────────────────────────────────
//
// SERVER ONLY. "Done <date>" from studio_ad_actions, the Ads Manager link
// while TikTok's scope is pending, /post prefilled for reuse_angle. Used by
// /api/ads/insights and the Console. Never throws.

import { recentActions } from './actions'
import { tiktokAdvertiserId, tiktokManagementScope } from '@/lib/analytics/tiktok'
import { adGroupManagerUrl, adsManagerUrl } from './tiktok'
import { getPost } from '@/lib/publish/store'
import type { Action } from './insights'
import type { Promotion } from './meta'

/** Ties each action to the world: "Done <date>" from the log, the Ads
 *  Manager link while TikTok's scope is pending, /post prefilled for
 *  reuse_angle. Never throws. */
export async function enrichActions(actions: Action[], promotions: Pick<Promotion, 'campaign_id' | 'network' | 'post_id' | 'remote_id'>[]): Promise<Action[]> {
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
    if (adv) {
      out.advertiser_id = adv; out.manager_url = adsManagerUrl(adv, a.campaign_id)
      // Widen audience edits the ad group's targeting: link straight to that level.
      if (a.kind === 'widen_audience') { out.manager_url = adGroupManagerUrl(adv, a.campaign_id); out.href = out.manager_url }
    }
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

