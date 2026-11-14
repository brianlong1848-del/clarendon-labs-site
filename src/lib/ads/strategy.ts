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
}

export const PAUSED_SINCE = '2026-11-12'

const NOT_MEASURED = 'Not measured yet — the app doesn’t write this to app_events.'

export const STRATEGY: AppStrategy[] = [
  {
    app_slug: 'yulepick', name: 'YulePick', ads_state: 'paused', since: PAUSED_SINCE,
    note: 'Season app. Install ads stay off until the gate passes; the prepaid TikTok balance stays for the relaunch.',
    scoreboard: { label: 'Exchanges with 3+ members', count: null, note: NOT_MEASURED },
    gate: [
      { label: 'Guest start (1.1.3) live in the stores', state: 'todo', note: 'Waits for Brian’s go (yulepick-ios HANDOFF-activation.md).' },
      { label: '≥1 in 5 new installs create or join an exchange (7 days)', state: 'not_measured', note: NOT_MEASURED },
      { label: 'Brian approves a daily budget', state: 'todo' },
    ],
  },
  {
    app_slug: 'rolligan', name: 'Rolligan', ads_state: 'paused', since: '2026-11-10',
    note: 'Paused by Brian 2026-11-10. Organic holiday game-night posts only.',
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

/** An app's ads state. Unknown / shared campaigns count as paused (the strategy covers every paid campaign). */
export function adsState(appSlug: string | null | undefined): AdsState {
  return STRATEGY.find((s) => s.app_slug === appSlug)?.ads_state ?? 'paused'
}
export const strategyFor = (appSlug: string | null | undefined) => STRATEGY.find((s) => s.app_slug === appSlug)
export const allPaused = () => STRATEGY.every((s) => s.ads_state === 'paused')
