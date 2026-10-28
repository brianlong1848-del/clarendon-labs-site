// ─── TikTok ads: boost a post as a Spark Ad, read results, pause / stop ──────
//
// SERVER ONLY. The TikTok twin of ./meta.ts (FEAT-CLA-018), built from the
// Spark Ad playbook in the vault (FEAT-CLA-021). Every app has its own ad
// account in the Clarendon Labs LLC Business Center, so a boost is created on
// THAT account: campaign → ad group (budget, dates, audience) → one Spark Ad
// whose creative is the post the app's TikTok account already published, so
// likes and comments stay on the original and the post keeps its handle.
//
// Env: TIKTOK_ACCESS_TOKEN (advertiser token from the "Clarendon Labs
// Analytics" developer app, authorized for all five ad accounts),
// <APP>_TIKTOK_ADVERTISER_ID per app, TIKTOK_BC_ID (the Business Center that
// owns the TikTok accounts — the Spark Ad identity is BC-authorized).
// Optional: <APP>_TIKTOK_IDENTITY_ID when the handle can't be matched by name,
// and the same spend caps as Meta (META_MAX_DAILY_USD / META_MAX_TOTAL_USD).
//
// Guardrails: TikTok's own $20/day floor, the shared daily + total caps,
// 18+ everywhere, Jinglewire = parents only (25+) with no interest or
// behaviour targeting at all; the card on file is TikTok's, never ours.
// Brian's rule (vault FEAT-CLA-021): never the TikTok app's Promote button —
// this is the only paid path, so every dollar shows in Ads Manager and Money.

import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { rest } from '@/lib/publish/store'
import { handleFits } from '@/lib/publish/ownership'
import { tiktokAdvertiserId, tiktokCall, tiktokReport, tiktokStatusWord, tiktokToken, tiktokReviewInfo } from '@/lib/analytics/tiktok'
import { LIMITS as META_LIMITS, KID_APPS, type Promotion } from './meta'
import { STORE_APPS } from './store'

export const bcId = () => process.env.TIKTOK_BC_ID || ''

export const TT_LIMITS = {
  /** TikTok refuses ad groups under $20 a day. */
  minDailyCents: 2000,
  maxDailyCents: Math.max(META_LIMITS.maxDailyCents, 2000),
  maxTotalCents: META_LIMITS.maxTotalCents,
  minAge: 18,
}

export const APP_CODE: Record<string, string> = { rolligan: 'ROL', gagorder: 'GAG', yulepick: 'YUL', borea: 'BOR', jinglewire: 'JIN' }

// ── Audience ─────────────────────────────────────────────────────────────────

export const AGE_GROUPS = ['AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100'] as const
export type AgeGroup = typeof AGE_GROUPS[number]
export const AGE_LABEL: Record<AgeGroup, string> = { AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_54: '45–54', AGE_55_100: '55+' }

export type TTLocation = { id: string; name: string; level: string; parent?: string }
export type TTInterest = { id: string; name: string; kind: 'category' | 'keyword' }
export type TTHashtag = { id: string; name: string }
export type TikTokAudience = {
  ageGroups: AgeGroup[]
  gender: 'all' | 'men' | 'women'
  locations: TTLocation[]
  interests: TTInterest[]
  /** Hashtag interactions (people who watched / liked / commented / shared videos with these tags). */
  hashtags: TTHashtag[]
}
export const US: TTLocation = { id: '6252001', name: 'United States', level: 'COUNTRY' }
export const DEFAULT_TT_AUDIENCE: TikTokAudience = { ageGroups: ['AGE_18_24', 'AGE_25_34', 'AGE_35_44'], gender: 'all', locations: [US], interests: [], hashtags: [] }

/** Minimum age implied by the age groups (AGE_25_34 → 25). */
export const minAgeOf = (groups: AgeGroup[]) => Math.min(...groups.map((g) => Number(g.split('_')[1]) || 99), 99)

export function checkTikTokAudience(appId: string, a: TikTokAudience): string[] {
  const out: string[] = []
  if (!a.ageGroups.length) out.push('Pick at least one age group.')
  if (a.ageGroups.some((g) => !AGE_GROUPS.includes(g))) out.push('Ads from the studio target 18+ only.')
  if (!a.locations.length) out.push('Pick at least one location.')
  if (KID_APPS.has(appId)) {
    if (minAgeOf(a.ageGroups) < 25) out.push('Jinglewire ads go to parents only — 25 and older.')
    if (a.interests.length || a.hashtags.length) out.push('Jinglewire ads use no interest or behaviour targeting.')
  }
  return out
}

// ── Readiness ────────────────────────────────────────────────────────────────

export type TikTokAdsStatus = {
  ready: boolean
  reasons: string[]
  account?: { id: string; name: string; status: string; currency: string; timezone: string }
  identity?: { id: string; name: string }
  limits: typeof TT_LIMITS
}

const identityCache = new Map<string, { at: number; list: { identity_id: string; display_name: string; identity_type: string; identity_authorized_bc_id?: string }[] }>()

