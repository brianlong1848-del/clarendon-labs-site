// ─── Best time to post ──────────────────────────────────────────────────────
//
// SERVER ONLY. Scores every hour of the week (7 × 24, in the audience's time
// zone, Chicago by default) for one app on the chosen platforms, from three
// layers, strongest last:
//
//   1. Typical patterns — when each platform's audience is active, shaped by
//      who the app is for (party games: Thu–Sat evenings; Borea: early
//      mornings and Sunday meal-prep; Jinglewire: parents after bedtime).
//      General industry patterns, not our data, and labelled that way.
//   2. Instagram "followers online" — the app's real followers by hour, once
//      the account has the 100+ followers Meta needs to report it.
//   3. Our own results — reach + engagement of every post sent from /post,
//      read ~48h after it went out. Each measured post nudges its hour up or
//      down; after ~20 posts the curve is mostly ours.
//
// The composer's "Best time", the "Suggest days & times" fill and the auto
// repeat rule all read from heatFor().

import type { Platform, Target } from './rules'
import { PLATFORMS } from './rules'
import { igOnlineFollowers } from './platforms'
import { measuredPosts, type PostStat } from './store'
import { zoned, DAY_SHORT } from './recur'

const HOURS = 168
type Bump = { days: number[]; from: number; to: number; w: number }
const ALL = [0, 1, 2, 3, 4, 5, 6], WD = [1, 2, 3, 4, 5], WE = [0, 6]

const PLATFORM_BUMPS: Record<Platform, Bump[]> = {
  instagram: [{ days: WD, from: 11, to: 14, w: 0.8 }, { days: WD, from: 18, to: 21, w: 1 }, { days: [2, 3, 4], from: 18, to: 21, w: 0.3 }, { days: WE, from: 10, to: 13, w: 0.7 }, { days: WE, from: 19, to: 21, w: 0.5 }],
  tiktok: [{ days: ALL, from: 12, to: 14, w: 0.5 }, { days: WD, from: 18, to: 23, w: 1 }, { days: [4, 5, 6], from: 19, to: 23, w: 0.5 }, { days: WE, from: 10, to: 13, w: 0.5 }],
  facebook: [{ days: WD, from: 8, to: 13, w: 1 }, { days: WD, from: 18, to: 20, w: 0.5 }, { days: WE, from: 9, to: 12, w: 0.6 }],
  threads: [{ days: WD, from: 7, to: 10, w: 1 }, { days: WD, from: 12, to: 14, w: 0.7 }, { days: ALL, from: 19, to: 22, w: 0.6 }],
}
const APP_BUMPS: Record<string, { bumps: Bump[]; who: string }> = {
  rolligan: { who: 'party-game players planning game night', bumps: [{ days: [4, 5, 6], from: 16, to: 21, w: 0.8 }, { days: [0], from: 13, to: 18, w: 0.3 }] },
  gagorder: { who: 'queer friend groups planning the weekend', bumps: [{ days: [4, 5, 6], from: 17, to: 23, w: 0.9 }, { days: [0], from: 11, to: 15, w: 0.4 }] },
  borea: { who: 'people tracking food and training', bumps: [{ days: WD, from: 6, to: 9, w: 0.8 }, { days: WD, from: 12, to: 13, w: 0.4 }, { days: [0], from: 16, to: 20, w: 0.7 }, { days: [1], from: 6, to: 9, w: 0.4 }] },
  yulepick: { who: 'gift-exchange organisers', bumps: [{ days: WD, from: 12, to: 14, w: 0.6 }, { days: ALL, from: 19, to: 22, w: 0.6 }, { days: [0], from: 15, to: 20, w: 0.5 }] },
  jinglewire: { who: 'parents after the kids are in bed', bumps: [{ days: ALL, from: 20, to: 22, w: 1 }, { days: WD, from: 12, to: 13, w: 0.4 }, { days: WE, from: 8, to: 11, w: 0.5 }] },
}

function paint(bumps: Bump[]): number[] {
  const h = new Array(HOURS).fill(0)
  for (const b of bumps) for (const d of b.days) for (let x = b.from - 1; x <= b.to; x++) {
    const w = x < b.from || x === b.to ? b.w * 0.4 : b.w
    h[d * 24 + ((x + 24) % 24)] += w
  }
  return h
}
const norm = (h: number[]) => { const m = Math.max(...h, 1e-9); return h.map((v) => v / m) }
const base = (slot: number) => { const hr = slot % 24; return hr < 6 ? 0.02 : hr < 7 || hr >= 23 ? 0.08 : 0.18 }

function prior(appId: string, platform: Platform): number[] {
  const p = norm(paint(PLATFORM_BUMPS[platform]).map((v, i) => v + base(i)))
  if (!APP_BUMPS[appId]) return p
  // The audience shapes the curve more than the platform does: flatten the
  // platform (sqrt) and let the app's windows lift it.
  const a = norm(paint(APP_BUMPS[appId].bumps))
  return norm(p.map((v, i) => Math.sqrt(v) * (0.35 + a[i])))
}

