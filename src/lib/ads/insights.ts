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
export type Verdict = 'too_early' | 'winning' | 'ok' | 'needs_work'
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
  trend?: { ctr_change?: number; frequency_change?: number; days: number; fatigue: boolean }
}

export type Insight = {
  verdict: Verdict
  reason: string
  weakest?: Stage
  objective_kind: ObjectiveKind
  grades: Partial<Record<Stage, Grade>>
  metrics: Metrics
}

export type ActionKind = 'pause' | 'resume' | 'raise_budget' | 'lower_budget' | 'duplicate_traffic' | 'creative' | 'wait'
export type Action = {
  id: string
  kind: ActionKind
  platform: 'tiktok' | 'meta'
  campaign_id: string
  app_id: string | null
  campaign_name: string
  promotion_id?: string
  title: string
  detail: string
  /** Button text when the action changes an ad; absent = advice only. */
  button?: string
  confirm?: string
  /** New daily budget for raise/lower, cents. */
  amount_cents?: number
  /** Why the button may fail right now (TikTok scope review). */
  blocked?: string
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
/** Fatigue: CTR down this much (or more) over the last 3 days while frequency rises. */
export const FATIGUE = { ctr_drop: 0.30, days: 3, min_spend_cents: 500 }

export const STAGE_LABEL: Record<Stage, string> = { hook: 'Hook', hold: 'Hold', click: 'Click', cost: 'Cost', install: 'Install', fatigue: 'Fatigue' }
export const VERDICT_LABEL: Record<Verdict, string> = { too_early: 'Too early', winning: 'Winning', ok: 'OK', needs_work: 'Needs work' }

export function objectiveKind(objective?: string): ObjectiveKind {
  const o = (objective ?? '').toUpperCase()
  if (/APP|INSTALL|CONVERSION|SALES|LEAD/.test(o)) return 'installs'
  if (/TRAFFIC|LINK|DOWNLOAD/.test(o)) return 'traffic'
  return 'views'   // VIDEO_VIEWS, REACH, ENGAGEMENT, OUTCOME_AWARENESS, …
}
const PRIMARY: Record<ObjectiveKind, Stage[]> = { views: ['hook', 'hold', 'cost'], traffic: ['click', 'cost'], installs: ['click', 'cost', 'install'] }

// ── Numbers ─────────────────────────────────────────────────────────────────

export type MoneyFacts = { installs?: number; cpi_cents?: number; est_roas?: number; platform_roas?: number }

const div = (a?: number, b?: number) => (a != null && b != null && b > 0 ? a / b : undefined)
const r2 = (v?: number) => (v == null ? undefined : Math.round(v * 100) / 100)

function metricsOf(r: Pick<CampaignRow, 'spend_cents' | 'impressions' | 'reach' | 'clicks' | 'ctr' | 'cpc_cents' | 'cpm_cents' | 'video_views' | 'views2s' | 'views15s' | 'follows'>, platform: 'tiktok' | 'meta', money?: MoneyFacts): Metrics {
  const starts = r.views2s ?? (platform === 'meta' ? r.video_views : undefined)
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

function judge(m: Metrics, platform: 'tiktok' | 'meta', kind: ObjectiveKind, med: Medians, status?: string): Insight {
  const bench = BENCH[platform]
  const trend = m.trend
  const grades: Partial<Record<Stage, Grade>> = {}
  const costKey: keyof Metrics = kind === 'views' ? (m.cost_per_view15_cents != null ? 'cost_per_view15_cents' : 'cpm_cents') : 'cpc_cents'
  const costVal = m[costKey] as number | undefined
  grades.hook = nudge(grade(m.hook_rate, bench.hook_rate), m.hook_rate, med.hook_rate, bench.hook_rate)
  grades.hold = nudge(grade(m.hold_rate, bench.hold_rate), m.hold_rate, med.hold_rate, bench.hold_rate)
  // Click = the worse of CTR and CPC: a views campaign that nobody taps still "needs work" (Brian's rule).
  const ctrG = nudge(grade(m.ctr, bench.ctr), m.ctr, med.ctr, bench.ctr)
  const cpcG = nudge(grade(m.cpc_cents, bench.cpc_cents), m.cpc_cents, med.cpc_cents, bench.cpc_cents)
  grades.click = ctrG && cpcG ? ORDER[Math.min(ORDER.indexOf(ctrG), ORDER.indexOf(cpcG))] : ctrG ?? cpcG
  grades.cost = nudge(grade(costVal, bench[costKey]), costVal, med[costKey] as number | undefined, bench[costKey])
  if (m.cpi_cents != null) grades.install = nudge(grade(m.cpi_cents, bench.cpi_cents), m.cpi_cents, med.cpi_cents, bench.cpi_cents)
  else if (m.est_roas != null) grades.install = grade(m.est_roas, bench.est_roas)
  if (trend && trend.days >= FATIGUE.days * 2) grades.fatigue = trend.fatigue ? 'poor' : (m.frequency != null && m.frequency > bench.frequency.ok ? 'ok' : 'good')
  for (const k of Object.keys(grades) as Stage[]) if (!grades[k]) delete grades[k]

  if (m.spend_cents < TOO_EARLY.spend_cents || (m.impressions ?? 0) < TOO_EARLY.impressions) {
    return { verdict: 'too_early', objective_kind: kind, grades, metrics: m,
      reason: `Too early to judge: ${usd(m.spend_cents)} spent and ${(m.impressions ?? 0).toLocaleString('en-US')} impressions so far (it needs ${usd(TOO_EARLY.spend_cents)} and ${TOO_EARLY.impressions.toLocaleString('en-US')}).` }
  }
  const primary = PRIMARY[kind].filter((s) => grades[s])
  const poor = (Object.keys(grades) as Stage[]).filter((s) => grades[s] === 'poor')
  const verdict: Verdict = primary.length && primary.every((s) => grades[s] === 'good') && !poor.length && !trend?.fatigue ? 'winning'
    : primary.some((s) => grades[s] === 'poor') || grades.click === 'poor' || poor.length >= 2 || trend?.fatigue ? 'needs_work' : 'ok'
  const stageOrder: Stage[] = [...PRIMARY[kind], 'hook', 'hold', 'click', 'cost', 'install', 'fatigue']
  const ranked = (Object.keys(grades) as Stage[]).sort((a, b) => ORDER.indexOf(grades[a]!) - ORDER.indexOf(grades[b]!) || stageOrder.indexOf(a) - stageOrder.indexOf(b))
  const weakest = ranked[0]

  const describe = (s: Stage): string => {
    const own = (k: keyof Metrics, f: (v: number) => string) => (med[k] != null ? `, our median ${f(med[k]!)}` : '')
    switch (s) {
      case 'hook': return `hook rate ${rate(m.hook_rate)} (${PLATFORM_NAME[platform]} range ${rate(bench.hook_rate.ok)}–${rate(bench.hook_rate.good)}+${own('hook_rate', rate)})`
      case 'hold': return `hold rate ${rate(m.hold_rate)} (range ${rate(bench.hold_rate.ok)}–${rate(bench.hold_rate.good)}+${own('hold_rate', rate)})`
      case 'click': return `CTR ${pct(m.ctr)} (range ${pct(bench.ctr.ok, 1)}–${pct(bench.ctr.good, 1)}+${own('ctr', (v) => pct(v))})${m.cpc_cents != null && kind !== 'traffic' && kind !== 'installs' ? ` and CPC ${usd(m.cpc_cents)} (range ${usd(bench.cpc_cents.good)}–${usd(bench.cpc_cents.ok)}${own('cpc_cents', usd)})` : ''}`
      case 'cost': return costKey === 'cpc_cents' ? `CPC ${usd(m.cpc_cents)} (range ${usd(bench.cpc_cents.good)}–${usd(bench.cpc_cents.ok)}${own('cpc_cents', usd)})`
        : costKey === 'cost_per_view15_cents' ? `cost per 15-s view ${usd(m.cost_per_view15_cents)} (range ${usd(bench.cost_per_view15_cents.good)}–${usd(bench.cost_per_view15_cents.ok)}${own('cost_per_view15_cents', usd)})`
        : `CPM ${usd(m.cpm_cents)} (range ${usd(bench.cpm_cents.good)}–${usd(bench.cpm_cents.ok)}${own('cpm_cents', usd)})`
      case 'install': return m.cpi_cents != null ? `cost per install ${usd(m.cpi_cents)} (range ${usd(bench.cpi_cents.good)}–${usd(bench.cpi_cents.ok)})` : `est. ROAS ${m.est_roas?.toFixed(2)}×`
      case 'fatigue': return trend?.fatigue ? `CTR down ${Math.round(Math.abs(trend.ctr_change ?? 0) * 100)}% over ${FATIGUE.days} days while frequency rose ${Math.round((trend.frequency_change ?? 0) * 100)}% (now ${m.frequency?.toFixed(1)}×)` : `frequency ${m.frequency?.toFixed(1)}×`
    }
  }
  const objectiveWord = kind === 'views' ? 'video views' : kind === 'traffic' ? 'traffic' : 'app promotion'
  let reason: string
  if (verdict === 'winning') reason = `${primary.map(describe).join(' and ')} beat ${PLATFORM_NAME[platform]}'s range for ${objectiveWord}.`
  else if (verdict === 'needs_work') {
    const worst = ranked.filter((s) => grades[s] === 'poor').slice(0, 2)
    reason = `${worst.map(describe).join(' and ')} ${worst.length > 1 ? 'are' : 'is'} under ${PLATFORM_NAME[platform]}'s range${kind === 'views' && worst.every((s) => s === 'click' || s === 'cost') ? ' — fine for a views objective only if nobody is meant to tap' : ''}.`
  } else reason = `${(ranked.slice(0, 2)).map(describe).join('; ')} — inside the range, not ahead of it.`
  if (status === 'paused') reason += ' (Paused.)'
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
    const insight = judge(m, r.platform, kind, med[r.platform], r.status)
    campaigns[key] = insight
    for (const a of r.ads) {
      const am: Metrics = { ...metricsOf(adAsRow(a), r.platform), trend: undefined }
      ads[`${key}:${a.ad_id}`] = judge(am, r.platform, kind, med[r.platform], a.status)
    }
    actions.push(...actionsFor(r, insight, range))
  }
  actions.sort((a, b) => b.score - a.score)
  return { campaigns, ads, actions: actions.slice(0, 5) }
}

const adAsRow = (a: CampaignAd) => ({ spend_cents: a.spend_cents, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, cpc_cents: a.cpc_cents, views15s: a.views15s, follows: a.follows,
  reach: undefined, cpm_cents: undefined, video_views: undefined, views2s: undefined })

const TIKTOK_WRITE_NOTE = 'TikTok writes answer 40001 until TikTok approves the Ads Management scope (requested 2026-10-27) — the button will say so if it fails.'

function actionsFor(r: CampaignRow, i: Insight, range: Range): Action[] {
  const out: Action[] = []
  const name = r.name
  const live = r.status === 'running' || r.status === undefined
  const spendWeight = Math.min(30, (r.budget_daily_cents ?? r.spend_cents / 7) / 100)
  const base = { platform: r.platform, campaign_id: r.campaign_id, app_id: r.app_id, campaign_name: name, promotion_id: r.promotion_id }
  const blocked = r.platform === 'tiktok' ? TIKTOK_WRITE_NOTE : undefined
  const id = (kind: ActionKind) => `${kind}:${r.platform}:${r.campaign_id}`
  if (i.verdict === 'needs_work' && live && r.status !== 'paused' && r.status !== 'ended') {
    const fatigue = i.weakest === 'fatigue'
    out.push({ ...base, id: id('pause'), kind: 'pause', title: `Pause ${name}`, button: 'Pause', blocked, score: 80 + spendWeight + (fatigue ? 5 : 0),
      detail: fatigue ? `${i.reason} Pause it and swap the creative before spending more.` : `${i.reason} Pause it while the creative or targeting changes.`,
      confirm: `Pause "${name}"? It stops delivering until you resume it (here or in Ads Manager). Spend to date stays.` })
  }
  if (i.verdict === 'winning' && live && r.status !== 'paused') {
    const current = r.budget_daily_cents
    const next = current ? Math.round(current * 1.25) : undefined
    out.push({ ...base, id: id('raise_budget'), kind: 'raise_budget', title: `Raise ${name} by 25%`, button: current ? `Raise to ${usd(next)}/day` : 'Raise budget 25%', amount_cents: next, blocked, score: 70 + spendWeight,
      detail: `${i.reason} Give it more room: ${current ? `${usd(current)} → ${usd(next)} a day` : '+25% a day'}, then re-check in 3 days.`,
      confirm: `Raise "${name}" to ${current ? `${usd(next)} a day` : "125% of today’s daily budget"}? This spends more from tomorrow.` })
    if (i.objective_kind === 'views' && r.promotion_id) {
      out.push({ ...base, id: id('duplicate_traffic'), kind: 'duplicate_traffic', title: `Duplicate ${name} as Traffic`, button: 'Duplicate as Traffic (paused)', blocked, score: 60 + spendWeight,
        detail: 'The hook holds; add a Download button by running the same post and audience as a Traffic campaign to /get/<app>?ct=. Created paused — you switch it on.',
        confirm: `Create a paused Traffic copy of "${name}" with the same post, audience and daily budget? Nothing spends until you resume it.` })
    }
    if (i.objective_kind !== 'views') out.push({ ...base, id: id('creative'), kind: 'creative', title: `Reuse ${name}'s angle`, score: 45 + spendWeight / 2,
      detail: 'It converts. Cut the same hook for the other cuts / countries, and try it on the other apps whose audience overlaps.' })
  }
  if (i.verdict === 'needs_work' && i.weakest === 'hook') out.push({ ...base, id: id('creative'), kind: 'creative', title: `New first line for ${name}`, score: 55 + spendWeight / 2,
    detail: `Hook rate ${rate(i.metrics.hook_rate)}: the first second isn't stopping the scroll. Re-cut with the loudest moment first and the text inside the safe box (FEAT-CLA-020).` })
  if (i.verdict === 'needs_work' && (i.weakest === 'click' || i.weakest === 'cost') && i.objective_kind === 'views') out.push({ ...base, id: id('creative'), kind: 'creative', title: `${name}: views are fine, taps aren't`, score: 50 + spendWeight / 2,
    detail: `People watch (hold ${rate(i.metrics.hold_rate)}) but don't tap (CTR ${pct(i.metrics.ctr)}, CPC ${usd(i.metrics.cpc_cents)}). A views campaign has no button — if you want installs, run it as Traffic with a Download button instead of paying for views.` })
  if (i.verdict === 'ok' && i.weakest && i.weakest !== 'fatigue' && live) out.push({ ...base, id: id('creative'), kind: 'creative', title: `${name}: lift the ${STAGE_LABEL[i.weakest].toLowerCase()} stage`, score: 30 + spendWeight / 2,
    detail: `${i.reason} One change at a time: ${i.weakest === 'hook' ? 'a new first line' : i.weakest === 'hold' ? 'cut the middle, get to the payoff sooner' : i.weakest === 'click' ? 'a clearer reason to tap in the caption / CTA' : i.weakest === 'cost' ? 'narrow the audience or lower the budget until the cost settles' : 'check installs attribution'}.` })
  if (i.verdict === 'too_early' && live && r.spend_cents > 0) out.push({ ...base, id: id('wait'), kind: 'wait', title: `Let ${name} run`, score: 10 + spendWeight / 4,
    detail: i.reason })
  if (i.verdict === 'needs_work' && r.status === 'paused') out.push({ ...base, id: id('creative'), kind: 'creative', title: `${name} is paused — fix before resuming`, score: 35,
    detail: `${i.reason} Resume only with a new cut or audience.` })
  void range
  return out
}
