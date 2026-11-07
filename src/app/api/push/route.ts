import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { notify } from '@/lib/push/notify'

// ─── /api/push — the notification list (Studio app) + a test send ───────────
// GET            → the last 50 notifications (newest first) + device count
// POST {test:1}  → sends "Studio is connected" to every registered device
// PATCH {id|all} → marks read
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const [rows, devices] = await Promise.all([
    db.select('studio_notifications', 'select=id,kind,title,body,link,app_id,sent_at,sent_to,error,read_at,created_at&order=created_at.desc&limit=50'),
    db.count('studio_devices', 'disabled_at=is.null'),
  ])
  return NextResponse.json({ notifications: rows.ok ? rows.data : [], devices: devices.ok ? devices.data : 0, error: rows.ok ? undefined : rows.error })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { test?: boolean }
  if (!b.test) return NextResponse.json({ error: 'Expected { test: true }.' }, { status: 400 })
  const r = await notify({ kind: 'test', title: 'Studio is connected', body: 'Push notifications are working on this iPhone.', link: 'studio://home' })
  return NextResponse.json(r)
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean }
  const now = new Date().toISOString()
  const r = b.all ? await db.patch('studio_notifications', 'read_at=is.null', { read_at: now }) : b.id ? await db.patch('studio_notifications', `id=eq.${encodeURIComponent(b.id)}`, { read_at: now }) : null
  if (!r) return NextResponse.json({ error: 'Expected { id } or { all: true }.' }, { status: 400 })
  return NextResponse.json({ ok: r.ok })
}
