import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Everything the Overview screen needs in one call. All reads go through the
// signed-in session, so RLS scopes them to the owner.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const sb = await supabaseServer()
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const [pnl, apps, roas, owed, unreviewed] = await Promise.all([
    sb.from('v_app_pnl_monthly').select('*').order('month', { ascending: false }).limit(400),
    sb.from('apps').select('slug,name').order('name'),
    sb.from('v_roas_daily').select('app_slug,spend_cents,proceeds_cents,installs').gte('day', since),
    sb.from('v_owner_contributions').select('owed_cents'),
    sb.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed'),
  ])
  const err = pnl.error || apps.error || roas.error || owed.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const roasByApp: Record<string, { spend: number; proceeds: number; installs: number }> = {}
  for (const r of roas.data ?? []) {
    const x = (roasByApp[r.app_slug] ??= { spend: 0, proceeds: 0, installs: 0 })
    x.spend += Number(r.spend_cents); x.proceeds += Number(r.proceeds_cents); x.installs += Number(r.installs ?? 0)
  }
  return NextResponse.json({
    pnl: pnl.data ?? [],
    apps: apps.data ?? [],
    roas30: roasByApp,
    owedCents: (owed.data ?? []).reduce((n, r) => n + Number(r.owed_cents), 0),
    unreviewed: unreviewed.count ?? 0,
  })
}
