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
import { campaignsFor } from './ads/campaigns'
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
  ads: { spend7_cents: number; active_campaigns: number; campaigns: number } | null
  action: Action | null
  server: ServerState
}
export type ConsoleSummary = { apps: number; servers_connected: number; last_sync: string }

const NO_SERVER: Record<string, string> = { rolligan: 'No server — store & ads only' }
const CONNECT_HOW: Record<string, string> = {
  yulepick: 'Set YULEPICK_ADMIN_URL (the studio-admin edge function) and YULEPICK_ADMIN_TOKEN on Vercel; the token must match the function’s ADMIN_TOKEN secret.',
  borea: 'Set BOREA_ADMIN_URL (the studio-admin edge function) and BOREA_ADMIN_TOKEN on Vercel; the token must match the function’s ADMIN_TOKEN secret.',
  gagorder: 'Set GAGORDER_ADMIN_URL and GAGORDER_ADMIN_TOKEN on Vercel.',
  jinglewire: 'Jinglewire has no admin endpoint yet (its Supabase project holds no tables to count). Proposal in HANDOFF-console.md.',
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
  const promotions = await rest<Pick<Promotion, 'campaign_id' | 'network' | 'post_id' | 'remote_id'>[]>('studio_promotions?campaign_id=not.is.null&select=campaign_id,network,post_id,remote_id').catch(() => [])
  const cards = await Promise.all(allApps().map(async (def): Promise<ConsoleCard> => {
    const conn = connected.find((c) => c.id === def.id)
    const a = analytics.find((x) => x.id === def.id)
    const [server, store, reviews, camp] = await Promise.all([
      conn ? pullServer(conn) : Promise.resolve<ServerState>({ connected: false, note: NO_SERVER[def.id], connect: NO_SERVER[def.id] ? undefined : CONNECT_HOW[def.id] }),
      a ? fetchAppStoreCached(a.appStoreId) : Promise.resolve(null),
      a ? fetchReviews(a.appStoreId) : Promise.resolve(null),
      campaignsFor(def.id, '7d').catch(() => ({ campaigns: [], errors: [] as string[] })),
    ])
    const last = sum7(store?.series, 0), prev = sum7(store?.series, 7)
    const rows = camp.campaigns
    const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const active = rows.filter((r) => r.status === 'running' || (r.status === undefined && r.daily.some((d) => d.day >= since && d.spend_cents > 0))).length
    let action: Action | null = null
    if (rows.length) {
      const analysis = analyze(rows, new Map(), '7d')
      const [top] = await enrichActions(analysis.actions.slice(0, 1), promotions)
      action = top ?? null
    }
    return {
      id: def.id, name: def.name, accent: def.accent,
      store: a ? { installs7: last.installs, installs_prev7: prev.installs, proceeds7: last.proceeds, proceeds_prev7: prev.proceeds, report_date: store?.reportDate, rating: reviews?.rating ?? null, new_reviews7: reviews?.new7 ?? 0, on_store: !!store } : null,
      ads: { spend7_cents: rows.reduce((t, r) => t + r.spend_cents, 0), active_campaigns: active, campaigns: rows.length },
      action, server,
    }
  }))
  const summary: ConsoleSummary = { apps: cards.length, servers_connected: cards.filter((c) => c.server.connected && c.server.ok).length, last_sync: new Date().toISOString() }
  return { cards, summary }
}
