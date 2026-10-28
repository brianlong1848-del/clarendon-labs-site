// ─── Ad insights: the rules engine (FEAT-CLA-023) ────────────────────────────
//
// Deterministic. Reads the Campaigns rows (src/lib/ads/campaigns.ts) plus,
// when the caller has them, installs / CPI / est. ROAS from Money → Ads, and
// says for every campaign and ad: the funnel numbers (hook, hold, click,
// cost, install, fatigue), a verdict, the one-line reason and the weakest
// stage — judged against (a) the campaign's objective, (b) the median of our
// own campaigns on that platform and (c) the rough platform ranges in BENCH.
// It also lists the concrete actions worth taking this week, ranked. The
// narrative (./narrative.ts) only puts words around these numbers; it never
// changes a verdict. Nothing here spends money or calls a platform.

import type { CampaignAd, CampaignRow, Range } from './campaigns'

export type Stage = 'hook' | 'hold' | 'click' | 'cost' | 'install' | 'fatigue'
export type Verdict = 'too_early' | 'not_delivering' | 'winning' | 'ok' | 'needs_work'
export type Grade = 'good' | 'ok' | 'poor'
export type ObjectiveKind = 'views' | 'traffic' | 'installs'

export type Metrics = {
  spend_cents: number; impressions?: number
  /** 2-second views (TikTok) or plays (Meta) ÷ impressions, 0–1. */
  hook_rate?: number
  /** 15-second views ÷ 2-second views (or plays), 0–1. */
  hold_rate?: number
  ctr?: number; cpc_cents?: number; cpm_cents?: number
  cost_per_view15_cents?: number
  follows_per_dollar?: number
  /** impressions ÷ reach. */
  frequency?: number
  installs?: number; cpi_cents?: number; est_roas?: number; platform_roas?: number
  /** Why CPI / ROAS aren't judged yet ("Installs too few to judge (6 of 20)"). */
  installs_note?: string
  trend?: { ctr_change?: number; frequency_change?: number; days: number; fatigue: boolean }
}

export type Insight = {
  verdict: Verdict
  reason: string
  /** Another campaign on the account already running this post with a traffic / app objective. */
  sibling?: { campaign_id: string; name: string; objective_kind: ObjectiveKind; same_post: boolean }
  weakest?: Stage
  objective_kind: ObjectiveKind
  grades: Partial<Record<Stage, Grade>>
  metrics: Metrics
}

export type ActionKind = 'pause' | 'resume' | 'raise_budget' | 'lower_budget' | 'duplicate_as_traffic' | 'reuse_angle' | 'widen_audience' | 'open_in_manager' | 'creative' | 'wait'
export type Action = {
  id: string
  kind: ActionKind
  platform: 'tiktok' | 'meta'
  campaign_id: string
  app_id: string | null
  campaign_name: string
  promotion_id?: string
  /** Everything the runner needs: the ad account, the ad groups / ads, the post. */
  advertiser_id?: string
  adgroup_ids?: string[]
  ad_ids?: string[]
  /** The post the ads run: TikTok item id / Meta IG media or story id. */
  item_id?: string
  /** The Studio post behind a boost, when there is one. */
  post_id?: string
  manager_url?: string
  title: string
  detail: string
  /** Button text when the action changes an ad; absent = advice only. */
  button?: string
  confirm?: string
  /** For duplicate_as_traffic: the confirm sheet's fields and defaults. */
  confirm_fields?: { budget_cents?: number; pause_original?: boolean }
  /** New daily budget for raise/lower, cents. */
  amount_cents?: number
  /** A link instead of a POST (reuse_angle → /post prefilled, open_in_manager → Ads Manager). */
  href?: string
  /** Small grey note under the button (e.g. "API permission pending"). */
  note?: string
  /** Why the button may fail right now (TikTok scope review). */
  blocked?: string
  /** Already done: by a sibling campaign, logged in studio_ad_actions, or the platform says so (label "Paused ✓"). */
  done?: { at?: string; note: string; label?: string; result_ids?: Record<string, unknown> }
  score: number
}

// ── Platform ranges (one table; edit here) ──────────────────────────────────
//
// good / ok thresholds; below ok is poor. Rates are "higher is better", costs
// "lower is better". Rough industry ranges for short vertical video ads on
// iPhone apps, Oct 2026 — not gospel; our own medians nudge each grade.

