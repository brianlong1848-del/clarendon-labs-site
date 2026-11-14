// ─── Scoreboard counts (revenue strategy, 2026-11-12) ────────────────────────
//
// SERVER ONLY. The one number each app is judged by. Only YulePick's is
// readable today: exchanges that reached 3 members, from its `memberships`
// table (the same Supabase project the site's `rest` reads; same query the
// /post calendar uses). Everything else returns null = "not measured".

import { rest } from '@/lib/publish/store'

const chicagoDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** YulePick exchanges whose 3rd member joined between from and to (ISO days, Chicago, inclusive). null when unreadable. */
export async function yulepickExchanges3(from: string, to: string): Promise<number | null> {
  try {
    const rows = await rest<{ exchange_id: string; joined_at: string | null }[]>('memberships?select=exchange_id,joined_at&order=joined_at.asc&limit=50000')
    if (!Array.isArray(rows)) return null
    const seen = new Map<string, number>()
    let count = 0
    for (const r of rows) {
      const k = (seen.get(r.exchange_id) ?? 0) + 1
      seen.set(r.exchange_id, k)
      if (k !== 3 || !r.joined_at) continue
      const d = chicagoDay(r.joined_at)
      if (d >= from && d <= to) count++
    }
    return count
  } catch { return null }
}

/** Scoreboard count per app over the window; null = not measured. */
export async function scoreboardCounts(from: string, to: string): Promise<Record<string, number | null>> {
  return { yulepick: await yulepickExchanges3(from, to), rolligan: null, gagorder: null, borea: null, jinglewire: null }
}
