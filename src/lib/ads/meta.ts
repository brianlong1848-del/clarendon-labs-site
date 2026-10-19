// ─── Meta ads: promote a post, read results, sync spend ──────────────────────
//
// SERVER ONLY. Uses the same META_ACCESS_TOKEN (Analytics API system user) as
// publishing, against ONE shared ad account for the whole studio
// ("Clarendon Labs", act_1468518541834459 — Meta caps the unverified business
// at one ad account). Each app gets its own campaigns, named "<App> · …", so
// spend still splits per app in Money → Ads.
//
// A promotion = campaign → ad set (budget, dates, audience) → ad whose
// creative is the EXISTING Facebook or Instagram post, so likes and comments
// stay on the original post.
//
// What the token needs (Business settings → System users → Analytics API):
//   • the ad account assigned with "Manage campaigns"
//   • the app's Page + Instagram account assigned (already true for publishing)
//   • ads_management + ads_read scopes on the token (regenerate if missing)
// adsStatus() checks all three and says which one is missing.
//
// Guardrails: 18+ only on every app (Gag Order is 17+, Jinglewire markets to
// parents only), a per-day and per-promotion spend cap (env, defaults below),
// and no tracking of any kind for Jinglewire — spend only, never installs.

import { pageFor, igFor, grantedPermissions, PUBLISH_APPS } from '@/lib/publish/platforms'
import { rest } from '@/lib/publish/store'
import type { AudiencePreset } from './presets'
import { STORE_APPS, downloadLink } from './store'

const G = 'https://graph.facebook.com/v22.0'  // v22+: Instagram ads use instagram_user_id
const token = () => process.env.META_ACCESS_TOKEN
export const adAccountId = () => (process.env.META_AD_ACCOUNT_ID || '1468518541834459').replace(/^act_/, '')
const act = () => `act_${adAccountId()}`

