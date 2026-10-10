import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { PLAID_DAYS_REQUESTED, PLAID_WEBHOOK_URL, plaid } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'

// Reconnect bank: Plaid fixes how much history an item gets when it's linked,
// so widening it means starting over. Revoke the old item at Plaid
// (/item/remove), erase its token (forget_plaid_item), drop its account rows if
// nothing was imported into them, and hand back a fresh link token asking for
// PLAID_DAYS_REQUESTED days. The page then opens Plaid Link with it and the
// normal exchange creates the new item, tagged with the old ownership.
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const { itemId } = await req.json().catch(() => ({}))
  if (typeof itemId !== 'string' || !itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const accts = await db.select<{ id: string; ownership: string }[]>('money_accounts', `select=id,ownership&plaid_item_id=eq.${encodeURIComponent(itemId)}`)
  if (!accts.ok) return NextResponse.json({ error: accts.error }, { status: 500 })
  const ownership = accts.data.some((a) => a.ownership === 'business') ? 'business' : (accts.data[0]?.ownership ?? 'business')

  const tok = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
  if (tok.ok && tok.data) {
    try {
      await plaid('/item/remove', { access_token: tok.data })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/ITEM_NOT_FOUND|INVALID_ACCESS_TOKEN/.test(msg)) return NextResponse.json({ error: msg }, { status: 502 })
    }
  }
  const forgot = await db.rpc('forget_plaid_item', { p_item_id: itemId })
  if (!forgot.ok) return NextResponse.json({ error: `Revoked at Plaid, but couldn't erase the token: ${forgot.error}` }, { status: 500 })

  // The new item gets new Plaid account ids, so old empty account rows would just be duplicates.
  for (const a of accts.data) {
    const n = await db.count('transactions', `account_id=eq.${a.id}`)
    if (n.ok && n.data === 0) await db.remove('money_accounts', `id=eq.${a.id}`)
  }

  try {
    const out = await plaid('/link/token/create', {
      client_name: 'Clarendon Labs', language: 'en', country_codes: ['US'],
      user: { client_user_id: db.owner },
      webhook: PLAID_WEBHOOK_URL,
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
      products: ['transactions'], transactions: { days_requested: PLAID_DAYS_REQUESTED },
    })
    return NextResponse.json({ link_token: out.link_token, ownership })
  } catch (e) {
    return NextResponse.json({ error: `Old connection removed, but Plaid Link couldn't start: ${e instanceof Error ? e.message : 'failed'}. Use Connect with Plaid.` }, { status: 502 })
  }
}
