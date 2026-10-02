import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Connected accounts for the Settings page. Reads through the signed-in user's
// session, so RLS applies. plaid_items is service-role only, so the safe
// columns come from a tiny join-free view of money_accounts + status below.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const sb = supabaseServer()
  const [accounts, items] = await Promise.all([
    sb.from('money_accounts').select('id,institution,name,mask,ownership,plaid_item_id').order('created_at'),
    sb.from('v_plaid_status').select('id,institution,status,updated_at'),
  ])
  if (accounts.error) return NextResponse.json({ error: accounts.error.message }, { status: 500 })
  return NextResponse.json({ accounts: accounts.data, items: items.data ?? [] })
}