export const LIMITS = {
  maxDailyCents: Math.round(Number(process.env.META_MAX_DAILY_USD || 50) * 100),
  maxTotalCents: Math.round(Number(process.env.META_MAX_TOTAL_USD || 500) * 100),
  minDailyCents: 100,
  minAge: 18,
}
/** Kid-directed: ads must target parents, and nothing is ever attributed. */
export const KID_APPS = new Set(['jinglewire'])

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000), ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) {
    const e = body?.error
    throw new Error(e?.error_user_msg || e?.error_user_title || e?.message || `HTTP ${res.status}`)
  }
  return body
}
const post = (path: string, params: Record<string, unknown>) => {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) form.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  form.set('access_token', token() ?? '')
  return call(`${G}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() })
}
const get = (path: string, params: Record<string, string> = {}) =>
  call(`${G}/${path}?${new URLSearchParams({ ...params, access_token: token() ?? '' })}`)

// ── Readiness ────────────────────────────────────────────────────────────────

const ACCOUNT_STATUS: Record<number, string> = {
  1: 'active', 2: 'disabled', 3: 'unsettled (a payment failed)', 7: 'pending risk review', 8: 'pending settlement',
  9: 'in grace period', 100: 'pending closure', 101: 'closed',
}

export type AdsStatus = {
  ready: boolean
  reasons: string[]
  account?: { id: string; name: string; status: string; currency: string; timezone: string; amount_spent_cents: number }
  limits: typeof LIMITS
}

export async function adsStatus(): Promise<AdsStatus> {
  const reasons: string[] = []
  if (!token()) return { ready: false, reasons: ['META_ACCESS_TOKEN isn’t set on this deployment.'], limits: LIMITS }
  const perms = await grantedPermissions()
  // Empty = Meta didn't say (some system-user tokens); let the account call decide.
  if (perms.size > 0) for (const p of ['ads_management', 'ads_read']) {
    if (!perms.has(p)) reasons.push(`The Meta token is missing ${p}. Business settings → System users → Analytics API → Generate token, tick ads_management + ads_read (keep the existing ticks), and save it as META_ACCESS_TOKEN in Vercel.`)
  }
  let account: AdsStatus['account']
  try {
    const a = await get(act(), { fields: 'name,account_status,disable_reason,currency,timezone_name,amount_spent' })
    account = {
      id: adAccountId(), name: a.name, status: ACCOUNT_STATUS[a.account_status] ?? `status ${a.account_status}`,
      currency: a.currency, timezone: a.timezone_name, amount_spent_cents: Number(a.amount_spent ?? 0),
    }
    if (a.account_status !== 1) reasons.push(`The ad account is ${account.status}. Open Billing & payments in Meta to fix it.`)
  } catch (e) {
    const msg = (e as Error).message
    reasons.push(/permission|does not exist|not authorized|access/i.test(msg)
      ? 'The portal can’t reach the “Clarendon Labs” ad account. Business settings → Ad accounts → Clarendon Labs → Assign people → Analytics API → turn on “Manage campaigns”.'
      : `Meta: ${msg}`)
  }
  return { ready: reasons.length === 0, reasons, account, limits: LIMITS }
}

// ── Audience ─────────────────────────────────────────────────────────────────

export type Place = { key: string; name: string; type: 'country' | 'region' | 'city'; country?: string; region?: string; radiusMiles?: number }
export type Interest = { id: string; name: string; audience?: number }
export type Audience = {
  ageMin: number
  ageMax: number
  genders: 'all' | 'men' | 'women'
  places: Place[]
  interests: Interest[]
  /** Let Meta reach beyond the interests when it predicts better results. */
  expand: boolean
}
export const DEFAULT_AUDIENCE: Audience = { ageMin: 18, ageMax: 65, genders: 'all', places: [{ key: 'US', name: 'United States', type: 'country' }], interests: [], expand: false }

export async function searchPlaces(q: string): Promise<Place[]> {
  const body = await get('search', { type: 'adgeolocation', q, location_types: JSON.stringify(['country', 'region', 'city']), limit: '12' })
  return (body.data ?? []).map((r: any) => ({
    key: String(r.key), name: r.name, type: r.type, country: r.country_name ?? r.country_code, region: r.region,
  }))
}

export async function searchInterests(q: string): Promise<Interest[]> {
  const body = await get('search', { type: 'adinterest', q, limit: '15' })
  return (body.data ?? []).map((r: any) => ({ id: String(r.id), name: r.name, audience: Number(r.audience_size_upper_bound ?? r.audience_size ?? 0) || undefined }))
}

const EU = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'])

export function checkAudience(appId: string, a: Audience): string[] {
  const out: string[] = []
  if (a.ageMin < LIMITS.minAge) out.push(`Ads from the studio target ${LIMITS.minAge}+ only.`)
  if (a.ageMax < a.ageMin || a.ageMax > 65) out.push('Age range must be between the minimum and 65+.')
  if (!a.places.length) out.push('Pick at least one place.')
  if (KID_APPS.has(appId) && a.ageMin < 25) out.push('Jinglewire ads go to parents only — set the minimum age to 25 or older.')
  return out
}

function targetingSpec(a: Audience, platform: 'facebook' | 'instagram') {
  const geo: Record<string, unknown> = {}
  const countries = a.places.filter((p) => p.type === 'country').map((p) => p.key)
  const regions = a.places.filter((p) => p.type === 'region').map((p) => ({ key: p.key }))
  const cities = a.places.filter((p) => p.type === 'city').map((p) => ({ key: p.key, radius: p.radiusMiles ?? 15, distance_unit: 'mile' }))
  if (countries.length) geo.countries = countries
  if (regions.length) geo.regions = regions
  if (cities.length) geo.cities = cities
  return {
    geo_locations: geo,
    // With Advantage+ audience ("expand") Meta only accepts the minimum age as a
    // hard limit (up to 25); the maximum must stay 65 and works as a suggestion.
    age_min: a.expand ? Math.min(a.ageMin, 25) : a.ageMin,
    age_max: a.expand ? 65 : a.ageMax,
    ...(a.genders === 'men' ? { genders: [1] } : a.genders === 'women' ? { genders: [2] } : {}),
    ...(a.interests.length ? { flexible_spec: [{ interests: a.interests.map((i) => ({ id: i.id, name: i.name })) }] } : {}),
    publisher_platforms: [platform],
    ...(platform === 'facebook' ? { facebook_positions: ['feed', 'video_feeds', 'facebook_reels'] } : { instagram_positions: ['stream', 'reels', 'story'] }),
    targeting_automation: { advantage_audience: a.expand ? 1 : 0 },
  }
}

/** Monthly people Meta could reach with this audience — a range, as Meta gives it. */
export async function estimateReach(a: Audience, platform: 'facebook' | 'instagram'): Promise<{ low: number; high: number } | null> {
  try {
    const body = await get(`${act()}/delivery_estimate`, { targeting_spec: JSON.stringify(targetingSpec(a, platform)), optimization_goal: 'REACH' })
    const d = body.data?.[0]
    if (!d) return null
    return { low: Number(d.estimate_mau_lower_bound ?? 0), high: Number(d.estimate_mau_upper_bound ?? 0) }
  } catch { return null }
}

// ── Promotions ───────────────────────────────────────────────────────────────

export type Goal = 'engagement' | 'reach' | 'downloads'
export const GOALS: Record<Goal, { label: string; objective: string; optimization: string; destination?: string }> = {
  // Traffic to the App Store with a "Download" button on the ad. (True
  // install-optimised campaigns need each app registered as a Meta app with
  // SKAdNetwork; this works today and still sends people straight to install.)
  downloads: { label: 'App downloads — “Download” button to the App Store', objective: 'OUTCOME_TRAFFIC', optimization: 'LINK_CLICKS', destination: 'WEBSITE' },
  engagement: { label: 'More engagement (likes, comments, shares)', objective: 'OUTCOME_ENGAGEMENT', optimization: 'POST_ENGAGEMENT', destination: 'ON_POST' },
  reach: { label: 'Reach as many people as possible', objective: 'OUTCOME_AWARENESS', optimization: 'REACH' },
}

// Apps with a Download button: see ./store.ts (links go via clarendon.dev/get/<app>).
export const STORE_LINKS: Record<string, string> = Object.fromEntries(Object.keys(STORE_APPS).map((id) => [id, downloadLink(id)]))

export type Promotion = {
  id: string; app_id: string; post_id: string | null; network: 'meta' | 'tiktok'; platform: string; remote_id: string; permalink: string | null
  goal: Goal; daily_budget_cents: number; start_at: string; end_at: string; audience: Audience
  campaign_id: string | null; adset_id: string | null; ad_id: string | null
  status: 'creating' | 'active' | 'paused' | 'ended' | 'failed'; error: string | null; source: string; created_at: string; updated_at: string
}

export const listPromotions = (limit = 60) => rest<Promotion[]>(`studio_promotions?hidden=eq.false&order=created_at.desc&limit=${limit}`)
export const getPromotion = async (id: string) => (await rest<Promotion[]>(`studio_promotions?id=eq.${encodeURIComponent(id)}`))[0] ?? null
const insertPromotion = async (row: Partial<Promotion>) =>
  (await rest<Promotion[]>('studio_promotions', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]
const updatePromotion = async (id: string, patch: Partial<Promotion>) =>
  (await rest<Promotion[]>(`studio_promotions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' },
  }))[0]