/** Slot index (weekday*24+hour) of an instant in a time zone. */
export function slotOf(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const wd = DAY_SHORT.indexOf(p.find((x) => x.type === 'weekday')!.value)
  return wd * 24 + (Number(p.find((x) => x.type === 'hour')!.value) % 24)
}

const igCache = new Map<string, { at: number; curve: number[] | null }>()
async function igOnline(appId: string, tz: string): Promise<number[] | null> {
  const hit = igCache.get(appId)
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.curve
  const rows = await igOnlineFollowers(appId).catch(() => null)
  let curve: number[] | null = null
  if (rows?.length) {
    const sum = new Array(HOURS).fill(0), n = new Array(HOURS).fill(0)
    for (const r of rows) {
      const day = new Date(r.date)
      for (const [hr, v] of Object.entries(r.hours)) {
        // Meta's hour keys are Pacific; rebuild the instant, then read it in tz.
        const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(day.getTime() - 864e5)).split('-').map(Number)
        const at = zoned(d[0], d[1] - 1, d[2], Number(hr), 30, 'America/Los_Angeles')
        const s = slotOf(at, tz); sum[s] += Number(v) || 0; n[s]++
      }
    }
    curve = norm(sum.map((v, i) => n[i] ? v / n[i] : 0))
  }
  igCache.set(appId, { at: Date.now(), curve })
  return curve
}

export type Heat = {
  heat: number[]
  basis: { level: 'typical' | 'learning' | 'yours'; measured: number; igOnline: boolean }
  reason: string
}

