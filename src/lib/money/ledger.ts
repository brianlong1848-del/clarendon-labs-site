// ─── Manual ledger helpers (shared by the ledger, recurring and receipt APIs) ──
//
// "Paid from" is either a money_accounts id (business or personal, Plaid or
// manual) or one of the two catch-alls below. Anything personal counts as an
// owner contribution ("LLC owes Brian") — see v_owner_contributions.

import type { SupabaseClient } from '@supabase/supabase-js'

export const PAID_FROM_OTHER = [
  { id: 'other_personal', label: 'Other personal card / account' },
  { id: 'cash', label: 'Cash' },
] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "12.34", "$1,200", 12.34 → 1234. Returns null for anything that isn't a positive amount. */
export function toCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null
  return Math.round(n * 100)
}

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Validates paid_from against the caller's own accounts (RLS scopes the lookup). */
export async function resolvePaidFrom(sb: SupabaseClient, v: unknown): Promise<{ paid_from: string; account_id: string | null } | null> {
  if (typeof v !== 'string' || !v) return null
  if (PAID_FROM_OTHER.some((o) => o.id === v)) return { paid_from: v, account_id: null }
  if (!UUID.test(v)) return null
  const { data } = await sb.from('money_accounts').select('id').eq('id', v).maybeSingle()
  return data ? { paid_from: v, account_id: v } : null
}

export type SplitIn = { app_slug: string; share?: number; amount?: number | string }

/** Splits arrive as percents (share 0–1) or fixed dollar amounts; both become
 *  shares of the total. They must cover the whole amount (±0.5%). */
export function normaliseSplits(raw: unknown, totalCents: number, appSlugs: Set<string>): { app_slug: string; share: number }[] | string | null {
  if (raw == null) return null
  if (!Array.isArray(raw) || raw.length < 2) return 'A split needs at least two apps.'
  const out: { app_slug: string; share: number }[] = []
  for (const s of raw as SplitIn[]) {
    if (!s || !appSlugs.has(s.app_slug)) return `Unknown app in split: ${String(s?.app_slug)}`
    let share: number | null = null
    if (s.amount != null && s.amount !== '') { const c = toCents(s.amount); share = c == null ? null : c / totalCents }
    else if (typeof s.share === 'number') share = s.share
    if (share == null || !(share > 0) || share > 1) return `Bad share for ${s.app_slug}.`
    if (out.some((o) => o.app_slug === s.app_slug)) return `${s.app_slug} appears twice in the split.`
    out.push({ app_slug: s.app_slug, share: Math.round(share * 1e6) / 1e6 })
  }
  const sum = out.reduce((a, s) => a + s.share, 0)
  if (Math.abs(sum - 1) > 0.005) return `Split covers ${(sum * 100).toFixed(1)}% of the amount; it has to add up to 100%.`
  return out
}

export async function appSlugs(sb: SupabaseClient): Promise<Set<string>> {
  const { data } = await sb.from('apps').select('slug')
  return new Set((data ?? []).map((a: { slug: string }) => a.slug))
}