export type PromoteInput = {
  appId: string
  postId?: string | null
  platform: 'facebook' | 'instagram'
  remoteId: string
  permalink?: string | null
  goal: Goal
  dailyBudgetCents: number
  startAt: string
  endAt: string
  audience: Audience
  source?: string
}

export function checkPromote(i: PromoteInput): string[] {
  const out: string[] = []
  if (!PUBLISH_APPS.some((a) => a.id === i.appId)) out.push('Unknown app.')
  if (i.platform !== 'facebook' && i.platform !== 'instagram') out.push('Only Facebook and Instagram posts can be promoted here so far.')
  if (!i.remoteId) out.push('That post hasn’t gone out yet.')
  if (!GOALS[i.goal]) out.push('Pick a goal.')
  if (i.goal === 'downloads' && !STORE_LINKS[i.appId]) out.push('This app isn’t on the App Store yet, so it can’t have a Download button.')
  if (!Number.isFinite(i.dailyBudgetCents) || i.dailyBudgetCents < LIMITS.minDailyCents) out.push(`Daily budget must be at least $${LIMITS.minDailyCents / 100}.`)
  if (i.dailyBudgetCents > LIMITS.maxDailyCents) out.push(`Daily budget is capped at $${LIMITS.maxDailyCents / 100} (META_MAX_DAILY_USD).`)
  const start = Date.parse(i.startAt), end = Date.parse(i.endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) out.push('Pick start and end dates.')
  else {
    if (end - start < 24 * 3600_000) out.push('Run it for at least one day.')
    if (end < Date.now()) out.push('The end date is in the past.')
    const days = Math.ceil((end - Math.max(start, Date.now())) / 864e5)
    if (days * i.dailyBudgetCents > LIMITS.maxTotalCents) out.push(`That’s up to $${((days * i.dailyBudgetCents) / 100).toFixed(0)} in total; the cap per promotion is $${LIMITS.maxTotalCents / 100} (META_MAX_TOTAL_USD).`)
  }
  out.push(...checkAudience(i.appId, i.audience))
  return out
}