/** Identities (TikTok accounts) this ad account may run Spark Ads as, via the BC. */
async function identities(advertiserId: string) {
  const c = identityCache.get(advertiserId)
  if (c && Date.now() - c.at < 10 * 60_000) return c.list
  const list: { identity_id: string; display_name: string; identity_type: string; identity_authorized_bc_id?: string }[] = []
  for (const type of ['BC_AUTH_TT', 'TT_USER']) {
    try {
      const data = await tiktokCall('/identity/get/', { query: { advertiser_id: advertiserId, identity_type: type, ...(type === 'BC_AUTH_TT' && bcId() ? { identity_authorized_bc_id: bcId() } : {}), page_size: '50' } })
      for (const i of data.identity_list ?? data.list ?? []) list.push({ identity_id: String(i.identity_id), display_name: String(i.display_name ?? i.username ?? ''), identity_type: type, identity_authorized_bc_id: type === 'BC_AUTH_TT' ? bcId() : undefined })
    } catch { /* that type may just be empty */ }
  }
  identityCache.set(advertiserId, { at: Date.now(), list })
  return list
}

/** The app's own TikTok handle as an identity (env override, else the one whose name contains the app id). */
export async function identityFor(appId: string, advertiserId: string) {
  const list = await identities(advertiserId)
  const wanted = process.env[`${appId.toUpperCase()}_TIKTOK_IDENTITY_ID`]
  const hit = (wanted && list.find((i) => i.identity_id === wanted)) || list.find((i) => i.identity_type === 'BC_AUTH_TT' && handleFits(appId, i.display_name) && i.display_name) || list.find((i) => handleFits(appId, i.display_name) && i.display_name)
  return hit
}

export async function tiktokAdsStatus(appId: string): Promise<TikTokAdsStatus> {
  const reasons: string[] = []
  if (!tiktokToken()) return { ready: false, reasons: ['TIKTOK_ACCESS_TOKEN isn’t set on this deployment — authorize the Clarendon Labs Analytics app for the ad accounts and save the token in Vercel.'], limits: TT_LIMITS }
  const advertiserId = tiktokAdvertiserId(appId)
  if (!advertiserId) return { ready: false, reasons: [`${PUBLISH_APPS.find((a) => a.id === appId)?.name ?? appId} has no TikTok ad account id set (${appId.toUpperCase()}_TIKTOK_ADVERTISER_ID).`], limits: TT_LIMITS }
  if (!bcId()) reasons.push('TIKTOK_BC_ID (the Clarendon Labs LLC Business Center) isn’t set, so Spark Ads can’t use the app’s TikTok account.')
  let account: TikTokAdsStatus['account']
  try {
    const data = await tiktokCall('/advertiser/info/', { query: { advertiser_ids: JSON.stringify([advertiserId]), fields: JSON.stringify(['advertiser_id', 'name', 'status', 'currency', 'timezone']) } })
    const a = data.list?.[0]
    if (!a) reasons.push('The token can’t see this ad account — authorize the Clarendon Labs Analytics app for it in the Business Center.')
    else {
      account = { id: advertiserId, name: a.name, status: String(a.status ?? '').replace('STATUS_', '').toLowerCase().replace(/_/g, ' '), currency: a.currency, timezone: a.timezone }
      if (a.status !== 'STATUS_ENABLE') reasons.push(`The ad account is ${account.status}. Open it in Ads Manager to fix billing or verification.`)
    }
  } catch (e) { reasons.push(`TikTok: ${(e as Error).message}`) }
  let identity: TikTokAdsStatus['identity']
  if (!reasons.length) {
    const i = await identityFor(appId, advertiserId).catch(() => undefined)
    if (i) identity = { id: i.identity_id, name: i.display_name }
    else reasons.push(`${PUBLISH_APPS.find((a) => a.id === appId)?.name ?? appId}’s TikTok account isn’t linked to this ad account for Spark Ads — in the Business Center, add the handle under TikTok accounts and give the ad account access.`)
  }
  return { ready: reasons.length === 0, reasons, account, identity, limits: TT_LIMITS }
}

// ── Targeting search ─────────────────────────────────────────────────────────

const regionCache = new Map<string, { at: number; list: TTLocation[] }>()

export async function searchLocations(advertiserId: string, q: string): Promise<TTLocation[]> {
  let c = regionCache.get(advertiserId)
  if (!c || Date.now() - c.at > 3600_000) {
    const data = await tiktokCall('/tool/region/', { query: { advertiser_id: advertiserId, placements: JSON.stringify(['PLACEMENT_TIKTOK']), objective_type: 'TRAFFIC' }, timeout: 25000 })
    const raw: { location_id: string; name: string; level: string; parent_id?: string }[] = data.region_info ?? data.list ?? []
    const byId = new Map(raw.map((r) => [String(r.location_id), r]))
    const chain = (r: { parent_id?: string }) => {
      const names: string[] = []
      let p = r.parent_id ? byId.get(String(r.parent_id)) : undefined
      while (p && names.length < 3) { names.push(p.name); p = p.parent_id ? byId.get(String(p.parent_id)) : undefined }
      return names.join(', ')
    }
    c = { at: Date.now(), list: raw.map((r) => ({ id: String(r.location_id), name: r.name, level: r.level, parent: chain(r) || undefined })) }
    regionCache.set(advertiserId, c)
  }
  const needle = q.trim().toLowerCase()
  const rank = (l: TTLocation) => (l.name.toLowerCase() === needle ? 0 : l.name.toLowerCase().startsWith(needle) ? 1 : 2) * 10 + (l.level === 'COUNTRY' ? 0 : l.level === 'PROVINCE' ? 1 : 2)
  return c.list.filter((l) => l.name.toLowerCase().includes(needle)).sort((a, b) => rank(a) - rank(b)).slice(0, 15)
}

