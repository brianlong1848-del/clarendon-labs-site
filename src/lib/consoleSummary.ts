// ─── Console: one card per app ───────────────────────────────────────────────
//
// SERVER ONLY. What clarendon.dev/admin and the Studio Apps tab show for each
// of the five apps, from data the site already fetches: App Store Connect
// (downloads / proceeds, last 7 days vs the 7 before; rating + new reviews),
// the Campaigns rows (ad spend 7d, active campaigns), the Ad insights rules
// (the top action for the app, with its button) and — when the app's own
// admin API is connected — its server stats. Rolligan has no server at all.

import { allApps, registry, type ConsoleApp } from './console'
import { analyticsRegistry } from './analytics/registry'
import { fetchAppStoreCached, fetchReviews } from './analytics/appstore'
import { fetchPlayCached, playConfigured } from './analytics/googleplay'
import { PLAY_PACKAGE_IDS } from './ads/store'
import { campaignsFor, type CampaignRow } from './ads/campaigns'
import { analyze, type Action } from './ads/insights'
import { enrichActions } from './ads/enrich'
import { rest } from './publish/store'
import type { Promotion } from './ads/meta'

export type ServerState = {
  connected: boolean
  ok?: boolean; ms?: number; error?: string
  stats?: { label: string; value: number | string; delta?: string; hint?: string; format?: 'usd' }[]
  recent?: { icon?: string; title: string; detail?: string; at: string }[]
  pending?: unknown[]; live?: unknown[]
  /** For apps without a server: what to say instead of a Connect link. */
  note?: string
  /** Where "Connect" points (the vault / env instructions) — absent for Rolligan. */
  connect?: string
}
export type ConsoleCard = {
  id: string; name: string; accent: string
  store: { installs7: number; installs_prev7: number; proceeds7: number; proceeds_prev7: number; report_date?: string; rating: number | null; new_reviews7: number; on_store: boolean } | null
  /** Google Play installs (FEAT-CLA-025). null = not on Play. `connected: false` = the
   *  Play reports bucket isn't set up yet; `error` = it is, but the read failed. */
  play: { installs7: number; installs_prev7: number; proceeds7: number; proceeds_prev7: number; other_currencies?: string[]; report_date?: string; connected: boolean; error?: string } | null
  ads: { spend7_cents: number; active_campaigns: number; campaigns: number } | null
  action: Action | null
  server: ServerState
}
export type ConsoleSummary = { apps: number; servers_connected: number; last_sync: string; build_ms?: Record<string, number> }

const NO_SERVER: Record<string, string> = { rolligan: 'No server — store & ads only' }
const CONNECT_HOW: Record<string, string> = {
  yulepick: 'Set YULEPICK_ADMIN_URL (the studio-admin edge function) and YULEPICK_ADMIN_TOKEN on Vercel; the token must match the function’s ADMIN_TOKEN secret.',
  borea: 'Set BOREA_ADMIN_URL (the studio-admin edge function) and BOREA_ADMIN_TOKEN on Vercel; the token must match the function’s ADMIN_TOKEN secret.',
  gagorder: 'Set GAGORDER_ADMIN_URL and GAGORDER_ADMIN_TOKEN on Vercel.',
  jinglewire: 'Set JINGLEWIRE_ADMIN_URL (the studio-admin edge function on sleighline) and JINGLEWIRE_ADMIN_TOKEN on Vercel; the token must match the function’s ADMIN_TOKEN secret.',
}

