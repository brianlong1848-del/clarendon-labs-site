import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { studioDb } from '@/lib/money/studioDb'
import { fmpStatus } from '@/lib/household/marketData'
import { BUCKETS, DEFAULT_TARGET, type Bucket } from '@/lib/household/portfolio'

export const dynamic = 'force-dynamic'

// Household settings — one row per key, both members edit (RLS). Keys:
//   target_allocation   { equity_us, equity_intl, bonds, cash, other }  percentages, sum 100
//   cash_buffer_months  number (1–24)
//   goals               [{ name, target_cents, by }]
//   risk_note, tax_bracket_note   free text
//   advisor_schedule    { weekday: 0–6 (1 = Monday), hour_ct: 0–23 }
//   watchlist           ["VTI", …]
//   asset_class_overrides { TICKER: bucket }
//   fmp_calls_today     read-only here (written by marketData)
const KEYS = new Set(['target_allocation', 'cash_buffer_months', 'goals', 'risk_note', 'tax_bracket_note', 'advisor_schedule', 'watchlist', 'asset_class_overrides'])
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const sb = await supabaseServer()
  const [{ data, error }, members] = await Promise.all([sb.from('household_settings').select('key,value,updated_at,updated_by'), sb.rpc('studio_members_status')])
  if (error) return bad(error.message, 500)
  const settings: Record<string, unknown> = { target_allocation: DEFAULT_TARGET, cash_buffer_months: 6, goals: [], risk_note: '', tax_bracket_note: '', advisor_schedule: { weekday: 1, hour_ct: 7 }, watchlist: [], asset_class_overrides: {} }
  for (const r of data ?? []) settings[r.key] = r.value
  const db = studioDb()
  return NextResponse.json({
    settings, fmp: db ? await fmpStatus(db) : null,
    members: (members.data ?? []).map((m: { email: string; display_name: string | null }) => ({ email: m.email, display_name: m.display_name })),
    advisorModel: process.env.HOUSEHOLD_ADVISOR_MODEL || 'claude-sonnet-5-5',
    plaidSandbox: !!process.env.PLAID_SANDBOX_SECRET || (process.env.PLAID_ENV ?? 'sandbox') !== 'production',
  })
}

function validate(key: string, v: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (key) {
    case 'target_allocation': {
      if (!v || typeof v !== 'object') return { ok: false, error: 'Target allocation must be an object.' }
      const o = v as Record<string, unknown>
      const out = {} as Record<Bucket, number>
      let sum = 0
      for (const b of BUCKETS) { const n = Number(o[b] ?? 0); if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: `Bad percentage for ${b}.` }; out[b] = Math.round(n); sum += out[b] }
      if (Math.abs(sum - 100) > 1) return { ok: false, error: `Targets add up to ${sum}%; they need to total 100%.` }
      return { ok: true, value: out }
    }
    case 'cash_buffer_months': { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 24 ? { ok: true, value: Math.round(n * 2) / 2 } : { ok: false, error: 'Cash buffer is 1–24 months.' } }
    case 'goals': {
      if (!Array.isArray(v)) return { ok: false, error: 'Goals must be a list.' }
      const out = v.slice(0, 20).map((g: Record<string, unknown>) => ({ name: String(g?.name ?? '').slice(0, 80), target_cents: Math.max(0, Math.round(Number(g?.target_cents ?? 0))), by: typeof g?.by === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(g.by) ? g.by : null }))
      if (out.some((g) => !g.name)) return { ok: false, error: 'Every goal needs a name.' }
      return { ok: true, value: out }
    }
    case 'risk_note': case 'tax_bracket_note': return { ok: true, value: String(v ?? '').slice(0, 2000) }
    case 'advisor_schedule': {
      const o = (v ?? {}) as Record<string, unknown>
      const weekday = Number(o.weekday), hour_ct = Number(o.hour_ct)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(hour_ct) || hour_ct < 0 || hour_ct > 23) return { ok: false, error: 'Schedule needs a weekday (0–6) and an hour (0–23, Central).' }
      return { ok: true, value: { weekday, hour_ct } }
    }
    case 'watchlist': {
      if (!Array.isArray(v)) return { ok: false, error: 'Watchlist must be a list of tickers.' }
      const out = Array.from(new Set(v.map((t) => String(t).toUpperCase().trim()).filter((t) => /^[A-Z.\-]{1,10}$/.test(t)))).slice(0, 30)
      return { ok: true, value: out }
    }
    case 'asset_class_overrides': {
      if (!v || typeof v !== 'object') return { ok: false, error: 'Overrides must be an object.' }
      const out: Record<string, Bucket> = {}
      for (const [t, b] of Object.entries(v as Record<string, unknown>)) if (/^[A-Z.\-]{1,10}$/.test(t) && BUCKETS.includes(b as Bucket)) out[t] = b as Bucket
      return { ok: true, value: out }
    }
  }
  return { ok: false, error: 'Unknown setting.' }
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const b = await req.json().catch(() => null) as { key?: string; value?: unknown } | null
  if (!b?.key || !KEYS.has(b.key)) return bad('Unknown setting.')
  const v = validate(b.key, b.value)
  if (!v.ok) return bad(v.error)
  const sb = await supabaseServer()
  const { data: me } = await sb.auth.getUser()
  const { error } = await sb.from('household_settings').upsert({ key: b.key, value: v.value, updated_by: me.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true, key: b.key, value: v.value })
}