/** Facebook publishing returns a post id ("<page>_<post>") for photos / text
 *  and a video id for videos and Reels; ads need the post id. */
async function fbStoryId(pageId: string, remoteId: string) {
  if (remoteId.includes('_')) return remoteId
  try {
    const v = await get(remoteId, { fields: 'post_id' })
    if (v.post_id) return String(v.post_id).includes('_') ? v.post_id : `${pageId}_${v.post_id}`
  } catch { /* fall through */ }
  return `${pageId}_${remoteId}`
}

export async function promote(i: PromoteInput): Promise<Promotion> {
  const app = PUBLISH_APPS.find((a) => a.id === i.appId)!
  const goal = GOALS[i.goal]
  const page = await pageFor(i.appId)
  if (!page) throw new Error(`No Facebook Page found for ${app.name}.`)
  const ig = i.platform === 'instagram' ? await igFor(i.appId) : undefined
  if (i.platform === 'instagram' && !ig) throw new Error(`No Instagram account found for ${app.name}.`)

  const row = await insertPromotion({
    app_id: i.appId, post_id: i.postId ?? null, network: 'meta', platform: i.platform, remote_id: i.remoteId, permalink: i.permalink ?? null,
    goal: i.goal, daily_budget_cents: i.dailyBudgetCents, start_at: new Date(i.startAt).toISOString(), end_at: new Date(i.endAt).toISOString(),
    audience: i.audience, status: 'creating', source: i.source ?? 'web',
  })
  const stamp = new Date().toISOString().slice(0, 10)
  const name = `${app.name} · Boost ${i.platform === 'instagram' ? 'IG' : 'FB'} · ${stamp} · ${row.id.slice(0, 6)}`
  const patch: Partial<Promotion> = {}
  try {
    const campaign = await post(`${act()}/campaigns`, {
      name, objective: goal.objective, status: 'ACTIVE', special_ad_categories: [], is_adset_budget_sharing_enabled: false,
    })
    patch.campaign_id = campaign.id
    const eu = i.audience.places.some((p) => (p.type === 'country' ? EU.has(p.key) : false))
    const adset = await post(`${act()}/adsets`, {
      name, campaign_id: campaign.id, status: 'ACTIVE',
      daily_budget: String(i.dailyBudgetCents), billing_event: 'IMPRESSIONS', optimization_goal: goal.optimization,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP', ...(goal.destination ? { destination_type: goal.destination } : {}),
      start_time: new Date(Math.max(Date.parse(i.startAt), Date.now() + 60_000)).toISOString(), end_time: new Date(i.endAt).toISOString(),
      targeting: targetingSpec(i.audience, i.platform),
      ...(eu ? { dsa_beneficiary: 'Clarendon Labs LLC', dsa_payor: 'Clarendon Labs LLC' } : {}),
    })
    patch.adset_id = adset.id
    const creative = await post(`${act()}/adcreatives`, i.goal === 'downloads'
      ? await downloadCreative(name, page.id, ig, i)
      : i.platform === 'facebook'
        ? { name, object_story_id: await fbStoryId(page.id, i.remoteId) }
        : { name, object_id: page.id, instagram_user_id: ig, source_instagram_media_id: i.remoteId })
    const ad = await post(`${act()}/ads`, { name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'ACTIVE' })
    patch.ad_id = ad.id
    return await updatePromotion(row.id, { ...patch, status: 'active', error: null })
  } catch (e) {
    const msg = (e as Error).message
    // Don't leave a half-built, spending campaign behind.
    if (patch.campaign_id) await post(patch.campaign_id, { status: 'PAUSED' }).catch(() => {})
    await updatePromotion(row.id, { ...patch, status: 'failed', error: msg })
    throw new Error(msg)
  }
}