/** One app's admin API; reachability is the health signal. */
export async function pullServer(app: ConsoleApp): Promise<ServerState> {
  const started = Date.now()
  try {
    const res = await fetch(`${app.baseUrl}/api/admin`, { headers: { 'x-admin-token': app.token }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const ms = Date.now() - started
    if (!res.ok) return { connected: true, ok: false, ms, error: res.status === 401 ? 'Token rejected — check this app’s ADMIN_TOKEN matches.' : `HTTP ${res.status}`, pending: [], live: [] }
    const data = await res.json()
    return { connected: true, ok: true, ms, pending: data.pending ?? [], live: data.live ?? [], stats: Array.isArray(data.stats) ? data.stats : undefined, recent: Array.isArray(data.recent) ? data.recent : undefined }
  } catch (err) {
    return { connected: true, ok: false, ms: Date.now() - started, error: err instanceof Error && err.name === 'TimeoutError' ? 'No response in 8s' : 'Unreachable', pending: [], live: [] }
  }
}

const sum7 = (series: { date: string; installs: number; proceeds: number }[] | undefined, offset: number) => {
  const s = (series ?? []).slice(-(7 + offset), offset ? -offset : undefined)
  return { installs: s.reduce((t, d) => t + d.installs, 0), proceeds: Math.round(s.reduce((t, d) => t + d.proceeds, 0) * 100) / 100 }
}

export async function consoleCards(): Promise<{ cards: ConsoleCard[]; summary: ConsoleSummary }> {
  const connected = registry()
  const analytics = analyticsRegistry()
  // Asked once for every app and split below: per app, this was five rounds of
  // the same Meta and Supabase requests.
  // How long each part of a rebuild took, so a slow one says why (summary.build_ms).
  const t0 = Date.now(), ms: Record<string, number> = {}
  const timed = <T,>(k: string, p: Promise<T>) => p.finally(() => { ms[k] = Date.now() - t0 })
  // Started, not awaited: the App Store, reviews and server pulls below run
  // alongside (campaigns alone took ~16 s on a cold instance, 2026-11-11).
  const promotionsP = timed('promotions', rest<Pick<Promotion, 'campaign_id' | 'network' | 'post_id' | 'remote_id'>[]>('studio_promotions?campaign_id=not.is.null&select=campaign_id,network,post_id,remote_id').catch(() => []))
  const campaignsP = timed('campaigns', campaignsFor('all', '7d').catch(() => ({ campaigns: [] as CampaignRow[], errors: [] as string[], timings: {} as Record<string, number> })))
  const cards = await Promise.all(allApps().map(async (def): Promise<ConsoleCard> => {
    const conn = connected.find((c) => c.id === def.id)
    const a = analytics.find((x) => x.id === def.id)
    const pkg = PLAY_PACKAGE_IDS[def.id]
    const [server, store, reviews, allCampaigns, playData] = await Promise.all([
      conn ? pullServer(conn) : Promise.resolve<ServerState>({ connected: false, note: NO_SERVER[def.id], connect: NO_SERVER[def.id] ? undefined : CONNECT_HOW[def.id] }),
      a ? timed(`store:${def.id}`, fetchAppStoreCached(a.appStoreId)) : Promise.resolve(null),
      a ? timed(`reviews:${def.id}`, fetchReviews(a.appStoreId)) : Promise.resolve(null),
      campaignsP,
      pkg && playConfigured() ? timed(`play:${def.id}`, fetchPlayCached(pkg)) : Promise.resolve(null),
    ])
    const playSeries = playData && 'series' in playData ? playData.series : undefined
    const pLast = sum7(playSeries, 0), pPrev = sum7(playSeries, 7)
    const play: ConsoleCard['play'] = !pkg ? null
      : !playData ? { installs7: 0, installs_prev7: 0, proceeds7: 0, proceeds_prev7: 0, connected: false }
      : 'error' in playData ? { installs7: 0, installs_prev7: 0, proceeds7: 0, proceeds_prev7: 0, connected: true, error: playData.error }
      : { installs7: pLast.installs, installs_prev7: pPrev.installs, proceeds7: pLast.proceeds, proceeds_prev7: pPrev.proceeds, other_currencies: playData.otherCurrencies.length ? playData.otherCurrencies : undefined, report_date: playData.reportDate ?? undefined, connected: true }
    const last = sum7(store?.series, 0), prev = sum7(store?.series, 7)
    const rows = allCampaigns.campaigns.filter((r) => r.app_id === def.id)
    const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const active = rows.filter((r) => r.status === 'running' || (r.status === undefined && r.daily.some((d) => d.day >= since && d.spend_cents > 0))).length
    let action: Action | null = null
    if (rows.length) {
      const analysis = analyze(rows, new Map(), '7d')
      const [top] = await enrichActions(analysis.actions.slice(0, 1), await promotionsP)
      action = top ?? null
    }
    return {
      id: def.id, name: def.name, accent: def.accent,
      store: a ? { installs7: last.installs, installs_prev7: prev.installs, proceeds7: last.proceeds, proceeds_prev7: prev.proceeds, report_date: store?.reportDate, rating: reviews?.rating ?? null, new_reviews7: reviews?.new7 ?? 0, on_store: !!store } : null,
      play,
      ads: { spend7_cents: rows.reduce((t, r) => t + r.spend_cents, 0), active_campaigns: active, campaigns: rows.length },
      action, server,
    }
  }))
  // The campaigns step's own breakdown, as campaigns.<step> (ms from its start).
  for (const [k, v] of Object.entries((await campaignsP).timings ?? {})) ms[`campaigns.${k}`] = v
  ms.total = Date.now() - t0
  const summary: ConsoleSummary = { apps: cards.length, servers_connected: cards.filter((c) => c.server.connected && c.server.ok).length, last_sync: new Date().toISOString(), build_ms: ms }
  return { cards, summary }
}