type Band = { good: number; ok: number; lower_is_better?: boolean }
export const BENCH: Record<'tiktok' | 'meta', Record<string, Band>> = {
  tiktok: {
    hook_rate: { good: 0.20, ok: 0.10 }, hold_rate: { good: 0.40, ok: 0.25 },
    ctr: { good: 1.0, ok: 0.5 }, cpc_cents: { good: 50, ok: 150, lower_is_better: true }, cpm_cents: { good: 600, ok: 1200, lower_is_better: true },
    cost_per_view15_cents: { good: 5, ok: 12, lower_is_better: true }, cpi_cents: { good: 200, ok: 400, lower_is_better: true },
    est_roas: { good: 1.0, ok: 0.5 }, frequency: { good: 2.0, ok: 3.5, lower_is_better: true },
  },
  meta: {
    hook_rate: { good: 0.35, ok: 0.20 }, hold_rate: { good: 0.30, ok: 0.15 },
    ctr: { good: 1.5, ok: 0.8 }, cpc_cents: { good: 75, ok: 150, lower_is_better: true }, cpm_cents: { good: 1000, ok: 1800, lower_is_better: true },
    cost_per_view15_cents: { good: 8, ok: 20, lower_is_better: true }, cpi_cents: { good: 250, ok: 500, lower_is_better: true },
    est_roas: { good: 1.0, ok: 0.5 }, frequency: { good: 2.0, ok: 3.5, lower_is_better: true },
  },
}
export const TOO_EARLY = { spend_cents: 1000, impressions: 1000 }
/** Stalled: the platform says it's running, it's been live this long, and it still has under this many impressions. */
export const STALLED = { min_age_hours: 24, max_impressions: 100 }
/** Fatigue: CTR down this much (or more) over the last 3 days while frequency rises. */
export const FATIGUE = { ctr_drop: 0.30, days: 3, min_spend_cents: 500 }

export const STAGE_LABEL: Record<Stage, string> = { hook: 'Hook', hold: 'Hold', click: 'Click', cost: 'Cost', install: 'Install', fatigue: 'Fatigue' }
export const VERDICT_LABEL: Record<Verdict, string> = { too_early: 'Too early', not_delivering: 'Not delivering', winning: 'Winning', ok: 'OK', needs_work: 'Needs work' }

// ── Live status ─────────────────────────────────────────────────────────────

export type LiveStatus = 'running' | 'paused' | 'ended' | 'scheduled' | 'in_review' | 'rejected' | 'no_funds' | 'unknown'
/** What the platform says right now (TikTok operation_status / secondary
 *  status, Meta effective_status, normalized by campaigns.ts), with one
 *  refinement: a "running" campaign whose every ad is paused, ended or
 *  rejected isn't delivering either. `budget_spent` counts as running — it
 *  spent its whole budget today. */
export function liveStatus(r: Pick<CampaignRow, 'status' | 'ads'>): LiveStatus {
  const s = r.status
  const word: LiveStatus = s === 'deleted' ? 'ended' : s === 'budget_spent' ? 'running'
    : s === 'running' || s === 'paused' || s === 'ended' || s === 'scheduled' || s === 'in_review' || s === 'rejected' || s === 'no_funds' ? s : 'unknown'
  if (word === 'running' && r.ads.length && r.ads.every((a) => a.status && a.status !== 'running' && a.status !== 'budget_spent' && a.status !== 'unknown')) {
    return r.ads.some((a) => a.status === 'paused') ? 'paused' : r.ads.some((a) => a.status === 'in_review' || a.status === 'scheduled') ? 'scheduled' : 'ended'
  }
  return word
}
/** Platform timestamps → ms. TikTok's create_time is "YYYY-MM-DD HH:MM:SS" (UTC+0); Meta's are ISO with a "-0500"-style offset. */
function parseWhen(s?: string): number | undefined {
  if (!s) return undefined
  const iso = /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2') : `${s.replace(' ', 'T')}Z`
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : undefined
}
/** Hours since delivery was due to begin — the later of created and started. Unknown when neither is known. */
export function liveHours(r: Pick<CampaignRow, 'created' | 'started'>, now = Date.now()): number | undefined {
  const since = [parseWhen(r.created), parseWhen(r.started)].filter((t): t is number => t != null)
  if (!since.length) return undefined
  return (now - Math.max(...since)) / 3600000
}
/** Active for a day or more and still under 100 impressions: the audience is too narrow or the bid can't win. */
export function stalledHours(r: Pick<CampaignRow, 'status' | 'ads' | 'created' | 'started' | 'impressions'>, now = Date.now()): number | undefined {
  if (liveStatus(r) !== 'running') return undefined
  const hours = liveHours(r, now)
  if (hours == null || hours < STALLED.min_age_hours) return undefined
  return (r.impressions ?? 0) < STALLED.max_impressions ? hours : undefined
}

