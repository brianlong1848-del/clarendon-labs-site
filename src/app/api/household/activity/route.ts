import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { studioDb } from '@/lib/money/studioDb'
import { cashflowByCategory } from '@/lib/household/portfolio'

export const dynamic = 'force-dynamic'

// Household activity: investment transactions (trades, dividends, fees) and
// household cash flow (bank + card transactions on household accounts), with
// the last 90 days rolled up by category. Reads through the member's session
// (RLS), except the roll-up which uses the same service client as the picture.
//   GET ?account=<id>&type=<investment type>&days=90&limit=200
export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const u = new URL(req.url).searchParams
  const account = u.get('account')
  const type = u.get('type')
  const days = Math.min(730, Math.max(7, Number(u.get('days')) || 90))
  const limit = Math.min(500, Math.max(20, Number(u.get('limit')) || 200))
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const sb = await supabaseServer()
  let inv = sb.from('investment_transactions')
    .select('id,account_id,security_id,posted_on,type,subtype,quantity,price,amount_cents,fees_cents,name,security:securities(ticker,name,type)')
    .gte('posted_on', since).order('posted_on', { ascending: false }).limit(limit)
  let cash = sb.from('transactions')
    .select('id,account_id,posted_on,amount_cents,merchant,raw_description,plaid_category')
    .eq('scope', 'household').gte('posted_on', since).order('posted_on', { ascending: false }).limit(limit)
  if (account) { inv = inv.eq('account_id', account); cash = cash.eq('account_id', account) }
  if (type) inv = inv.eq('type', type)
  const [i, c, accounts] = await Promise.all([inv, cash, sb.from('money_accounts').select('id,institution,name,mask,account_type,account_subtype').eq('scope', 'household').order('institution')])
  if (i.error || c.error) return NextResponse.json({ error: (i.error ?? c.error)!.message }, { status: 500 })
  const db = studioDb()
  const cashflow = db ? await cashflowByCategory(db, days).catch(() => null) : null
  return NextResponse.json({ since, days, investments: i.data ?? [], cash: c.data ?? [], accounts: accounts.data ?? [], cashflow })
}
