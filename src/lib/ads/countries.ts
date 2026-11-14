// ─── Ad spend + installs by country (World strip) ───────────────────────────
//
// SERVER ONLY. Live from the platforms (ad_spend has no country column):
//   Meta   — the shared ad account's insights, level=campaign, breakdowns=country
//   TikTok — each app's Integrated Report, dimensions ["campaign_id","country_code"]
// Same tokens, limiter and caching as ./meta.ts and src/lib/analytics/tiktok.ts.
// Never throws: a platform that fails or isn't connected adds a line to
// `errors` and contributes nothing. Jinglewire (kid-directed) never carries
// installs. Cached 30 minutes per window + app.

import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { rest } from '@/lib/publish/store'
import { tiktokAdvertiserId, tiktokCached, tiktokCall, tiktokToken } from '@/lib/analytics/tiktok'
import { KID_APPS, adAccountId, metaConfigured, metaGet, type Promotion } from './meta'

export type CountryAdSpend = {
  /** ISO-3166 alpha-2, lower case ("us", "gb"). */
  country: string
  spend_cents: number
  /** Platform-attributed installs (Meta app installs; TikTok app_install). */
  installs: number
  impressions: number
  clicks: number
  platforms: ('meta' | 'tiktok')[]
  /** Per app. */
  by_app: Record<string, { spend_cents: number; installs: number }>
  /** "platform:campaign_id" of every campaign that delivered here. */
  campaigns: string[]
}
export type AdSpendByCountry = { from: string; to: string; app?: string; countries: CountryAdSpend[]; errors: string[] }

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const iso = (d: Date) => d.toISOString().slice(0, 10)
const TIKTOK_APPS = ['rolligan', 'gagorder', 'yulepick', 'borea', 'jinglewire']

type Hit = { platform: 'meta' | 'tiktok'; app: string | null; campaign_id: string; country: string; spend_cents: number; installs: number; impressions: number; clicks: number }

/** [from, to] in windows of at most 30 days (TikTok's report limit). */
function windows(from: string, to: string): [string, string][] {
  const out: [string, string][] = []
  let s = new Date(`${from}T00:00:00Z`)
  const e = new Date(`${to}T00:00:00Z`)
  while (s <= e && out.length < 40) {
    const w = new Date(Math.min(e.getTime(), s.getTime() + 29 * 86400000))
    out.push([iso(s), iso(w)])
    s = new Date(w.getTime() + 86400000)
  }
  return out
}

async function metaByCountry(from: string, to: string): Promise<Hit[]> {
  if (!metaConfigured()) throw new Error('Meta isn’t connected (META_ACCESS_TOKEN).')
  const promos = await rest<Pick<Promotion, 'app_id' | 'campaign_id'>[]>('studio_promotions?campaign_id=not.is.null&select=app_id,campaign_id').catch(() => [])
  const byCampaign = new Map(promos.map((p) => [p.campaign_id!, p.app_id]))
  // Same app matching as metaCampaignDays: Studio boost, "<App> · …" name, or a /get/<app> link in the name.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const appOf = (id: string, name: string) => byCampaign.get(id)
    ?? PUBLISH_APPS.find((a) => norm(name).startsWith(norm(a.name)))?.id
    ?? PUBLISH_APPS.find((a) => new RegExp(`/get/${a.id}(?![a-z0-9-])`, 'i').test(name))?.id
    ?? null
  const out: Hit[] = []
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const body = await metaGet(`act_${adAccountId()}/insights`, {
      level: 'campaign', breakdowns: 'country', limit: '500',
      time_range: JSON.stringify({ since: from, until: to }),
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
      ...(after ? { after } : {}),
    }) as { data?: Record<string, unknown>[]; paging?: { cursors?: { after?: string }; next?: string } }
    for (const r of body.data ?? []) {
      const country = String(r.country ?? '').toLowerCase()
      if (!/^[a-z]{2}$/.test(country)) continue
      const id = String(r.campaign_id ?? '')
      const app = appOf(id, String(r.campaign_name ?? ''))
      const actions = (r.actions as { action_type?: string; value?: unknown }[] | undefined) ?? []
      const installs = app && KID_APPS.has(app) ? 0 : actions.filter((a) => ['mobile_app_install', 'app_install', 'omni_app_install'].includes(a.action_type ?? '')).reduce((t, a) => t + n(a.value), 0)
      out.push({ platform: 'meta', app, campaign_id: id, country, spend_cents: Math.round(n(r.spend) * 100), installs, impressions: n(r.impressions), clicks: n(r.clicks) })
    }
    after = body.paging?.next ? body.paging.cursors?.after : undefined
    if (!after) break
  }
  return out
}

