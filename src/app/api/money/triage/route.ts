import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Triage queue + decisions. Everything goes through the signed-in session, so
// RLS (owner_id = auth.uid()) is what scopes the data, not this code.

export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const sb = supabaseServer()
  const [queue, count, apps] = await Promise.all([
    sb.from('transactions')
      .select('id,posted_on,amount_cents,merchant,raw_description,plaid_category,account:money_accounts(name,mask,ownership,institution)')
      .eq('status', 'unreviewed').order('posted_on', { ascending: false }).limit(50),
    sb.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed'),
    sb.from('apps').select('slug,name').order('name'),
  ])
  if (queue.error) return NextResponse.json({ error: queue.error.message }, { status: 500 })
  return NextResponse.json({ items: queue.data, remaining: count.count ?? 0, apps: apps.data ?? [] })
}

type Body = { id: string; status: 'business' | 'personal' | 'ignored' | 'unreviewed'; app_slug?: string | null; schedule_c?: string | null; makeRule?: boolean }

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Body | null
  if (!b?.id || !['business', 'personal', 'ignored', 'unreviewed'].includes(b.status)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const sb = supabaseServer()
  const isBiz = b.status === 'business'
  const fields = { status: b.status, app_slug: isBiz ? b.app_slug ?? null : null, schedule_c: isBiz ? b.schedule_c ?? null : null }

  const { data: tx, error } = await sb.from('transactions').update(fields).eq('id', b.id).select('merchant').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let alsoApplied = 0
  if (b.makeRule && tx?.merchant && b.status !== 'unreviewed') {
    const pattern = `%${tx.merchant.replace(/[%_\\]/g, '')}%`
    const rule = await sb.from('rules').insert({
      match_merchant: pattern, set_status: b.status, set_app: fields.app_slug, set_schedule_c: fields.schedule_c, priority: 80,
    }).select('id').single()
    if (rule.error) return NextResponse.json({ error: rule.error.message }, { status: 500 })
    // Apply the new rule to everything already waiting from the same merchant.
    const done = await sb.from('transactions').update({ ...fields, rule_id: rule.data.id })
      .eq('status', 'unreviewed').ilike('merchant', pattern).select('id')
    alsoApplied = done.data?.length ?? 0
  }
  return NextResponse.json({ ok: true, alsoApplied })
}
