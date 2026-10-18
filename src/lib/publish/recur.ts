// ─── Repeating posts: the schedule maths ────────────────────────────────────
//
// SHARED by the server (works out when the next copy goes out) and the /post
// composer (shows "next: Tue 10 AM, Thu 10 AM…" while you set it up). The
// Studio iOS app can send the same `repeat` object; it doesn't need to do the
// maths itself.
//
// Two kinds of rule:
//   weekly — chosen weekdays at one or more wall-clock times in a time zone
//            ("every Tue + Thu at 10:00 Chicago time"), DST-safe.
//   dates  — a hand-picked list of exact moments.

export type WeeklyRule = { kind: 'weekly'; days: number[]; times: string[]; tz: string }
export type DatesRule = { kind: 'dates'; at: string[] }
export type RepeatRule = WeeklyRule | DatesRule

/** What the composer sends alongside a post to make it repeat. */
export type RepeatSpec = {
  rule: RepeatRule
  /** Nothing goes out before this (defaults to now). */
  startsAt?: string | null
  /** Nothing goes out after this. */
  endsAt?: string | null
  /** Stop after this many copies. */
  maxRuns?: number | null
  /** 'fresh' = Claude rewrites the caption for every copy after the first. */
  captionMode: 'fresh' | 'same'
  /** What the post is about, in Brian's words — steers the AI captions. */
  notes?: string
  /** Still frames (public URLs) the AI looks at instead of the video. */
  frames?: string[]
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Problems with a spec, in plain words. Empty = fine. */
export function checkRepeat(spec: RepeatSpec, now = new Date()): string[] {
  const out: string[] = []
  const r = spec.rule
  if (!r || (r.kind !== 'weekly' && r.kind !== 'dates')) return ['Pick how it repeats.']
  if (r.kind === 'weekly') {
    if (!r.days?.length) out.push('Pick at least one day.')
    if (r.days?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) out.push('Unknown weekday.')
    if (!r.times?.length) out.push('Pick a time.')
    if (r.times?.some((t) => !TIME_RE.test(t))) out.push('Times look like 10:00 or 18:30.')
    if (!validTz(r.tz)) out.push('Unknown time zone.')
  } else {
    const at = (r.at ?? []).map((s) => new Date(s))
    if (at.length < 1) out.push('Add at least one date.')
    if (at.some((d) => isNaN(d.getTime()))) out.push('One of the dates isn’t a real date.')
    if (at.length > 60) out.push('Up to 60 custom dates.')
  }
  if (spec.maxRuns != null && (!Number.isInteger(spec.maxRuns) || spec.maxRuns < 1 || spec.maxRuns > 500)) out.push('“After N posts” must be between 1 and 500.')
  if (spec.endsAt && isNaN(new Date(spec.endsAt).getTime())) out.push('The end date isn’t a real date.')
  if (!out.length && !nextAfter(spec, now)) out.push('None of these times are in the future.')
  return out
}

function validTz(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return !!tz } catch { return false }
}

// Wall-clock ↔ UTC without a date library.
function offsetMs(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(at.getTime() / 1000) * 1000
}
/** The UTC instant for a wall-clock time in `tz` (month is 0-based). */
export function zoned(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo, d, h, mi)
  const first = offsetMs(new Date(guess), tz)
  let t = guess - first
  const second = offsetMs(new Date(t), tz)
  if (second !== first) t = guess - second
  return new Date(t)
}
function localDate(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return { y: g('year'), mo: g('month') - 1, d: g('day') }
}

/** The first moment strictly after `after` that this spec fires, or null when it's finished. */
export function nextAfter(spec: RepeatSpec, after: Date, runsSoFar = 0): Date | null {
  if (spec.maxRuns != null && runsSoFar >= spec.maxRuns) return null
  const start = spec.startsAt ? new Date(Math.max(after.getTime(), new Date(spec.startsAt).getTime() - 1)) : after
  const end = spec.endsAt ? new Date(spec.endsAt) : null
  let next: Date | null = null
  const r = spec.rule
  if (r.kind === 'dates') {
    next = r.at.map((s) => new Date(s)).filter((d) => !isNaN(d.getTime()) && d > start).sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  } else {
    const days = new Set(r.days)
    const times = [...r.times].sort()
    const base = localDate(start, r.tz)
    for (let i = 0; i < 15 && !next; i++) {
      const day = new Date(Date.UTC(base.y, base.mo, base.d + i))
      if (!days.has(day.getUTCDay())) continue
      for (const t of times) {
        const [h, m] = t.split(':').map(Number)
        const at = zoned(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, r.tz)
        if (at > start) { next = at; break }
      }
    }
  }
  if (next && end && next > end) return null
  return next
}

/** The next `n` moments, for the composer's preview. */
export function upcoming(spec: RepeatSpec, n = 4, from = new Date()): Date[] {
  const out: Date[] = []
  let cursor = from
  while (out.length < n) {
    const next = nextAfter(spec, cursor, out.length)
    if (!next) break
    out.push(next); cursor = next
  }
  return out
}

const clock = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`
}
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`

/** "Every Tue & Thu at 10 AM", "Every day at 9 AM & 7 PM", "5 custom dates". */
export function describeRule(rule: RepeatRule): string {
  if (rule.kind === 'dates') return `${rule.at.length} custom date${rule.at.length === 1 ? '' : 's'}`
  const d = [...rule.days].sort()
  const days = d.length === 7 ? 'day' : d.join() === '1,2,3,4,5' ? 'weekday' : d.join() === '0,6' ? 'weekend day' : list(d.map((x) => DAY_SHORT[x]))
  return `Every ${days} at ${list([...rule.times].sort().map(clock))}`
}
