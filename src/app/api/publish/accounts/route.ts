import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { accounts } from '@/lib/publish/platforms'

// Which app can post where right now, and why not when it can't. The
// composer greys out destinations from this, with the reason as the fix.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  return NextResponse.json({ apps: await accounts() })
}