type Cat = { interest_category_id?: string; interest_category?: string; interest_category_name?: string; name?: string; level?: number; sub_categories?: Cat[]; children?: Cat[] }
const interestCache = new Map<string, { at: number; list: TTInterest[] }>()

export async function searchInterests(advertiserId: string, q: string): Promise<TTInterest[]> {
  let c = interestCache.get(advertiserId)
  if (!c || Date.now() - c.at > 3600_000) {
    const data = await tiktokCall('/tool/interest_category/', { query: { advertiser_id: advertiserId, placements: JSON.stringify(['PLACEMENT_TIKTOK']) } })
    const flat: TTInterest[] = []
    const walk = (cats: Cat[]) => { for (const cat of cats) {
      const id = cat.interest_category_id, name = cat.interest_category_name ?? cat.interest_category ?? cat.name
      if (id && name) flat.push({ id: String(id), name: String(name), kind: 'category' })
      walk(cat.sub_categories ?? cat.children ?? [])
    } }
    walk(data.interest_categories ?? data.list ?? [])
    c = { at: Date.now(), list: flat }
    interestCache.set(advertiserId, c)
  }
  const needle = q.trim().toLowerCase()
  const cats = c.list.filter((i) => i.name.toLowerCase().includes(needle)).slice(0, 8)
  // Interest keywords: finer than categories (e.g. "board games" when the
  // category is just "Games"). Best effort.
  let keywords: TTInterest[] = []
  try {
    const data = await tiktokCall('/tool/interest_keyword/recommend/', { query: { advertiser_id: advertiserId, keywords: JSON.stringify([q.trim()]), language: 'en' } })
    keywords = (data.recommended_keywords ?? data.interest_keyword_list ?? data.list ?? []).filter((k: any) => !k.status || k.status === 'EFFECTIVE').slice(0, 8)
      .map((k: any) => ({ id: String(k.keyword_id ?? k.interest_keyword_id), name: String(k.keyword ?? k.interest_keyword ?? k.name), kind: 'keyword' as const }))
  } catch { /* optional */ }
  return [...cats, ...keywords].filter((i) => i.id && i.name)
}

