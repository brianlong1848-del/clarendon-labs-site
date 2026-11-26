// ─── Ads strategy layer (Money → Ads, 2026-11-14) ────────────────────────────
//
// Client-safe. Mirrors Drive `Project Instructions/Clarendon-revenue-strategy.md`
// (master project owns that file; change this const when it changes):
// ALL paid ads are paused on purpose since 2026-11-12 until each app's gate
// passes — (1) the first minute is fixed and live in the stores, (2) at least
// 1 in 5 new installs reach the scoreboard's first step over 7 days, (3) Brian
// approves a daily budget. The rules engine (./insights.ts) reads `adsState`:
// a paused app only gets "Leave off" / "Delete dead campaign" / "Reuse this
// creative organically" (and Pause, if something is somehow still spending) —
// never anything that invites spend.

export type AdsState = 'paused' | 'gated' | 'live'
export type GateStepState = 'done' | 'todo' | 'not_measured'
export type GateStep = { label: string; state: GateStepState; value?: string; note?: string }
export type AppStrategy = {
  app_slug: string
  name: string
  ads_state: AdsState
  /** ISO day the state began. */
  since?: string
  /** One line: why it's in this state. */
  note: string
  /** The scoreboard: what to judge spend by (never views, clicks or installs). */
  scoreboard: { label: string; count: number | null; note?: string }
  /** The three-step gate before ad money turns back on. */
  gate: GateStep[]
  /**
   * A dated live test Brian approved. Between `from` (inclusive) and `until`
   * (exclusive) — ISO instants, so the edges land on Central-time midnights —
   * the app reads as 'live' with this `since`/`note` and the budget step done;
   * outside it, the entry's own fields. After `until` it reads as paused again
   * (since `until`'s day, with `after_note`) with no redeploy needed.
   */
  live_test?: { from: string; until: string; since: string; note: string; after_note: string }
}

export const PAUSED_SINCE = '2026-11-12'

const NOT_MEASURED = 'Not measured yet — the app doesn’t write this to app_events.'

export const STRATEGY: AppStrategy[] = [
  {
    app_slug: 'yulepick', name: 'YulePick', ads_state: 'live', since: '2026-11-24',
    note: 'Holiday install test approved by Brian 2026-11-23: Meta $40/day (8 markets), TikTok US+UK $20/day each, to Nov 30',
    scoreboard: { label: 'Exchanges with 3+ members', count: null, note: NOT_MEASURED },
    gate: [
      { label: 'Guest start (1.1.3) live in the stores', state: 'todo', note: 'Waits for Brian’s go (yulepick-ios HANDOFF-activation.md).' },
      { label: '≥1 in 5 new installs create or join an exchange (7 days)', state: 'not_measured', note: NOT_MEASURED },
      { label: 'Brian approves a daily budget', state: 'done' },
    ],
  },
  {
    app_slug: 'rolligan', name: 'Rolligan', ads_state: 'paused', since: '2026-11-10',
    note: 'Paused by Brian 2026-11-10. Organic holiday game-night posts only.',
    live_test: {
      from: '2026-11-26T00:00:00-06:00', until: '2026-11-29T00:00:00-06:00', since: '2026-11-26',
      note: 'Thanksgiving install test approved by Brian: TikTok $20/day, Meta $10/day, Nov 26–28 (ends 11:59 PM CT)',
      after_note: 'Paused again 2026-11-29 after the 3-day Thanksgiving install test (Nov 26–28). Organic holiday game-night posts only.',
    },
    scoreboard: { label: 'Games finished', count: null, note: NOT_MEASURED },
    gate: [
      { label: 'First minute fixed and live in the stores', state: 'todo' },
      { label: '≥1 in 5 new installs finish a game (7 days)', state: 'not_measured', note: NOT_MEASURED },
      { label: 'Brian approves a daily budget', state: 'todo' },
    ],
  },
  {
    app_slug: 'gagorder', name: 'Gag Order', ads_state: 'paused', since: '2026-11-10',
    note: 'Paused by Brian 2026-11-10. Next fix: a round you can see when you download it alone.',
    scoreboard: { label: 'Games reaching round 3', count: null, note: NOT_MEASURED },
    gate: [
      { label: 'Solo first round live in the stores', state: 'todo' },
      { label: '≥1 in 5 new installs reach round 3 (7 days)', state: 'not_measured', note: NOT_MEASURED },
      { label: 'Brian approves a daily budget', state: 'todo' },
    ],
  },
  {
    app_slug: 'borea', name: 'Borea', ads_state: 'paused', since: PAUSED_SINCE,
    note: 'No paid ads planned. One app at a time: November–December is YulePick.',
    scoreboard: { label: 'Active subscribers', count: null, note: NOT_MEASURED },
    gate: [
      { label: 'First minute fixed and live in the stores', state: 'todo' },
      { label: '≥1 in 5 new installs start a subscription trial (7 days)', state: 'not_measured', note: NOT_MEASURED },
      { label: 'Brian approves a daily budget', state: 'todo' },
    ],
  },
  {
    app_slug: 'jinglewire', name: 'Jinglewire', ads_state: 'paused', since: '2026-10-30',
    note: 'Parked to 2027. Kid-directed: parents only, never attributed.',
    scoreboard: { label: 'Not set while parked', count: null, note: 'Parked to 2027.' },
    gate: [
      { label: 'App back from parking', state: 'todo' },
      { label: 'Funnel counted', state: 'not_measured' },
      { label: 'Brian approves a daily budget', state: 'todo' },
    ],
  },
]

/** One entry as it stands at `now`: applies a dated `live_test` window. */
export function resolveStrategy(s: AppStrategy, now: Date = new Date()): AppStrategy {
  const t = s.live_test
  if (!t) return s
  const at = now.getTime()
  if (at >= Date.parse(t.until)) return { ...s, ads_state: 'paused', since: t.until.slice(0, 10), note: t.after_note }
  if (at < Date.parse(t.from)) return s
  return {
    ...s, ads_state: 'live', since: t.since, note: t.note,
    gate: s.gate.map((g) => (g.label === 'Brian approves a daily budget' ? { ...g, state: 'done' as const } : g)),
  }
}
/** Every app's strategy as it stands at `now` (read this, not STRATEGY, for state). */
export const currentStrategy = (now: Date = new Date()) => STRATEGY.map((s) => resolveStrategy(s, now))

/** An app's ads state. Unknown / shared campaigns count as paused (the strategy covers every paid campaign). */
export function adsState(appSlug: string | null | undefined, now: Date = new Date()): AdsState {
  return strategyFor(appSlug, now)?.ads_state ?? 'paused'
}
export function strategyFor(appSlug: string | null | undefined, now: Date = new Date()) {
  const s = STRATEGY.find((x) => x.app_slug === appSlug)
  return s && resolveStrategy(s, now)
}
export const allPaused = (now: Date = new Date()) => currentStrategy(now).every((s) => s.ads_state === 'paused')
