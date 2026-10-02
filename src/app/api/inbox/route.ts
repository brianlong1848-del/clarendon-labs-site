import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { act, inbox } from '@/lib/inbox'
import type { InboxAction } from '@/lib/inbox/types'

// ─── /api/inbox — everything people say to the studio, in one place ─────────
//
//   GET  [?refresh=1]              → { items, sources, fetchedAt }
//   POST { id, action, text?, … }  → reply / hide / approve / done / snooze…
//
// Shared by clarendon.dev/inbox and the Studio iOS Inbox tab.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTIONS: InboxAction[] = ['reply', 'hide', 'unhide', 'approve', 'reject', 'done', 'reopen', 'read', 'snooze']

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const force = new URL(req.url).searchParams.get('refresh') === '1'
  return NextResponse.json(await inbox({ force }))
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body?.id || !ACTIONS.includes(body.action)) return NextResponse.json({ error: 'Expected { id, action }.' }, { status: 400 })
  const { id, action, ...payload } = body
  try {
    await act(String(id), action, payload)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