/** Same post, plus a "Download" button that opens the App Store.
 *  Instagram: the existing post keeps its likes and comments.
 *  Facebook: an existing post can't take a new button, so the ad is the same
 *  video with the button (shown only as an ad, not on the Page). */
async function downloadCreative(name: string, pageId: string, ig: string | undefined, i: PromoteInput) {
  const link = STORE_LINKS[i.appId]
  const cta = { type: 'DOWNLOAD', value: { link } }
  if (i.platform === 'instagram') {
    return { name, object_id: pageId, instagram_user_id: ig, source_instagram_media_id: i.remoteId, call_to_action: cta }
  }
  let videoId = i.remoteId
  if (videoId.includes('_')) {
    const att = await get(videoId, { fields: 'attachments{media_type,target}' }).catch(() => null)
    const a = att?.attachments?.data?.[0]
    if (a?.media_type !== 'video' || !a?.target?.id) throw new Error('On Facebook the Download button works on video posts. Promote the Instagram version, or pick a video post.')
    videoId = String(a.target.id)
  }
  const v = await get(videoId, { fields: 'picture,description' })
  return { name, object_story_spec: { page_id: pageId, video_data: { video_id: videoId, image_url: v.picture, message: v.description ?? '', call_to_action: cta } } }
}

export async function setPromotionStatus(id: string, action: 'pause' | 'resume' | 'stop') {
  const p = await getPromotion(id)
  if (!p) throw new Error('Promotion not found.')
  if (!p.campaign_id) return updatePromotion(id, { status: action === 'resume' ? p.status : 'ended' })
  if (action === 'resume' && p.status === 'ended') throw new Error('This promotion was stopped; start a new one instead.')
  await post(p.campaign_id, { status: action === 'resume' ? 'ACTIVE' : 'PAUSED' })
  return updatePromotion(id, { status: action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'ended' })
}

/** Hide a failed or finished promotion from the list. Its Meta campaign (if
 *  one was half-built) is archived — never deleted — so spend history stays. */