export function objectiveKind(objective?: string): ObjectiveKind {
  const o = (objective ?? '').toUpperCase()
  if (/APP|INSTALL|CONVERSION|SALES|LEAD/.test(o)) return 'installs'
  if (/TRAFFIC|LINK|DOWNLOAD/.test(o)) return 'traffic'
  return 'views'   // VIDEO_VIEWS, REACH, ENGAGEMENT, OUTCOME_AWARENESS, …
}
/** Installs (and so CPI / est. ROAS) count only from this many — under it the stage is "too few to judge". */
export const MIN_INSTALLS = 20
/** The objective's primary stages. Install joins once there are MIN_INSTALLS; app promotion falls back to click + cost until then. */
function primaryStages(kind: ObjectiveKind, platform: 'tiktok' | 'meta', installsJudged: boolean): Stage[] {
  if (kind === 'views') return platform === 'tiktok' ? ['hook', 'hold', 'cost'] : ['cost']
  if (kind === 'traffic') return installsJudged ? ['click', 'cost', 'install'] : ['click', 'cost']
  return installsJudged ? ['install'] : ['click', 'cost']
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export type MoneyFacts = { installs?: number; cpi_cents?: number; est_roas?: number; platform_roas?: number }

const div = (a?: number, b?: number) => (a != null && b != null && b > 0 ? a / b : undefined)
const r2 = (v?: number) => (v == null ? undefined : Math.round(v * 100) / 100)

function metricsOf(r: Pick<CampaignRow, 'spend_cents' | 'impressions' | 'reach' | 'clicks' | 'ctr' | 'cpc_cents' | 'cpm_cents' | 'video_views' | 'views2s' | 'views15s' | 'follows'>, platform: 'tiktok' | 'meta', money?: MoneyFacts): Metrics {
  // Meta's "video_play_actions" and 15-s watched aren't TikTok's 2-s / 15-s views like for like,
  // so hook and hold are TikTok-only until Meta's numbers are mapped (FEAT-CLA-023 fix 2).
  const starts = platform === 'tiktok' ? r.views2s : undefined
  const impressions = r.impressions
  return {
    spend_cents: r.spend_cents, impressions,
    hook_rate: r2(div(starts, impressions)), hold_rate: r2(div(r.views15s, starts)),
    ctr: r.ctr ?? r2((div(r.clicks, impressions) ?? 0) * 100 || undefined),
    cpc_cents: r.cpc_cents ?? (r.clicks ? Math.round(r.spend_cents / r.clicks) : undefined),
    cpm_cents: r.cpm_cents ?? (impressions ? Math.round((r.spend_cents / impressions) * 1000) : undefined),
    cost_per_view15_cents: r.views15s ? Math.round(r.spend_cents / r.views15s) : undefined,
    follows_per_dollar: r.spend_cents >= 100 && r.follows != null ? r2(r.follows / (r.spend_cents / 100)) : undefined,
    frequency: r2(div(impressions, r.reach)),
    installs: money?.installs, cpi_cents: money?.cpi_cents, est_roas: money?.est_roas, platform_roas: money?.platform_roas,
  }
}

/** CTR and frequency, last 3 days vs the 3 before. */
function trendOf(daily: CampaignRow['daily']): Metrics['trend'] | undefined {
  const d = daily.filter((x) => x.impressions != null && x.clicks != null).sort((a, b) => a.day.localeCompare(b.day))
  if (d.length < FATIGUE.days * 2) return d.length ? { days: d.length, fatigue: false } : undefined
  const last = d.slice(-FATIGUE.days), prev = d.slice(-FATIGUE.days * 2, -FATIGUE.days)
  const sum = (xs: typeof d, k: 'impressions' | 'clicks' | 'reach' | 'spend_cents') => xs.reduce((s, x) => s + (x[k] ?? 0), 0)
  const ctr = (xs: typeof d) => div(sum(xs, 'clicks'), sum(xs, 'impressions'))
  const freq = (xs: typeof d) => div(sum(xs, 'impressions'), sum(xs, 'reach'))
  const c0 = ctr(prev), c1 = ctr(last), f0 = freq(prev), f1 = freq(last)
  const ctr_change = c0 && c1 != null ? r2((c1 - c0) / c0) : undefined
  const frequency_change = f0 && f1 != null ? r2((f1 - f0) / f0) : undefined
  const fatigue = ctr_change != null && ctr_change <= -FATIGUE.ctr_drop && (frequency_change ?? 0) > 0 && sum(last, 'spend_cents') >= FATIGUE.min_spend_cents
  return { ctr_change, frequency_change, days: d.length, fatigue }
}

// ── Grading ─────────────────────────────────────────────────────────────────

function grade(v: number | undefined, band?: Band): Grade | undefined {
  if (v == null || !band) return undefined
  if (band.lower_is_better) return v <= band.good ? 'good' : v <= band.ok ? 'ok' : 'poor'
  return v >= band.good ? 'good' : v >= band.ok ? 'ok' : 'poor'
}
const ORDER: Grade[] = ['poor', 'ok', 'good']
const shift = (g: Grade, by: number): Grade => ORDER[Math.max(0, Math.min(2, ORDER.indexOf(g) + by))]
/** Nudge a grade by our own median: half as good as the median → one notch down, 1.5× better → one up. */
function nudge(g: Grade | undefined, v: number | undefined, median: number | undefined, band?: Band): Grade | undefined {
  if (!g || v == null || median == null || median <= 0 || !band) return g
  const better = band.lower_is_better ? v <= median / 1.5 : v >= median * 1.5
  const worse = band.lower_is_better ? v >= median * 2 : v <= median / 2
  return better ? shift(g, 1) : worse ? shift(g, -1) : g
}
function median(xs: number[]): number | undefined {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return undefined
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const usd = (c?: number) => c == null ? '—' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
const pct = (v?: number, digits = 2) => v == null ? '—' : `${v.toFixed(digits)}%`
const rate = (v?: number) => v == null ? '—' : `${Math.round(v * 100)}%`
const PLATFORM_NAME = { tiktok: 'TikTok', meta: 'Meta' }

type Medians = Partial<Record<keyof Metrics, number>>

function judge(m: Metrics, platform: 'tiktok' | 'meta', kind: ObjectiveKind, med: Medians, status?: string, stalled?: number): Insight {
  const bench = BENCH[platform]
  const trend = m.trend
  const grades: Partial<Record<Stage, Grade>> = {}
  const costKey: keyof Metrics = kind === 'views' ? (m.cost_per_view15_cents != null ? 'cost_per_view15_cents' : 'cpm_cents') : 'cpc_cents'
  const costVal = m[costKey] as number | undefined
  if (platform === 'tiktok') grades.hook = nudge(grade(m.hook_rate, bench.hook_rate), m.hook_rate, med.hook_rate, bench.hook_rate)
  if (platform === 'tiktok' && kind === 'views') grades.hold = nudge(grade(m.hold_rate, bench.hold_rate), m.hold_rate, med.hold_rate, bench.hold_rate)
  // Click = the worse of CTR and CPC: a views campaign that nobody taps still "needs work" (Brian's rule).
  const ctrG = nudge(grade(m.ctr, bench.ctr), m.ctr, med.ctr, bench.ctr)
  const cpcG = nudge(grade(m.cpc_cents, bench.cpc_cents), m.cpc_cents, med.cpc_cents, bench.cpc_cents)
  grades.click = ctrG && cpcG ? ORDER[Math.min(ORDER.indexOf(ctrG), ORDER.indexOf(cpcG))] : ctrG ?? cpcG
  grades.cost = nudge(grade(costVal, bench[costKey]), costVal, med[costKey] as number | undefined, bench[costKey])
  // CPI / est. ROAS only count from MIN_INSTALLS; under that they're a note, never a mark against.
  const installsJudged = (m.installs ?? 0) >= MIN_INSTALLS
  if (installsJudged) {
    if (m.cpi_cents != null) grades.install = nudge(grade(m.cpi_cents, bench.cpi_cents), m.cpi_cents, med.cpi_cents, bench.cpi_cents)
    else if (m.est_roas != null) grades.install = grade(m.est_roas, bench.est_roas)
  } else m.installs_note = m.installs ? `Installs too few to judge CPI (${m.installs} of ${MIN_INSTALLS} needed)` : 'Not enough installs yet to judge CPI'
  if (trend && trend.days >= FATIGUE.days * 2) grades.fatigue = trend.fatigue ? 'poor' : (m.frequency != null && m.frequency > bench.frequency.ok ? 'ok' : 'good')
  for (const k of Object.keys(grades) as Stage[]) if (!grades[k]) delete grades[k]

  // Running for a day or more with next to no impressions: not "too early", stuck.
  if (stalled != null) {
    const age = stalled >= 48 ? `${Math.floor(stalled / 24)} days` : `${Math.floor(stalled)} hours`
    return { verdict: 'not_delivering', objective_kind: kind, grades, metrics: m,
      reason: `Not delivering: ${PLATFORM_NAME[platform]} says it's running, it's been live ${age}, and it has ${(m.impressions ?? 0).toLocaleString('en-US')} impressions${m.spend_cents ? ` on ${usd(m.spend_cents)}` : ' and no spend'} — the audience is too narrow or the bid isn't winning auctions.` }
  }
  if (m.spend_cents < TOO_EARLY.spend_cents || (m.impressions ?? 0) < TOO_EARLY.impressions) {
    return { verdict: 'too_early', objective_kind: kind, grades, metrics: m,
      reason: `Too early to judge: ${usd(m.spend_cents)} spent and ${(m.impressions ?? 0).toLocaleString('en-US')} impressions so far (it needs ${usd(TOO_EARLY.spend_cents)} and ${TOO_EARLY.impressions.toLocaleString('en-US')}).` }
  }
  const primaryAll = primaryStages(kind, platform, installsJudged)
  const primary = primaryAll.filter((s) => grades[s])
  const poor = (Object.keys(grades) as Stage[]).filter((s) => grades[s] === 'poor')
  const verdict: Verdict = primary.length && primary.every((s) => grades[s] === 'good') && !poor.length && !trend?.fatigue ? 'winning'
    : primary.some((s) => grades[s] === 'poor') || grades.click === 'poor' || poor.length >= 2 || trend?.fatigue ? 'needs_work' : 'ok'
  const stageOrder: Stage[] = [...primaryAll, 'click', 'cost', 'hook', 'hold', 'install', 'fatigue']
  const ranked = (Object.keys(grades) as Stage[]).sort((a, b) => ORDER.indexOf(grades[a]!) - ORDER.indexOf(grades[b]!) || stageOrder.indexOf(a) - stageOrder.indexOf(b))
  const weakest = ranked[0]

  const describe = (s: Stage): string => {
    const own = (k: keyof Metrics, f: (v: number) => string) => (med[k] != null ? `, our median ${f(med[k]!)}` : '')
    switch (s) {
      case 'hook': return `hook rate ${rate(m.hook_rate)} (${PLATFORM_NAME[platform]} range ${rate(bench.hook_rate.ok)}–${rate(bench.hook_rate.good)}+${own('hook_rate', rate)})`
      case 'hold': return `hold rate ${rate(m.hold_rate)} (range ${rate(bench.hold_rate.ok)}–${rate(bench.hold_rate.good)}+${own('hold_rate', rate)})`
      case 'click': return `CTR ${pct(m.ctr)} (range ${pct(bench.ctr.ok, 1)}–${pct(bench.ctr.good, 1)}+${own('ctr', (v) => pct(v))})${m.cpc_cents != null && kind === 'views' ? ` and CPC ${usd(m.cpc_cents)} (range ${usd(bench.cpc_cents.good)}–${usd(bench.cpc_cents.ok)}${own('cpc_cents', usd)})` : ''}`
      case 'cost': return costKey === 'cpc_cents' ? `CPC ${usd(m.cpc_cents)} (range ${usd(bench.cpc_cents.good)}–${usd(bench.cpc_cents.ok)}${own('cpc_cents', usd)})`
        : costKey === 'cost_per_view15_cents' ? `cost per 15-s view ${usd(m.cost_per_view15_cents)} (range ${usd(bench.cost_per_view15_cents.good)}–${usd(bench.cost_per_view15_cents.ok)}${own('cost_per_view15_cents', usd)})`
        : `CPM ${usd(m.cpm_cents)} (range ${usd(bench.cpm_cents.good)}–${usd(bench.cpm_cents.ok)}${own('cpm_cents', usd)})`
      case 'install': return m.cpi_cents != null ? `cost per install ${usd(m.cpi_cents)} over ${m.installs} installs (range ${usd(bench.cpi_cents.good)}–${usd(bench.cpi_cents.ok)})` : `est. ROAS ${m.est_roas?.toFixed(2)}×`
      case 'fatigue': return trend?.fatigue ? `CTR down ${Math.round(Math.abs(trend.ctr_change ?? 0) * 100)}% over ${FATIGUE.days} days while frequency rose ${Math.round((trend.frequency_change ?? 0) * 100)}% (now ${m.frequency?.toFixed(1)}×)` : `frequency ${m.frequency?.toFixed(1)}×`
    }
  }
  const objectiveWord = kind === 'views' ? 'video views' : kind === 'traffic' ? 'traffic' : 'app promotion'
  let reason: string
  if (verdict === 'winning') reason = `${primary.map(describe).join(' and ')} beat ${PLATFORM_NAME[platform]}'s range for ${objectiveWord}.`
  else if (verdict === 'needs_work') {
    const worst = ranked.filter((s) => grades[s] === 'poor').slice(0, 2)
    const plural = worst.length > 1 || (worst[0] === 'click' && kind === 'views' && m.cpc_cents != null)
    reason = `${worst.map(describe).join(' and ')} ${plural ? 'are' : 'is'} under ${PLATFORM_NAME[platform]}'s range${kind === 'views' && worst.every((s) => s === 'click') ? ' — a views campaign has no button, so if taps are the point run it as Traffic' : ''}.`
  } else reason = `${(ranked.slice(0, 2)).map(describe).join('; ')} — inside the range, not ahead of it.`
  if (m.installs_note && kind !== 'views') reason += ` ${m.installs_note}.`
  if (status === 'paused') reason += ' (Paused.)'
  if (status === 'ended') reason += ' (Ended.)'
  return { verdict, reason, weakest, objective_kind: kind, grades, metrics: m }
}

// ── Public entry ────────────────────────────────────────────────────────────

export type Analysis = {
  /** Keyed "platform:campaign_id". */
  campaigns: Record<string, Insight>
  /** Keyed "platform:campaign_id:ad_id". */
  ads: Record<string, Insight>
  actions: Action[]
}

export function analyze(rows: CampaignRow[], money: Map<string, MoneyFacts> = new Map(), range: Range = '30d'): Analysis {
  const base = rows.map((r) => ({ r, m: { ...metricsOf(r, r.platform, money.get(`${r.platform}:${r.campaign_id}`)), trend: trendOf(r.daily) } as Metrics, kind: objectiveKind(r.objective) }))
  // Our own medians per platform, over campaigns past the too-early line.
  const med: Record<'tiktok' | 'meta', Medians> = { tiktok: {}, meta: {} }
  for (const platform of ['tiktok', 'meta'] as const) {
    const mature = base.filter((b) => b.r.platform === platform && b.m.spend_cents >= TOO_EARLY.spend_cents && (b.m.impressions ?? 0) >= TOO_EARLY.impressions)
    if (mature.length < 2) continue
    for (const k of ['hook_rate', 'hold_rate', 'ctr', 'cpc_cents', 'cpm_cents', 'cost_per_view15_cents', 'cpi_cents'] as const) {
      med[platform][k] = median(mature.map((b) => b.m[k]).filter((v): v is number => v != null))
    }
  }
  const campaigns: Record<string, Insight> = {}
  const ads: Record<string, Insight> = {}
  const actions: Action[] = []
  for (const { r, m, kind } of base) {
    const key = `${r.platform}:${r.campaign_id}`
    const insight = judge(m, r.platform, kind, med[r.platform], liveStatus(r), stalledHours(r))
    insight.sibling = siblingOf(r, rows)
    campaigns[key] = insight
    for (const a of r.ads) {
      const am: Metrics = { ...metricsOf(adAsRow(a), r.platform), trend: undefined }
      ads[`${key}:${a.ad_id}`] = judge(am, r.platform, kind, med[r.platform], a.status)
    }
    actions.push(...actionsFor(r, insight, range))
  }
  actions.sort((a, b) => b.score - a.score)
  // One Pause per app per week, unless a second campaign is clearly wasting money.
  const pausedApps = new Set<string>()
  const kept = actions.filter((a) => {
    if (a.kind !== 'pause' || a.done) return true
    const app = a.app_id ?? 'shared'
    const i = campaigns[`${a.platform}:${a.campaign_id}`]
    const wasted = i.metrics.spend_cents >= 5000 && i.grades.click === 'poor' && (i.metrics.ctr ?? 0) < 0.3
    if (pausedApps.has(app) && !wasted) return false
    pausedApps.add(app)
    return true
  })
  return { campaigns, ads, actions: kept.slice(0, 5) }
}

/** The posts a campaign's ads run (TikTok item ids / Meta post ids), when known. */
const postsOf = (r: CampaignRow) => new Set([...r.ads.map((a) => a.item_id).filter((x): x is string => !!x)])
/** A traffic / app-promotion campaign on the same account that already runs this
 *  campaign's post — "Duplicate as Traffic" is then done. When post ids aren't
 *  readable yet (TikTok scope), a Traffic campaign on the same app counts as a
 *  likely sibling and says so. */
export function siblingOf(r: CampaignRow, rows: CampaignRow[]): Insight['sibling'] {
  if (objectiveKind(r.objective) !== 'views') return undefined
  const mine = postsOf(r)
  const others = rows.filter((o) => o !== r && o.platform === r.platform && o.app_id === r.app_id && objectiveKind(o.objective) !== 'views')
  const exact = others.find((o) => { const theirs = postsOf(o); return [...mine].some((p) => theirs.has(p)) })
  if (exact) return { campaign_id: exact.campaign_id, name: exact.name, objective_kind: objectiveKind(exact.objective), same_post: true }
  if (!mine.size) {
    const likely = others.find((o) => /traffic|download/i.test(o.name) && (!o.created || !r.created || o.created >= r.created))
    if (likely) return { campaign_id: likely.campaign_id, name: likely.name, objective_kind: objectiveKind(likely.objective), same_post: false }
  }
  return undefined
}

const adAsRow = (a: CampaignAd) => ({ spend_cents: a.spend_cents, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, cpc_cents: a.cpc_cents, views15s: a.views15s, follows: a.follows,
  reach: undefined, cpm_cents: undefined, video_views: undefined, views2s: undefined })

const TIKTOK_WRITE_NOTE = 'TikTok writes answer 40001 until TikTok approves the Ads Management scope (requested 2026-10-27) — the button will say so if it fails.'
const KIND_BONUS: Record<ActionKind, number> = { pause: 50, raise_budget: 40, widen_audience: 35, duplicate_as_traffic: 30, resume: 20, lower_budget: 20, reuse_angle: 15, creative: 10, open_in_manager: 5, wait: 0 }

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Still spending: the platform says it's running (or can't say) and money
 *  went out in the last two days. A paused, ended or scheduled campaign is
 *  never "spending now", whatever yesterday's spend was. */
function spendingNow(r: CampaignRow): boolean {
  const s = liveStatus(r)
  if (s !== 'running' && s !== 'unknown') return false
  if (!r.daily.length) return r.spend_cents > 0
  const since = dayKey(new Date(Date.now() - 2 * 86400000))
  return r.daily.some((d) => d.day >= since && d.spend_cents > 0)
}
/** Meta's Ads Manager URL for the campaign's ad sets (the campaign row links to the campaigns view). */
const adSetsUrl = (url?: string) => url?.replace('/manage/campaigns?', '/manage/adsets?')
/** Money at stake for the next week, cents: the daily budget, else the average of the last 7 spending days. */
function stakeCents(r: CampaignRow): number {
  if (r.budget_daily_cents) return r.budget_daily_cents * 7
  const last = r.daily.slice(-7)
  const avg = last.length ? last.reduce((s, d) => s + d.spend_cents, 0) / last.length : 0
  return Math.round(avg * 7)
}

function actionsFor(r: CampaignRow, i: Insight, range: Range): Action[] {
  const out: Action[] = []
  const name = r.name
  const status = liveStatus(r)
  const live = spendingNow(r)
  // Over: the platform says ended / rejected, or it spent and then stopped on its own (an ad group past its schedule).
  // A campaign that never spent isn't over — it's stuck (not_delivering), and gets its action below.
  const ended = status === 'ended' || status === 'rejected' || (!live && r.spend_cents > 0 && r.daily.length > 0 && status !== 'paused' && status !== 'scheduled' && status !== 'in_review')
  if (ended) return out   // nothing to do on a campaign that's over
  const stake = stakeCents(r)
  const score = (kind: ActionKind) => stake / 100 + KIND_BONUS[kind]
  const base = { platform: r.platform, campaign_id: r.campaign_id, app_id: r.app_id, campaign_name: name, promotion_id: r.promotion_id,
    adgroup_ids: Array.from(new Set(r.ads.map((a) => a.adgroup_id).filter((x): x is string => !!x))), ad_ids: r.ads.map((a) => a.ad_id),
    item_id: r.ads.map((a) => a.item_id).find((x): x is string => !!x), manager_url: r.url }
  const blocked = r.platform === 'tiktok' ? TIKTOK_WRITE_NOTE : undefined
  const id = (kind: ActionKind) => `${kind}:${r.platform}:${r.campaign_id}`

  if (i.verdict === 'needs_work' && live) {
    const fatigue = i.weakest === 'fatigue'
    // Status unreadable (TikTok scope pending, no Studio record): the spend says it's live, but Brian may have paused it in Ads Manager.
    const unsure = status === 'unknown' ? ' Its status isn’t readable yet — skip this if you already paused it in Ads Manager.' : ''
    out.push({ ...base, id: id('pause'), kind: 'pause', title: `Pause ${name}`, button: 'Pause', blocked, score: score('pause') + (fatigue ? 5 : 0),
      detail: (fatigue ? `${i.reason} Pause it and swap the creative before spending more.` : `${i.reason} Pause it while the creative or targeting changes.`) + unsure,
      confirm: `Pause "${name}"? It stops delivering until you resume it (here or in Ads Manager). Spend to date stays.` })
  }
  if (i.verdict === 'winning' && live) {
    const current = r.budget_daily_cents
    const next = current ? Math.round(current * 1.25) : undefined
    out.push({ ...base, id: id('raise_budget'), kind: 'raise_budget', title: `Raise ${name} by 25%`, button: current ? `Raise to ${usd(next)}/day` : 'Raise budget 25%', amount_cents: next, blocked, score: score('raise_budget'),
      detail: `${i.reason} Give it more room: ${current ? `${usd(current)} → ${usd(next)} a day` : '+25% a day'}, then re-check in 3 days.`,
      confirm: `Raise "${name}" to ${current ? `${usd(next)} a day` : "125% of today’s daily budget"}? This spends more from tomorrow.` })
    if (i.objective_kind !== 'views') {
      // "It converts" only when the installs are there to prove it (MIN_INSTALLS); before that it's a cheap-clicks winner.
      const m = i.metrics
      const converts = (m.installs ?? 0) >= MIN_INSTALLS
      const lead = converts ? `It converts: ${m.installs} installs${m.cpi_cents != null ? ` at ${usd(m.cpi_cents)} each` : ''}.`
        : `It gets cheap clicks (CTR ${pct(m.ctr)}, CPC ${usd(m.cpc_cents)})${m.installs ? ` — ${m.installs} installs so far, under the ${MIN_INSTALLS} needed to call it converting` : ' — installs aren’t visible yet, so it isn’t proven to convert'}.`
      out.push({ ...base, id: id('reuse_angle'), kind: 'reuse_angle', title: `Reuse ${name}’s angle`, button: 'Open in Post', score: score('reuse_angle'),
        detail: `${lead} Open Post with this ad’s hook and media prefilled, cut it for the other cuts / countries, and try it on the apps whose audience overlaps.` })
    }
  }
  // Running for a day or more with next to no impressions: widen the audience (TikTok: in Ads Manager until the API scope clears).
  if (i.verdict === 'not_delivering') {
    const tiktok = r.platform === 'tiktok'
    const parents = r.app_id === 'jinglewire' ? ' Jinglewire stays parents-only (25+, no interest or behaviour targeting) — widen by country or age within that, never toward kids.' : ''
    out.push({ ...base, id: id('widen_audience'), kind: 'widen_audience', title: `Widen ${name}’s audience`, button: tiktok ? 'Open ad group' : 'Open ad set', href: tiktok ? r.url : adSetsUrl(r.url), score: score('widen_audience'),
      detail: `${i.reason} Open the ${tiktok ? 'ad group' : 'ad set'} and widen it: drop an interest layer, add a country or age band, or let the platform's automatic targeting run; check the bid / budget floor too.${parents} Check back tomorrow — it should have thousands of impressions by then.`,
      note: tiktok ? 'Targeting edits through the API wait on TikTok’s Ads Management scope (requested 2026-10-27) — widen it in Ads Manager for now.' : undefined })
  }
  // A weak views campaign: the clip holds attention but buys no taps — run it as Traffic with a Download button.
  if (i.objective_kind === 'views' && (i.verdict === 'needs_work' || (i.verdict === 'ok' && i.grades.click !== 'good'))) {
    const sib = i.sibling
    const meta = r.platform === 'meta' && !r.promotion_id
    out.push({ ...base, id: id('duplicate_as_traffic'), kind: 'duplicate_as_traffic', title: `Duplicate ${name} as Traffic`,
      button: meta ? undefined : 'Duplicate as Traffic', blocked: r.platform === 'tiktok' ? blocked : undefined,
      score: sib ? 1 : score('duplicate_as_traffic'),
      confirm_fields: { budget_cents: Math.max(2000, r.budget_daily_cents ?? 2000), pause_original: true },
      detail: `${i.metrics.hold_rate != null ? `People watch (hold ${rate(i.metrics.hold_rate)}) but don’t tap (CTR ${pct(i.metrics.ctr)}, CPC ${usd(i.metrics.cpc_cents)}). ` : ''}A views campaign has no button. Run the same post and audience as a Traffic campaign with a single Download button to clarendon.dev/get/<app>?ct=…${meta ? ' This Meta campaign wasn’t made in Studio — duplicate it in Ads Manager (or boost the post from Post → Queue as Downloads).' : ''}`,
      confirm: meta ? undefined : `Create a Traffic copy of "${name}" (same post, same audience) with a Download button? It starts delivering at the budget below.`,
      done: sib ? { note: sib.same_post ? `Done ✓ — ${sib.name} already runs this post as ${sib.objective_kind === 'traffic' ? 'Traffic' : 'App promotion'}.` : `Done ✓ (likely) — ${sib.name} is a Traffic campaign on this account; confirm it uses the same post in Ads Manager.` } : undefined })
  }
  if (i.verdict === 'needs_work' && i.weakest === 'hook') out.push({ ...base, id: id('creative'), kind: 'creative', title: `New first line for ${name}`, score: score('creative') + 8,
    detail: `Hook rate ${rate(i.metrics.hook_rate)}: the first second isn’t stopping the scroll. Re-cut with the loudest moment first and the text inside the safe box (FEAT-CLA-020).` })
  if (i.verdict === 'ok' && i.weakest && i.weakest !== 'fatigue' && live && !(i.objective_kind === 'views' && i.grades.click !== 'good')) out.push({ ...base, id: id('creative'), kind: 'creative', title: `${name}: lift the ${STAGE_LABEL[i.weakest].toLowerCase()} stage`, score: score('creative'),
    detail: `${i.reason} One change at a time: ${i.weakest === 'hook' ? 'a new first line' : i.weakest === 'hold' ? 'cut the middle, get to the payoff sooner' : i.weakest === 'click' ? 'a clearer reason to tap in the caption / CTA' : i.weakest === 'cost' ? 'narrow the audience or lower the budget until the cost settles' : 'check installs attribution'}.` })
  if (i.verdict === 'too_early' && live) out.push({ ...base, id: id('wait'), kind: 'wait', title: `Let ${name} run`, score: score('wait'), detail: i.reason })
  // Already paused on the platform: no Pause button — "Paused ✓" and the fix to make before resuming.
  if (i.verdict === 'needs_work' && status === 'paused') out.push({ ...base, id: id('pause'), kind: 'pause', title: `Pause ${name}`, score: KIND_BONUS.creative,
    detail: `${i.reason} Resume only with a new cut or audience.`,
    done: { label: 'Paused ✓', note: `Paused ✓ — ${PLATFORM_NAME[r.platform]} says it’s already paused; nothing is spending.` } })
  void range
  return out
}
