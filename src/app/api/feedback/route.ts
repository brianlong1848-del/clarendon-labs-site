import { NextResponse } from 'next/server'

// ─── /api/feedback — in-app feedback from every Clarendon app ───────────────
//
// PUBLIC on purpose: the iOS apps post here from a "Send feedback" screen,
// with no login. Everything lands in studio_feedback and shows up in the
// studio Inbox (clarendon.dev/inbox, Studio iOS) as "In-app feedback".
//
//   POST { app, message, email?, name?, kind?, platform?, appVersion?, device?, locale? }
//
// Guard rails: known app ids only, length caps, a per-IP limit of 5 a minute
// / 30 a day, and a honeypot field bots fill in. IPs are stored only as a
// salted hash, for rate limiting.

export const dynamic = 'force-dynamic'

const APPS = new Set(['rolligan', 'gagorder', 'yulepick', 'borea', 'jinglewire'])
const KINDS = new Set(['feedback', 'bug', 'idea', 'support'])
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cors })
  const b = await req.json().catch(() => null)
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  if (!b || !APPS.has(b.app)) return NextResponse.json({ error: 'unknown app' }, { status: 400, headers: cors })
  if (str(b.website, 10)) return NextResponse.json({ ok: true }, { headers: cors }) // honeypot
  const message = str(b.message, 4000)
  if (message.length < 2) return NextResponse.json({ error: 'Write a message first.' }, { status: 400, headers: cors })
  const email = str(b.email, 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400, headers: cors })

  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const ipHash = await sha(`${ip}:${key.slice(-12)}`)
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const recent = async (ms: number) => {
    const r = await fetch(`${url}/rest/v1/studio_feedback?select=id&ip_hash=eq.${ipHash}&created_at=gte.${since(ms)}`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' }, cache: 'no-store' })
    return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
  }
  if ((await recent(60_000)) >= 5 || (await recent(86400_000)) >= 30) {
    return NextResponse.json({ error: 'Thanks — we’ve got a lot from you already today. Try again later.' }, { status: 429, headers: cors })
  }

  const res = await fetch(`${url}/rest/v1/studio_feedback`, {
    method: 'POST', headers: h, cache: 'no-store',
    body: JSON.stringify({
      app_id: b.app, message, email: email || null, name: str(b.name, 80) || null,
      kind: KINDS.has(b.kind) ? b.kind : 'feedback',
      platform: str(b.platform, 20) || null, app_version: str(b.appVersion, 20) || null,
      device: str(b.device, 60) || null, locale: str(b.locale, 20) || null, ip_hash: ipHash,
    }),
  })
  if (!res.ok) return NextResponse.json({ error: 'Couldn’t send — try again.' }, { status: 502, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}