async function tiktokByCountry(app: string, advertiserId: string, from: string, to: string): Promise<Hit[]> {
  const out: Hit[] = []
  const run = async (s: string, e: string, metrics: string[]) => {
    const rows: Hit[] = []
    for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
      const data = await tiktokCall('/report/integrated/get/', { query: {
        advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(['campaign_id', 'country_code']), metrics: JSON.stringify(metrics),
        start_date: s, end_date: e, page: String(page), page_size: '1000',
      } })
      pages = n(data?.page_info?.total_page) || 1
      for (const r of (data?.list ?? []) as { dimensions?: Record<string, string>; metrics?: Record<string, unknown> }[]) {
        const country = String(r.dimensions?.country_code ?? '').toLowerCase()
        const m = r.metrics ?? {}
        if (!/^[a-z]{2}$/.test(country) || (!n(m.spend) && !n(m.impressions))) continue
        rows.push({ platform: 'tiktok', app, campaign_id: String(r.dimensions?.campaign_id ?? ''), country,
          spend_cents: Math.round(n(m.spend) * 100), installs: KID_APPS.has(app) ? 0 : n(m.app_install), impressions: n(m.impressions), clicks: n(m.clicks) })
      }
    }
    return rows
  }
  for (const [s, e] of windows(from, to)) {
    try { out.push(...await run(s, e, ['spend', 'impressions', 'clicks', 'app_install'])) }
    catch (err) {
      // app_install isn't offered with a country breakdown on every account: retry without it.
      if (!/metric|field|param|invalid/i.test((err as Error).message)) throw err
      out.push(...await run(s, e, ['spend', 'impressions', 'clicks']))
    }
  }
  return out
}

/** Per-country ad spend + installs over [from, to] (ISO days, inclusive), every app or one. */
export async function adSpendByCountry({ from, to, app }: { from: string; to: string; app?: string }): Promise<AdSpendByCountry> {
  return tiktokCached(`countries:${from}:${to}:${app ?? 'all'}`, false, () => compute(from, to, app), 30 * 60_000)
    .catch((e) => ({ from, to, app, countries: [], errors: [`Countries: ${(e as Error).message}`] }))
}

async function compute(from: string, to: string, app?: string): Promise<AdSpendByCountry> {
  const errors: string[] = []
  const tasks: Promise<Hit[]>[] = []
  tasks.push(metaByCountry(from, to).catch((e) => { errors.push(`Meta: ${(e as Error).message}`); return [] }))
  if (!tiktokToken()) errors.push('TikTok isn’t connected (TIKTOK_ACCESS_TOKEN).')
  else for (const id of TIKTOK_APPS.filter((x) => !app || x === app)) {
    const adv = tiktokAdvertiserId(id)
    if (!adv) continue
    tasks.push(tiktokByCountry(id, adv, from, to).catch((e) => { errors.push(`TikTok (${id}): ${(e as Error).message}`); return [] }))
  }
  const hits = (await Promise.all(tasks)).flat().filter((h) => !app || h.app === app)
  const by = new Map<string, CountryAdSpend>()
  for (const h of hits) {
    const c = by.get(h.country) ?? { country: h.country, spend_cents: 0, installs: 0, impressions: 0, clicks: 0, platforms: [], by_app: {}, campaigns: [] }
    c.spend_cents += h.spend_cents; c.installs += h.installs; c.impressions += h.impressions; c.clicks += h.clicks
    if (!c.platforms.includes(h.platform)) c.platforms.push(h.platform)
    const k = h.app ?? 'shared'
    const a = (c.by_app[k] ??= { spend_cents: 0, installs: 0 })
    a.spend_cents += h.spend_cents; a.installs += h.installs
    const key = `${h.platform}:${h.campaign_id}`
    if (!c.campaigns.includes(key)) c.campaigns.push(key)
    by.set(h.country, c)
  }
  const countries = Array.from(by.values()).sort((a, b) => b.spend_cents - a.spend_cents || b.impressions - a.impressions)
  return { from, to, app, countries, errors }
}
