// Calendar time: everything on the grid is America/Chicago, whatever the
// browser's own zone. Days are 'YYYY-MM-DD' strings; instants are ISO.

import { zonedWallToUtc } from '@/lib/publish/markets'

export const TZ = 'America/Chicago'

/** 'YYYY-MM-DD' of an instant in Chicago. */
export const dayOf = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
/** Minutes since Chicago midnight of an instant. */
export function minutesOf(iso: string | Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso))
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0)
  return (g('hour') % 24) * 60 + g('minute')
}
/** The instant of a Chicago day + minutes. */
export const instantAt = (day: string, minutes: number) =>
  zonedWallToUtc(`${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, TZ)
export const today = () => dayOf(new Date())

const noon = (d: string) => new Date(`${d}T12:00:00Z`)
export const addDays = (d: string, n: number) => { const x = noon(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
export const addMonths = (d: string, n: number) => { const x = noon(`${d.slice(0, 7)}-01`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10) }
/** 0 = Sunday. */
export const weekday = (d: string) => noon(d).getUTCDay()
export const startOfWeek = (d: string) => addDays(d, -weekday(d))
export const startOfMonth = (d: string) => `${d.slice(0, 7)}-01`
export const daysInMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate()
export const endOfMonth = (d: string) => `${d.slice(0, 7)}-${String(daysInMonth(d)).padStart(2, '0')}`

export const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => noon(d).toLocaleDateString('en-US', { timeZone: 'UTC', ...o })
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
export const fmtHour = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`

/** The 6-week grid (Sun-first) that holds a month. */
export function monthGrid(d: string): string[] {
  const first = startOfWeek(startOfMonth(d))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
export const cents = (c: number) => money(Math.round(c) / 100)