export async function clearPromotion(id: string) {
  const p = await getPromotion(id)
  if (!p) throw new Error('Promotion not found.')
  if (p.status === 'active' || p.status === 'paused' || p.status === 'creating') throw new Error('Stop it first, then clear it.')
  if (p.campaign_id && p.status === 'failed') await post(p.campaign_id, { status: 'ARCHIVED' }).catch(() => {})
  await rest(`studio_promotions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ hidden: true, updated_at: new Date().toISOString() }) })
}

/** Clear every failed promotion in one go. */
export async function clearFailed() {
  const rows = await rest<Promotion[]>('studio_promotions?hidden=eq.false&status=eq.failed&select=*')
  for (const r of rows) await clearPromotion(r.id)
  return rows.length
}

export type PromoResults = { spend_cents: number; impressions: number; reach: number; clicks: number; engagements: number; delivery?: string; review?: string }

export async function promotionResults(p: Promotion): Promise<PromoResults | null> {
  if (!p.campaign_id) return null
  try {
    // The ad's own status says whether Meta is still reviewing it (PENDING_REVIEW),
    // rejected it (DISAPPROVED, with the reason) or is showing it (ACTIVE).
    const [ins, camp] = await Promise.all([
      get(`${p.campaign_id}/insights`, { fields: 'spend,impressions,reach,clicks,actions', date_preset: 'maximum' }),
      (p.ad_id ? get(p.ad_id, { fields: 'effective_status,ad_review_feedback' }) : get(p.campaign_id, { fields: 'effective_status' })).catch(() => ({})),
    ])
    const r = ins.data?.[0] ?? {}
    const act = (type: string) => Number((r.actions ?? []).find((a: { action_type: string }) => a.action_type === type)?.value ?? 0)
    return {
      spend_cents: Math.round(Number(r.spend ?? 0) * 100), impressions: Number(r.impressions ?? 0), reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0), engagements: act('post_engagement') || act('page_engagement'),
      delivery: (camp as { effective_status?: string }).effective_status,
      review: Object.values(((camp as { ad_review_feedback?: { global?: Record<string, string> } }).ad_review_feedback?.global) ?? {})[0],
    }
  } catch { return null }
}

/** Ends promotions whose end date has passed (kept tidy by the nightly sync). */
export async function closeFinished() {
  const now = new Date().toISOString()
  await rest(`studio_promotions?status=in.(active,paused)&end_at=lt."${now}"`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ended', updated_at: now }),
  }).catch(() => {})
}

// ── Spend sync (Money → Ads) ─────────────────────────────────────────────────

export type MetaCampaignDay = {
  platform: 'meta'; advertiser_id: string; campaign_id: string; campaign_name: string | null; day: string
  spend_cents: number; impressions: number; clicks: number; installs: number; conversions: number; purchase_value_cents: number; currency: string
  app_slug: string | null
}

/** Campaign × day rows for the shared ad account. The app comes from the
 *  promotion that created the campaign, else the "<App> · …" name prefix
 *  (so campaigns made by hand in Ads Manager split correctly too). */
export async function metaCampaignDays(start: string, end: string): Promise<MetaCampaignDay[] | { error: string }> {
  if (!token()) return { error: 'META_ACCESS_TOKEN is not set' }
  const promos = await rest<Pick<Promotion, 'app_id' | 'campaign_id'>[]>('studio_promotions?campaign_id=not.is.null&select=app_id,campaign_id').catch(() => [])
  const byCampaign = new Map(promos.map((p) => [p.campaign_id!, p.app_id]))
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const appFromName = (n: string) => PUBLISH_APPS.find((a) => norm(n).startsWith(norm(a.name)))?.id ?? null

  const rows: MetaCampaignDay[] = []
  let url: string | null = `${G}/${act()}/insights?${new URLSearchParams({
    level: 'campaign', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: start, until: end }),
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,account_currency',
    access_token: token()!,
  })}`
  try {
    for (let pages = 0; url && pages < 20; pages++) {
      const body: any = await call(url)
      for (const r of body.data ?? []) {
        const app = byCampaign.get(r.campaign_id) ?? appFromName(r.campaign_name ?? '')
        const kid = !!app && KID_APPS.has(app)
        const sum = (list: any[] | undefined, types: string[]) =>
          (list ?? []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value ?? 0), 0)
        rows.push({
          platform: 'meta', advertiser_id: adAccountId(), campaign_id: String(r.campaign_id), campaign_name: r.campaign_name ?? null,
          day: r.date_start, spend_cents: Math.round(Number(r.spend ?? 0) * 100), impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
          installs: kid ? 0 : sum(r.actions, ['mobile_app_install', 'app_install', 'omni_app_install']),
          conversions: 0,
          purchase_value_cents: kid ? 0 : Math.round(sum(r.action_values, ['app_custom_event.fb_mobile_purchase', 'omni_purchase']) * 100),
          currency: r.account_currency ?? 'USD', app_slug: app,
        })
      }
      url = body.paging?.next ?? null
    }
  } catch (e) { return { error: `Meta report failed: ${(e as Error).message}` } }
  return rows
}

// ── Saved audience presets (built-ins are in ./presets.ts) ───────────────────

type PresetRow = { id: string; app_id: string; name: string; platform: string | null; goal: string | null; daily_usd: number | null; days: number | null; audience: Audience }

export async function savedPresets(): Promise<AudiencePreset[]> {
  const rows = await rest<PresetRow[]>('studio_audience_presets?order=created_at.asc&limit=200').catch(() => [])
  return rows.map((r) => ({
    id: r.id, appId: r.app_id, name: r.name, saved: true,
    platform: (r.platform ?? undefined) as AudiencePreset['platform'], goal: (r.goal ?? undefined) as AudiencePreset['goal'],
    dailyUsd: r.daily_usd ?? undefined, days: r.days ?? undefined, audience: r.audience,
  }))
}

export async function savePreset(p: { appId: string; name: string; platform?: string; goal?: string; dailyUsd?: number; days?: number; audience: Audience }) {
  const row = { app_id: p.appId, name: p.name.slice(0, 80), platform: p.platform ?? null, goal: p.goal ?? null, daily_usd: p.dailyUsd ?? null, days: p.days ?? null, audience: p.audience }
  return (await rest<PresetRow[]>('studio_audience_presets', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]
}

export const deletePreset = (id: string) =>
  rest(`studio_audience_presets?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