/** The week's heat map for an app on these platforms (0–1 per hour). */
export async function heatFor(appId: string, platforms: Platform[], tz = 'America/Chicago'): Promise<Heat> {
  const list = (platforms.length ? platforms : (['instagram', 'tiktok'] as Platform[])).filter((p, i, a) => a.indexOf(p) === i)
  const [rows, ig] = await Promise.all([
    measuredPosts(appId).catch(() => []),
    list.includes('instagram') ? igOnline(appId, tz) : Promise.resolve(null),
  ])

  // Lifts: each measured result vs that platform's median for this app.
  const byPlatform = new Map<Platform, { slot: number; reach: number; eng: number }[]>()
  for (const r of rows) {
    const slot = slotOf(new Date(r.scheduled_at ?? r.created_at), tz)
    for (const [pf, st] of Object.entries(r.stats ?? {}) as [Platform, PostStat][]) {
      if (!st) continue
      if (!byPlatform.has(pf)) byPlatform.set(pf, [])
      byPlatform.get(pf)!.push({ slot, reach: st.reach || 0, eng: st.engagement || 0 })
    }
  }
  const median = (xs: number[]) => { const s = xs.filter((x) => x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  const lifts = (items: { slot: number; reach: number; eng: number }[]) => {
    const mr = median(items.map((i) => i.reach)), me = median(items.map((i) => i.eng))
    return items.map((i) => {
      const parts = [mr ? i.reach / mr : null, me ? i.eng / me : null].filter((x): x is number => x != null)
      return { slot: i.slot, lift: parts.length ? Math.min(5, parts.reduce((a, b) => a + b, 0) / parts.length) : 1 }
    })
  }
  const allLifts = Array.from(byPlatform.values()).flatMap(lifts)
  const learn = (items: { slot: number; lift: number }[], k: number) => {
    const num = new Array(HOURS).fill(0), den = new Array(HOURS).fill(0)
    for (const { slot, lift } of items) {
      const hr = slot % 24
      for (let s = 0; s < HOURS; s++) {
        const dh = Math.min(Math.abs((s % 24) - hr), 24 - Math.abs((s % 24) - hr))
        const w = s === slot ? 1 : Math.floor(s / 24) === Math.floor(slot / 24) && dh === 1 ? 0.5 : dh === 0 ? 0.15 : 0
        if (w) { num[s] += lift * w; den[s] += w }
      }
    }
    return num.map((v, s) => (k + v) / (k + den[s]))
  }

  const curves = list.map((pf) => {
    let c = prior(appId, pf)
    if (pf === 'instagram' && ig) c = norm(c.map((v, i) => 0.5 * v + 0.5 * ig[i]))
    const own = byPlatform.get(pf)
    // Platforms we can't measure yet borrow the app's overall results at half strength.
    const mult = own?.length ? learn(lifts(own), 1) : allLifts.length ? learn(allLifts, 3) : null
    // The more we've measured, the more our results outweigh the typical curve.
    const strength = 1 + Math.min(2, (own?.length ?? allLifts.length / 2) / 10)
    return mult ? norm(c.map((v, i) => v * Math.pow(mult[i], strength))) : c
  })
  const heat = norm(new Array(HOURS).fill(0).map((_, i) => curves.reduce((a, c) => a + c[i], 0) / curves.length))

  const measured = rows.length
  const level = measured >= 20 ? 'yours' : measured >= 5 ? 'learning' : 'typical'
  const names = list.map((p) => PLATFORMS.find((x) => x.id === p)!.name)
  const who = APP_BUMPS[appId]?.who ?? 'this audience'
  const top = topWindows(heat)
  const reason = level === 'yours'
    ? `From ${measured} of your own posts — ${top} do best for you on ${names.join(' & ')}.`
    : level === 'learning'
      ? `Learning from ${measured} of your posts so far, plus typical patterns for ${who}: best around ${top}.`
      : `${ig ? 'Your Instagram followers’ online hours plus typical' : 'Typical'} patterns for ${who} on ${names.join(' & ')}: best around ${top}. Sharpens as your own posts get measured (~48h after each).`
  return { heat, basis: { level, measured, igOnline: !!ig }, reason }
}

function topWindows(heat: number[]) {
  // The three best hours of the week, at least half a day apart.
  const fmt = (i: number) => { const h = i % 24; return `${DAY_SHORT[Math.floor(i / 24)]} ${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}` }
  const picked: number[] = []
  for (const { i } of heat.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v)) {
    if (picked.length === 3) break
    if (picked.every((p) => Math.min(Math.abs(p - i), 168 - Math.abs(p - i)) >= 12)) picked.push(i)
  }
  return picked.map(fmt).join(', ')
}

/** Best upcoming hours in the next 7 days, spaced at least `gapH` apart, best first. */
export function bestSlots(heat: number[], from: Date, count: number, tz = 'America/Chicago', gapH = 12, after?: Date): Date[] {
  const start = new Date(Math.ceil((Math.max(from.getTime(), after?.getTime() ?? 0) + 30 * 60_000) / 3600_000) * 3600_000)
  const cands: { at: Date; v: number }[] = []
  for (let h = 0; h < 168; h++) {
    const at = new Date(start.getTime() + h * 3600_000)
    cands.push({ at, v: heat[slotOf(at, tz)] })
  }
  cands.sort((a, b) => b.v - a.v)
  const picked: Date[] = []
  for (const c of cands) {
    if (picked.length >= count) break
    if (picked.every((p) => Math.abs(p.getTime() - c.at.getTime()) >= gapH * 3600_000)) picked.push(c.at)
  }
  return picked.map((d) => onTheHour(d, tz))
}
// Land on :00 in the audience's zone (zones with :30 offsets).
function onTheHour(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  return zoned(g('year'), g('month') - 1, g('day'), g('hour') % 24, 0, tz)
}

/** The next copy for an auto repeat: the best slot in the coming week that keeps
 *  roughly perWeek posts a week (spacing from the last copy). */
export async function nextBest(appId: string, targets: Target[], after: Date, perWeek: number, tz = 'America/Chicago'): Promise<Date> {
  const { heat } = await heatFor(appId, targets.map((t) => t.platform), tz)
  const gap = Math.max(12, Math.round((168 / perWeek) * 0.6))
  // Plan the next week, then take its earliest pick.
  const plan = bestSlots(heat, new Date(Math.max(Date.now(), after.getTime() + gap * 3600_000 - 3600_000)), perWeek, tz, gap)
  return plan.sort((a, b) => a.getTime() - b.getTime())[0]
}

/** "Every week" fill: the best `n` days and the single best hour across them. */
export function suggestWeekly(heat: number[], n: number): { days: number[]; times: string[] } {
  const dayBest = DAY_SHORT.map((_, d) => {
    const hrs = heat.slice(d * 24, d * 24 + 24)
    const h = hrs.indexOf(Math.max(...hrs))
    return { d, h, v: hrs[h] }
  }).sort((a, b) => b.v - a.v)
  const picked: typeof dayBest = []
  for (const x of dayBest) {
    if (picked.length >= n) break
    // Avoid back-to-back days when posting ≤3× a week.
    if (n <= 3 && picked.some((p) => Math.min(Math.abs(p.d - x.d), 7 - Math.abs(p.d - x.d)) < 2)) continue
    picked.push(x)
  }
  for (const x of dayBest) if (picked.length < n && !picked.includes(x)) picked.push(x)
  const hrs = picked.map((p) => p.h)
  const counts = hrs.reduce((m, h) => m.set(h, (m.get(h) ?? 0) + 1), new Map<number, number>())
  const hour = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || heat[picked[0].d * 24 + b[0]] - heat[picked[0].d * 24 + a[0]])[0][0]
  return { days: picked.map((p) => p.d).sort(), times: [`${String(hour).padStart(2, '0')}:00`] }
}