export async function searchHashtags(advertiserId: string, q: string): Promise<TTHashtag[]> {
  // Answer shape (checked 2026-10-26): { recommend_keywords: [{ keyword: '#sapphic', keyword_id, keyword_status: 'ONLINE' }] }
  const data = await tiktokCall('/tool/hashtag/recommend/', { query: { advertiser_id: advertiserId, keywords: JSON.stringify([q.trim().replace(/^#/, '')]), limit: '15' } })
  return (data.recommend_keywords ?? data.hashtags ?? data.list ?? []).filter((h: any) => !h.keyword_status || h.keyword_status === 'ONLINE')
    .map((h: any) => ({ id: String(h.keyword_id ?? h.hashtag_id ?? h.id), name: String(h.keyword ?? h.hashtag_name ?? h.name ?? '').replace(/^#/, '') })).filter((h: TTHashtag) => h.id && h.name)
}

// ── Posts that can be boosted ────────────────────────────────────────────────

export type TikTokVideo = { item_id: string; text?: string; cover?: string; created?: string; url?: string }

/** Videos on the app's TikTok account (posted from anywhere, including the
 *  phone), through the Spark Ad identity. */
export async function accountVideos(appId: string): Promise<TikTokVideo[]> {
  const advertiserId = tiktokAdvertiserId(appId)
  if (!advertiserId) return []
  const identity = await identityFor(appId, advertiserId)
  if (!identity) return []
  const handle = identity.display_name.replace(/^@/, '')
  try {
    const data = await tiktokCall('/identity/video/get/', { query: {
      advertiser_id: advertiserId, identity_type: identity.identity_type, identity_id: identity.identity_id,
      ...(identity.identity_authorized_bc_id ? { identity_authorized_bc_id: identity.identity_authorized_bc_id } : {}), page_size: '30',
    } })
    return (data.video_list ?? data.list ?? []).map((v: any) => ({
      item_id: String(v.item_id ?? v.video_id ?? ''), text: v.text ?? v.title ?? v.video_text, cover: v.video_cover_url ?? v.cover_url ?? v.poster_url,
      created: v.create_time ?? v.created_time, url: handle && v.item_id ? `https://www.tiktok.com/@${handle}/video/${v.item_id}` : undefined,
    })).filter((v: TikTokVideo) => v.item_id)
  } catch { return [] }
}

// ── Promotions ───────────────────────────────────────────────────────────────

export type TikTokGoal = 'downloads' | 'views'
export const TT_GOALS: Record<TikTokGoal, { label: string; objective: string; optimization: string; billing: string; word: string }> = {
  downloads: { label: 'Downloads — “Download now” button to the App Store', objective: 'TRAFFIC', optimization: 'CLICK', billing: 'CPC', word: 'Traffic' },
  views: { label: 'Views — people who watch 15 seconds', objective: 'VIDEO_VIEWS', optimization: 'ENGAGED_VIEW_FIFTEEN', billing: 'CPV', word: 'Views' },
}

export type TikTokPromoteInput = {
  appId: string
  postId?: string | null
  /** The TikTok video (item) id of the post. */
  itemId: string
  permalink?: string | null
  goal: TikTokGoal
  dailyBudgetCents: number
  startAt: string
  endAt: string
  audience: TikTokAudience
  /** A short audience name for the campaign title ("US 18-44 sapphic"). */
  audienceName?: string
  /** Create everything switched off; Brian turns it on in Ads Manager or with Resume. */
  paused?: boolean
  source?: string
}

export function checkTikTokPromote(i: TikTokPromoteInput): string[] {
  const out: string[] = []
  if (!PUBLISH_APPS.some((a) => a.id === i.appId)) out.push('Unknown app.')
  if (!/^\d{6,}$/.test(i.itemId ?? '')) out.push('That TikTok post doesn’t have a video id yet (it must be published, not a draft).')
  if (!TT_GOALS[i.goal]) out.push('Pick a goal.')
  if (i.goal === 'downloads' && !STORE_APPS[i.appId]) out.push('This app isn’t on the App Store yet, so it can’t have a Download button.')
  if (!Number.isFinite(i.dailyBudgetCents) || i.dailyBudgetCents < TT_LIMITS.minDailyCents) out.push(`TikTok needs at least $${TT_LIMITS.minDailyCents / 100} a day.`)
  if (i.dailyBudgetCents > TT_LIMITS.maxDailyCents) out.push(`Daily budget is capped at $${TT_LIMITS.maxDailyCents / 100} (META_MAX_DAILY_USD).`)
  const start = Date.parse(i.startAt), end = Date.parse(i.endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) out.push('Pick start and end dates.')
  else {
    if (end - start < 24 * 3600_000) out.push('Run it for at least one day.')
    if (end < Date.now()) out.push('The end date is in the past.')
    const days = Math.ceil((end - Math.max(start, Date.now())) / 864e5)
    if (days * i.dailyBudgetCents > TT_LIMITS.maxTotalCents) out.push(`That’s up to $${((days * i.dailyBudgetCents) / 100).toFixed(0)} in total; the cap per promotion is $${TT_LIMITS.maxTotalCents / 100} (META_MAX_TOTAL_USD).`)
  }
  out.push(...checkTikTokAudience(i.appId, i.audience))
  return out
}

const insertPromotion = async (row: Partial<Promotion>) =>
  (await rest<Promotion[]>('studio_promotions', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]
const updatePromotion = async (id: string, patch: Partial<Promotion>) =>
  (await rest<Promotion[]>(`studio_promotions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  }))[0]
export const listTikTokPromotions = (limit = 60) => rest<Promotion[]>(`studio_promotions?hidden=eq.false&network=eq.tiktok&order=created_at.desc&limit=${limit}`)
export const getPromotion = async (id: string) => (await rest<Promotion[]>(`studio_promotions?id=eq.${encodeURIComponent(id)}`))[0] ?? null

/** TikTok wants "YYYY-MM-DD HH:MM:SS" in UTC. */
const ttTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Apple campaign token for the Download link: tt-<appcode>-<goal>-<mmmdd>. */
export const campaignToken = (appId: string, goal: TikTokGoal, at = new Date()) =>
  `tt-${(APP_CODE[appId] ?? appId).toLowerCase()}-${goal === 'downloads' ? 'traffic' : 'views'}-${MON[at.getUTCMonth()].toLowerCase()}${String(at.getUTCDate()).padStart(2, '0')}`

function targeting(a: TikTokAudience) {
  const actions = a.hashtags.length ? [{
    action_scene: 'HASHTAG_RELATED', action_period: 0, action_category_ids: a.hashtags.map((h) => h.id),
    video_user_actions: ['WATCHED_TO_END', 'LIKED', 'COMMENTED', 'SHARED'],
  }] : undefined
  const cats = a.interests.filter((i) => i.kind === 'category').map((i) => i.id)
  const kws = a.interests.filter((i) => i.kind === 'keyword').map((i) => i.id)
  return {
    location_ids: a.locations.map((l) => l.id),
    age_groups: a.ageGroups,
    gender: a.gender === 'men' ? 'GENDER_MALE' : a.gender === 'women' ? 'GENDER_FEMALE' : 'GENDER_UNLIMITED',
    ...(cats.length ? { interest_category_ids: cats } : {}),
    ...(kws.length ? { interest_keyword_ids: kws } : {}),
    ...(actions ? { actions } : {}),
    smart_interest_behavior_enabled: false,
  }
}

export async function promoteTikTok(i: TikTokPromoteInput): Promise<Promotion> {
  const app = PUBLISH_APPS.find((a) => a.id === i.appId)!
  const advertiserId = tiktokAdvertiserId(i.appId)
  if (!advertiserId) throw new Error(`${app.name} has no TikTok ad account id.`)
  const identity = await identityFor(i.appId, advertiserId)
  if (!identity) throw new Error(`${app.name}’s TikTok account isn’t available to this ad account for Spark Ads.`)
  const goal = TT_GOALS[i.goal]
  const row = await insertPromotion({
    app_id: i.appId, post_id: i.postId ?? null, network: 'tiktok', platform: 'tiktok', remote_id: i.itemId, permalink: i.permalink ?? null,
    goal: i.goal, daily_budget_cents: i.dailyBudgetCents, start_at: new Date(i.startAt).toISOString(), end_at: new Date(i.endAt).toISOString(),
    audience: i.audience as unknown as Promotion['audience'], status: 'creating', source: i.source ?? 'web',
  })
  const now = new Date()
  const code = APP_CODE[i.appId] ?? i.appId.toUpperCase()
  const audienceName = (i.audienceName?.trim() || describeAudience(i.audience)).slice(0, 60)
  const name = `${code} ${goal.word} - ${audienceName} - ${MON[now.getUTCMonth()]} ${now.getUTCFullYear()} (Studio)`
  const budgetUsd = Math.round(i.dailyBudgetCents) / 100
  const status = i.paused ? 'DISABLE' : 'ENABLE'
  const patch: Partial<Promotion> = {}
  try {
    // Campaign-level daily budget as Brian sets it in Ads Manager; if this
    // account insists on TikTok's higher campaign floor, the budget moves to
    // the ad group (same money, same cap).
    let campaignHoldsBudget = true
    let campaign: any
    try {
      campaign = await tiktokCall('/campaign/create/', { method: 'POST', body: {
        advertiser_id: advertiserId, campaign_name: name, objective_type: goal.objective,
        budget_mode: 'BUDGET_MODE_DAY', budget: budgetUsd, operation_status: status,
      } })
    } catch (e) {
      if (!/budget/i.test((e as Error).message)) throw e
      campaignHoldsBudget = false
      campaign = await tiktokCall('/campaign/create/', { method: 'POST', body: {
        advertiser_id: advertiserId, campaign_name: name, objective_type: goal.objective, budget_mode: 'BUDGET_MODE_INFINITE', operation_status: status,
      } })
    }
    patch.campaign_id = String(campaign.campaign_id)
    const start = Math.max(Date.parse(i.startAt), Date.now() + 5 * 60_000)
    const adgroup = await tiktokCall('/adgroup/create/', { method: 'POST', body: {
      advertiser_id: advertiserId, campaign_id: patch.campaign_id, adgroup_name: `${audienceName} - ${goal.word}`,
      placement_type: 'PLACEMENT_TYPE_NORMAL', placements: ['PLACEMENT_TIKTOK'], search_result_enabled: false,
      ...(goal.objective === 'TRAFFIC' ? { promotion_type: 'WEBSITE' } : {}),
      ...targeting(i.audience),
      budget_mode: 'BUDGET_MODE_DAY', budget: budgetUsd,
      schedule_type: 'SCHEDULE_START_END', schedule_start_time: ttTime(start), schedule_end_time: ttTime(Date.parse(i.endAt)),
      optimization_goal: goal.optimization, billing_event: goal.billing, bid_type: 'BID_TYPE_NO_BID', pacing: 'PACING_MODE_SMOOTH',
      creative_material_mode: 'CUSTOM', video_download_disabled: false, comment_disabled: false,
      operation_status: status,
    } })
    patch.adset_id = String(adgroup.adgroup_id)
    const token = campaignToken(i.appId, i.goal, now)
    const ad = await tiktokCall('/ad/create/', { method: 'POST', body: {
      advertiser_id: advertiserId, adgroup_id: patch.adset_id,
      creatives: [{
        ad_name: `${code} Spark - ${audienceName}`.slice(0, 100), ad_format: 'SINGLE_VIDEO',
        identity_type: identity.identity_type, identity_id: identity.identity_id,
        ...(identity.identity_authorized_bc_id ? { identity_authorized_bc_id: identity.identity_authorized_bc_id } : {}),
        tiktok_item_id: i.itemId, creative_authorized: false,
        ...(goal.objective === 'TRAFFIC' ? { call_to_action: 'DOWNLOAD_NOW', landing_page_url: `https://clarendon.dev/get/${i.appId}?ct=${token}` } : {}),
        operation_status: status,
      }],
    } })
    patch.ad_id = String(ad.ad_ids?.[0] ?? ad.ad_id ?? '')
    void campaignHoldsBudget
    return await updatePromotion(row.id, { ...patch, status: i.paused ? 'paused' : 'active', error: null })
  } catch (e) {
    const msg = (e as Error).message
    // Never leave a half-built campaign spending.
    if (patch.campaign_id) await setCampaignStatus(advertiserId, patch.campaign_id, 'DISABLE').catch(() => {})
    await updatePromotion(row.id, { ...patch, status: 'failed', error: msg })
    throw new Error(msg)
  }
}

export function describeAudience(a: TikTokAudience) {
  const ages = a.ageGroups.length === AGE_GROUPS.length ? '18+' : `${minAgeOf(a.ageGroups)}-${a.ageGroups.includes('AGE_55_100') ? '55+' : Number(a.ageGroups[a.ageGroups.length - 1]?.split('_')[2]) || ''}`
  const where = a.locations.length === 1 && a.locations[0].id === US.id ? 'US' : a.locations.slice(0, 2).map((l) => l.name).join('+') + (a.locations.length > 2 ? ` +${a.locations.length - 2}` : '')
  const tags = a.hashtags.length ? ` #${a.hashtags[0].name}${a.hashtags.length > 1 ? ` +${a.hashtags.length - 1}` : ''}` : ''
  const ints = a.interests.length ? ` ${a.interests[0].name}${a.interests.length > 1 ? ` +${a.interests.length - 1}` : ''}` : ''
  return `${where} ${ages}${ints}${tags}`.trim()
}

export const setCampaignStatus = (advertiserId: string, campaignId: string, operation: 'ENABLE' | 'DISABLE') =>
  tiktokCall('/campaign/status/update/', { method: 'POST', body: { advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: operation } })

export async function setTikTokPromotionStatus(id: string, action: 'pause' | 'resume' | 'stop') {
  const p = await getPromotion(id)
  if (!p || p.network !== 'tiktok') throw new Error('Promotion not found.')
  const advertiserId = tiktokAdvertiserId(p.app_id)
  if (!p.campaign_id || !advertiserId) return updatePromotion(id, { status: action === 'resume' ? p.status : 'ended' })
  if (action === 'resume' && p.status === 'ended') throw new Error('This promotion was stopped; start a new one instead.')
  await setCampaignStatus(advertiserId, p.campaign_id, action === 'resume' ? 'ENABLE' : 'DISABLE')
  return updatePromotion(id, { status: action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'ended' })
}

/** Hide a failed or finished boost. A half-built campaign stays paused on
 *  TikTok (never deleted) so its history is there in Ads Manager. */
export async function clearTikTokPromotion(id: string) {
  const p = await getPromotion(id)
  if (!p) throw new Error('Promotion not found.')
  if (p.status === 'active' || p.status === 'paused' || p.status === 'creating') throw new Error('Stop it first, then clear it.')
  await rest(`studio_promotions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ hidden: true, updated_at: new Date().toISOString() }) })
}

export type TikTokPromoResults = {
  spend_cents: number; impressions: number; reach?: number; clicks: number; views15s?: number; video_views?: number; follows?: number; likes?: number
  /** One word: running | in_review | rejected | paused | scheduled | ended | … */
  delivery?: string; status_detail?: string; review?: string
}

export async function tiktokPromotionResults(p: Promotion): Promise<TikTokPromoResults | null> {
  const advertiserId = tiktokAdvertiserId(p.app_id)
  if (!p.campaign_id || !advertiserId) return null
  try {
    const start = p.start_at.slice(0, 10), end = new Date().toISOString().slice(0, 10)
    const [rows, ads] = await Promise.all([
      tiktokReport(advertiserId, 'AUCTION_CAMPAIGN', ['campaign_id'], start < end ? start : end, end, [], [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([p.campaign_id]) }]).catch(() => []),
      p.ad_id ? tiktokCall('/ad/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ ad_ids: [p.ad_id] }), fields: JSON.stringify(['ad_id', 'secondary_status', 'operation_status']) } }).catch(() => null) : Promise.resolve(null),
    ])
    const m = rows[0]?.metrics ?? {}
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
    const ad = ads?.list?.[0]
    const review = p.ad_id && ad?.secondary_status === 'AD_STATUS_AUDIT_DENY' ? (await tiktokReviewInfo(advertiserId, [p.ad_id]).catch(() => new Map())).get(p.ad_id) : undefined
    return {
      spend_cents: Math.round(n(m.spend) * 100), impressions: n(m.impressions), reach: m.reach == null ? undefined : n(m.reach), clicks: n(m.clicks),
      views15s: m.engaged_view_15s == null ? undefined : n(m.engaged_view_15s), video_views: m.video_play_actions == null ? undefined : n(m.video_play_actions),
      follows: m.follows == null ? undefined : n(m.follows), likes: m.likes == null ? undefined : n(m.likes),
      delivery: ad ? tiktokStatusWord(ad.secondary_status, ad.operation_status) : undefined, status_detail: ad?.secondary_status, review,
    }
  } catch { return null }
}

export const adsManagerUrl = (advertiserId: string, campaignId?: string) =>
  `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${advertiserId}${campaignId ? `&keyword=${campaignId}` : ''}`
/** The ad-group level of Ads Manager, searched by the campaign id (targeting lives on the ad group). */
export const adGroupManagerUrl = (advertiserId: string, campaignId?: string) =>
  `https://ads.tiktok.com/i18n/perf/adgroup?aadvid=${advertiserId}${campaignId ? `&keyword=${campaignId}` : ''}`

// ── Duplicate as Traffic (FEAT-CLA-023 actions) ──────────────────────────────
//
// Reads the source campaign's ad group and Spark ad, then creates a TRAFFIC
// campaign → an ad group copying the targeting / placements (schedule from
// now, budget from the confirm sheet, CLICK optimisation) → a Spark Ad on the
// same post with a DOWNLOAD_NOW button to clarendon.dev/get/<app>?ct=…
// Field names checked against TikTok Marketing API v1.3 (adgroup/create,
// ad/create creatives, adgroup/get filtering) on 2026-10-27. `dryRun` builds
// and returns the payloads without creating anything.

export type DuplicateTrafficInput = {
  appId: string; campaignId: string; dailyBudgetCents?: number; pauseOriginal?: boolean; dryRun?: boolean; source?: string
}
export type DuplicateTrafficResult = {
  dry_run: boolean
  payloads: { campaign: Record<string, unknown>; adgroup: Record<string, unknown>; ad: Record<string, unknown>; pause_original?: Record<string, unknown> }
  result_ids?: { campaign_id: string; adgroup_id: string; ad_id: string; promotion_id?: string }
  notes: string[]
}

// Targeting + delivery settings copied from the source ad group (v1.3 adgroup/get → adgroup/create names).
const COPY_ADGROUP_FIELDS = ['location_ids', 'zipcode_ids', 'age_groups', 'gender', 'languages', 'interest_category_ids', 'interest_keyword_ids', 'actions',
  'operating_systems', 'device_price_ranges', 'network_types', 'carrier_ids', 'spending_power', 'household_income', 'audience_ids', 'excluded_audience_ids',
  'placements', 'placement_type', 'search_result_enabled', 'comment_disabled', 'video_download_disabled', 'share_disabled'] as const
// Not copied: tiktok_subplacements — a Video Views ad group's SEARCH_FEED / LEMON8 made
// adgroup/create answer 40002 "Invalid selection. Check placements" for a TRAFFIC ad
// group (2026-10-28); TikTok picks the sub-placements for the objective when they're absent.

export async function duplicateTikTokAsTraffic(i: DuplicateTrafficInput): Promise<DuplicateTrafficResult> {
  const app = PUBLISH_APPS.find((a) => a.id === i.appId)
  const advertiserId = tiktokAdvertiserId(i.appId)
  if (!app || !advertiserId) throw new Error('No TikTok ad account id for this app.')
  const notes: string[] = []
  const budgetUsd = Math.max(TT_LIMITS.minDailyCents, Math.min(TT_LIMITS.maxDailyCents, i.dailyBudgetCents ?? 2000)) / 100
  const now = new Date()
  const token = campaignToken(i.appId, 'downloads', now)
  const code = APP_CODE[i.appId] ?? i.appId.toUpperCase()

  // 1. The source: campaign name, its (first) ad group, its (first) Spark ad.
  let srcCampaign: any = null, srcGroup: any = null, srcAd: any = null
  const read = async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn() } catch (e) {
      const m = (e as Error).message
      if (/code 40001/.test(m) && i.dryRun) { notes.push(`${label}: not readable yet (TikTok 40001 — Ads Management scope under review); payload shows a placeholder.`); return null }
      throw new Error(/code 40001/.test(m) ? `${m} — TikTok hasn’t approved the Ads Management scope yet; duplicate it in Ads Manager for now.` : m)
    }
  }
  srcCampaign = (await read('campaign/get', () => tiktokCall('/campaign/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [i.campaignId] }), fields: JSON.stringify(['campaign_id', 'campaign_name', 'objective_type', 'budget', 'budget_mode']) } })))?.list?.[0] ?? null
  srcGroup = (await read('adgroup/get', () => tiktokCall('/adgroup/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [i.campaignId] }), page_size: '10' } })))?.list?.[0] ?? null
  srcAd = (await read('ad/get', () => tiktokCall('/ad/get/', { query: { advertiser_id: advertiserId, filtering: JSON.stringify({ campaign_ids: [i.campaignId] }), page_size: '10',
    fields: JSON.stringify(['ad_id', 'ad_name', 'adgroup_id', 'tiktok_item_id', 'identity_id', 'identity_type', 'identity_authorized_bc_id', 'ad_text', 'display_name']) } })))?.list?.find((a: any) => a.tiktok_item_id) ?? null
  const ph = (what: string) => `<${what}>`
  const audienceName = srcGroup?.adgroup_name ? String(srcGroup.adgroup_name).slice(0, 50) : ph('source ad group name')
  const name = `${code} Traffic - Download - ${audienceName} - ${MON[now.getUTCMonth()]} ${now.getUTCFullYear()}`
  const bcId = process.env.TIKTOK_BC_ID || '7652176736041467920'
  const itemId = srcAd?.tiktok_item_id ?? ph('tiktok_item_id of the source Spark ad')
  const identityId = srcAd?.identity_id ?? ph('identity_id of the source Spark ad')
  if (notes.length) notes.push('Placeholders in < > are filled from campaign/get, adgroup/get and ad/get once TikTok approves the Ads Management scope.')

  // 2. Payloads.
  // TikTok's campaign-level daily floor is $50 (campaign/create answered 40002
  // "Your budget must be $50 or more" on 2026-10-28); the ad group's is $20, so
  // the budget lives on the ad group and the campaign is uncapped.
  const campaign = { advertiser_id: advertiserId, campaign_name: name, objective_type: 'TRAFFIC', budget_mode: 'BUDGET_MODE_INFINITE', operation_status: 'ENABLE' }
  const copied: Record<string, unknown> = {}
  // adgroup/get pads some lists with nulls (retired sub-placements) and sends
  // empty arrays for targeting that isn't set; adgroup/create accepts neither.
  if (srcGroup) {
    for (const k of COPY_ADGROUP_FIELDS) {
      const v = Array.isArray(srcGroup[k]) ? srcGroup[k].filter((x: unknown) => x != null) : srcGroup[k]
      if (v != null && !(Array.isArray(v) && !v.length)) copied[k] = v
    }
  }
  else copied['<copied from the source ad group>'] = COPY_ADGROUP_FIELDS.join(', ')
  const adgroup = {
    advertiser_id: advertiserId, campaign_id: '<new campaign_id>', adgroup_name: `${audienceName} - Traffic`,
    placement_type: 'PLACEMENT_TYPE_NORMAL', placements: ['PLACEMENT_TIKTOK'], search_result_enabled: false,
    ...copied,
    promotion_type: 'WEBSITE', optimization_goal: 'CLICK', billing_event: 'CPC', bid_type: 'BID_TYPE_NO_BID', pacing: 'PACING_MODE_SMOOTH',
    budget_mode: 'BUDGET_MODE_DAY', budget: budgetUsd,
    schedule_type: 'SCHEDULE_FROM_NOW', schedule_start_time: ttTime(now.getTime() + 5 * 60_000),
    smart_interest_behavior_enabled: false, creative_material_mode: 'CUSTOM', operation_status: 'ENABLE',
  }
  const ad = {
    advertiser_id: advertiserId, adgroup_id: '<new adgroup_id>',
    creatives: [{
      ad_name: `${code} Spark - Download - ${audienceName}`.slice(0, 100), ad_format: 'SINGLE_VIDEO',
      identity_type: 'BC_AUTH_TT', identity_id: identityId, identity_authorized_bc_id: bcId, tiktok_item_id: itemId, creative_authorized: false,
      call_to_action: 'DOWNLOAD_NOW', landing_page_url: `https://clarendon.dev/get/${i.appId}?ct=${token}`,
      operation_status: 'ENABLE',
    }],
  }
  const pause_original = i.pauseOriginal === false ? undefined : { advertiser_id: advertiserId, campaign_ids: [i.campaignId], operation_status: 'DISABLE' }
  const payloads = { campaign, adgroup, ad, ...(pause_original ? { pause_original } : {}) }
  console.log(`[actions] duplicate_as_traffic ${i.dryRun ? 'DRY RUN' : 'LIVE'} ${i.appId}/${i.campaignId}:`, JSON.stringify(payloads))
  if (i.dryRun) return { dry_run: true, payloads, notes }
  if (!srcAd?.tiktok_item_id || !srcAd?.identity_id) throw new Error('The source campaign has no Spark ad with a TikTok post to reuse.')

  // 3. Create, never leaving a half-built campaign spending.
  const promo = await insertPromotion({
    app_id: i.appId, post_id: null, network: 'tiktok', platform: 'tiktok', remote_id: String(srcAd.tiktok_item_id), permalink: null, goal: 'downloads',
    daily_budget_cents: Math.round(budgetUsd * 100), start_at: now.toISOString(), end_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
    audience: { copied_from_adgroup: srcGroup?.adgroup_id, name: audienceName } as unknown as Promotion['audience'], status: 'creating', source: i.source ?? 'insights-duplicate',
  })
  const patch: Partial<Promotion> = {}
  try {
    const c = await tiktokCall('/campaign/create/', { method: 'POST', body: campaign })
    patch.campaign_id = String(c.campaign_id)
    const g = await tiktokCall('/adgroup/create/', { method: 'POST', body: { ...adgroup, campaign_id: patch.campaign_id } })
    patch.adset_id = String(g.adgroup_id)
    const a = await tiktokCall('/ad/create/', { method: 'POST', body: { ...ad, adgroup_id: patch.adset_id } })
    patch.ad_id = String(a.ad_ids?.[0] ?? a.ad_id ?? '')
    if (pause_original) await tiktokCall('/campaign/status/update/', { method: 'POST', body: pause_original })
    await updatePromotion(promo.id, { ...patch, status: 'active', error: null })
    return { dry_run: false, payloads, notes, result_ids: { campaign_id: patch.campaign_id, adgroup_id: patch.adset_id, ad_id: patch.ad_id, promotion_id: promo.id } }
  } catch (e) {
    const msg = (e as Error).message
    if (patch.campaign_id) await setCampaignStatus(advertiserId, patch.campaign_id, 'DISABLE').catch(() => {})
    await updatePromotion(promo.id, { ...patch, status: 'failed', error: msg }).catch(() => {})
    throw new Error(msg)
  }
}
