import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Who shares this console (Security page). Reads through the signed-in
// member's session: studio_members_status() only answers for a member with
// 2FA completed, and returns no secrets — email, name, authenticator yes/no,
// last sign-in. `me` lets the page mark the caller's own row.
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const sb = await supabaseServer()
  const [{ data: members, error }, { data: me }] = await Promise.all([sb.rpc('studio_members_status'), sb.auth.getUser()])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: members ?? [], me: me.user?.id ?? null })
}
