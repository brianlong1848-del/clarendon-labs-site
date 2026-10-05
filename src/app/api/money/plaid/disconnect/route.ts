import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { plaid } from '@/lib/money/plaid'

export const dynamic = 'force-dynamic'

// Disconnect a bank, as the Clarendon Admin privacy policy promises: revoke the
// connection at Plaid (/item/remove), then erase the access token from Vault and
// drop the item (forget_plaid_item). Accounts and transactions stay for the books.
export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const { itemId } = await req.json().catch(() => ({}))
  if (typeof itemId !== 'string' || !itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const tok = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
  if (tok.ok && tok.data) {
    try {
      await plaid('/item/remove', { access_token: tok.data })
    } catch (e) {
      // Already gone at Plaid (or a sandbox token after the switch to production): still forget it here.
      const msg = e instanceof Error ? e.message : String(e)
      if (!/ITEM_NOT_FOUND|INVALID_ACCESS_TOKEN|INVALID_API_KEYS/.test(msg)) return NextResponse.json({ error: msg }, { status: 502 })
    }
  }
  const forgot = await db.rpc('forget_plaid_item', { p_item_id: itemId })
  if (!forgot.ok) return NextResponse.json({ error: `Revoked at Plaid, but couldn't erase the token: ${forgot.error}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
