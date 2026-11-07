import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'

// ─── /api/push/devices — the Studio app registers its APNs token here ────────
// POST { token, env?: 'production'|'sandbox', app_version?, device_name? }
// DELETE { token }  (sign-out / notifications turned off in Settings)
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const b = (await req.json().catch(() => ({}))) as { token?: string; env?: string; app_version?: string; device_name?: string }
  const token = String(b.token ?? '').trim().toLowerCase()
  if (!/^[0-9a-f]{32,200}$/.test(token)) return NextResponse.json({ error: 'token must be the hex APNs device token' }, { status: 400 })
  const env = b.env === 'sandbox' ? 'sandbox' : 'production'
  const r = await db.upsert('studio_devices', [{ token, platform: 'ios', env, app_version: b.app_version ?? null, device_name: b.device_name ?? null, last_seen_at: new Date().toISOString(), disabled_at: null }], 'token')
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const b = (await req.json().catch(() => ({}))) as { token?: string }
  const token = String(b.token ?? '').trim().toLowerCase()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  await db.remove('studio_devices', `token=eq.${token}`)
  return NextResponse.json({ ok: true })
}
