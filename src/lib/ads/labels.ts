// ─── Readable names for apps and campaigns (client-safe) ─────────────────────
//
// Platforms name auto-made campaigns "App promotion20260712155239" or
// "[11/6/2026] Promoting https://clarendon.dev/get/yulepick?ct=…". Those get a
// label built from what we know: app · goal · country · start date. The raw
// name stays available for a tooltip. Studio-made names ("YulePick · Downloads
// · US") are already readable and pass through.

export const APP_NAMES: Record<string, string> = {
  rolligan: 'Rolligan', gagorder: 'Gag Order', yulepick: 'YulePick', borea: 'Borea', jinglewire: 'Jinglewire',
}
/** "gagorder" → "Gag Order"; null → "Shared". */
export const appName = (slug: string | null | undefined) => (slug ? APP_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Shared')

const GOAL_WORDS: [RegExp, string][] = [
  [/app[\s_-]*promotion|app[\s_-]*install|installs?\b|APP_PROMOTION|OUTCOME_APP/i, 'App installs'],
  [/traffic|promoting\s+https?:|download|link[\s_-]*click/i, 'Traffic'],
  [/video[\s_-]*views?|\bviews?\b/i, 'Video views'],
  [/\breach\b|awareness/i, 'Reach'],
  [/engagement|\bboost/i, 'Engagement'],
  [/sales|conversion/i, 'Sales'],
  [/\blead/i, 'Leads'],
]
/** A goal word from the objective (preferred) or the name. */
export function goalWord(objective?: string | null, name?: string | null): string | undefined {
  for (const src of [objective, name]) {
    if (!src) continue
    for (const [re, word] of GOAL_WORDS) if (re.test(src)) return word
  }
  return undefined
}

/** Looks machine-made: a long digit run, Business Suite's "[date] Promoting …", or a bare objective word + digits. */
export function isAutoName(name: string): boolean {
  return /\d{10,}/.test(name) || /^\[\d{1,2}\/\d{1,2}\/\d{4}\]/.test(name) || /^https?:\/\//.test(name)
    || /^(app promotion|traffic|video views|reach|engagement|sales|leads|awareness|new campaign)[\s_-]*(\d{6,}|$)/i.test(name.trim())
}

const COUNTRY_TOKENS: Record<string, string> = { US: 'US', USA: 'US', UK: 'UK', GB: 'UK', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', ZA: 'South Africa', DE: 'Germany', FR: 'France', ES: 'Spain', BR: 'Brazil', MX: 'Mexico' }
/** A country word if the name carries one as its own token ("· US ·", "_UK_"). */
export function countryFromName(name: string): string | undefined {
  for (const tok of name.split(/[\s·|_\-/,()[\]]+/)) if (COUNTRY_TOKENS[tok]) return COUNTRY_TOKENS[tok]
  return undefined
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${MON[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ''}` : undefined)
/** The start date: "20260712155239" or "[11/6/2026]" in the name, else the first day it spent. */
export function startFromName(name: string, firstDay?: string | null): string | undefined {
  const a = name.match(/(20\d\d)(\d\d)(\d\d)\d{0,6}/)
  if (a) return fmtDay(+a[1], +a[2], +a[3])
  const b = name.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/)
  if (b) return fmtDay(+b[3], +b[1], +b[2])
  const f = firstDay?.match(/^(\d{4})-(\d\d)-(\d\d)/)
  return f ? fmtDay(+f[1], +f[2], +f[3]) : undefined
}

/** "Rolligan · App installs · US · Jul 12" for an auto-named campaign; the name itself otherwise. */
export function campaignLabel(c: { name: string; app_slug?: string | null; app_id?: string | null; objective?: string | null; first_day?: string | null; country?: string | null }): string {
  const name = (c.name ?? '').trim()
  if (name && !isAutoName(name)) return name
  const app = appName(c.app_slug ?? c.app_id ?? null)
  const parts = [app, goalWord(c.objective, name) ?? 'Campaign', c.country ?? countryFromName(name), startFromName(name, c.first_day)].filter(Boolean)
  return parts.join(' · ')
}
