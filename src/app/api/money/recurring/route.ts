import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { SCHEDULE_C } from '@/lib/money/categories'
import { appSlugs, isDate, resolvePaidFrom, str, toCents } from '@/lib/money/ledger'

export const dynamic = 'force-dynamic'

// ─── /api/money/recurring — subscriptions paid outside the business account ──
//
// A daily cron (/api/cron/money-recurring → post_due_recurring()) posts each
// due charge as a transaction, so nothing gets retyped monthly. Marking one
// "moved to business" stops the auto-posting; Plaid sees it from then on.
//
//   GET                                  → list + migration progress
//   POST  { vendor, amount, cadence, next_date, app_slug? | split_apps?, paid_from, schedule_c, notes? }
//   PATCH { id, ...fields to change, moved_to_business_on?: 'YYYY-MM-DD' | null, active?: boolean }

const CATS = new Set<string>(SCHEDULE_C.map(([v]) => v))
const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET() {
  if (!(await consoleAuthed())) return deny()
  const sb = await supabaseServer()
  const [list, progress] = await Promise.all([
    sb.from('manual_recurring').select('*').order('active', { ascending: false }).order('moved_to_business_on', { nullsFirst: true }).order('vendor'),
    sb.from('v_subscription_migration').select('total,moved,personal_monthly_cents').maybeSingle(),
  ])
  if (list.error) return bad(list.error.message, 500)
  return NextResponse.json({ items: list.data ?? [], progress: progress.data ?? { total: 0, moved: 0, personal_monthly_cents: 0 } })
}

async function fields(b: Record<string, unknown>, sb: Awaited<ReturnType<typeof supabaseServer>>, partial: boolean) {
  const out: Record<string, unknown> = {}
  const has = (k: string) => !partial || k in b
  if (has('vendor')) { const v = str(b.vendor, 120); if (!v) return 'Vendor is required.'; out.vendor = v }
  if (has('amount')) { const c = toCents(b.amount); if (!c) return 'Enter an amount greater than zero.'; out.amount_cents = c }
  if (has('cadence')) { if (b.cadence !== 'monthly' && b.cadence !== 'annual') return 'Cadence is monthly or annual.'; out.cadence = b.cadence }
  if (has('next_date')) { if (!isDate(b.next_date)) return 'Pick the next charge date.'; out.next_date = b.next_date; out.anchor_date = b.next_date }
  if (has('schedule_c')) { const c = str(b.schedule_c, 40); if (!CATS.has(c)) return 'Pick a category.'; out.schedule_c = c }
  if (has('paid_from')) { const p = await resolvePaidFrom(sb, b.paid_from); if (!p) return 'Pick what it is paid from.'; out.paid_from = p.paid_from }
  if (has('app_slug') || has('split_apps')) {
    const slugs = await appSlugs(sb)
    const split = Array.isArray(b.split_apps) ? Array.from(new Set((b.split_apps as unknown[]).map(String))) : null
    if (split && split.length >= 2) {
      if (split.some((s) => !slugs.has(s))) return 'Unknown app in split.'
      out.split_apps = split; out.app_slug = null
    } else {
      const a = b.app_slug ? String(b.app_slug) : null
      if (a && !slugs.has(a)) return 'Unknown app.'
      out.app_slug = a; out.split_apps = null
    }
  }
  if ('notes' in b) out.notes = str(b.notes, 1000) || null
  if ('active' in b) out.active = !!b.active
  if ('moved_to_business_on' in b) {
    if (b.moved_to_business_on !== null && !isDate(b.moved_to_business_on)) return 'Bad moved date.'
    out.moved_to_business_on = b.moved_to_business_on
  }
  return out
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b) return bad('bad request')
  const sb = await supabaseServer()
  const f = await fields(b, sb, false)
  if (typeof f === 'string') return bad(f)
  const { data, error } = await sb.from('manual_recurring').insert(f).select('id').single()
  return error ? bad(error.message, 500) : NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b?.id) return bad('bad request')
  const sb = await supabaseServer()
  const f = await fields(b, sb, true)
  if (typeof f === 'string') return bad(f)
  if (!Object.keys(f).length) return bad('Nothing to change.')
  const { error } = await sb.from('manual_recurring').update(f).eq('id', b.id)
  return error ? bad(error.message, 500) : NextResponse.json({ ok: true })
}
