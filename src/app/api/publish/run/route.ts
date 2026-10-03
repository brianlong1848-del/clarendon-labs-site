import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { claim, duePosts } from '@/lib/publish/store'
import { run } from '@/lib/publish/runner'
import { refreshThreadsTokens } from '@/lib/publish/tokens'
import { consoleAuthed } from '@/lib/console'

// Poked every 5 minutes by pg_cron in Supabase (job "studio-publish-runner"),
// which sends "Authorization: Bearer <PUBLISH_RUN_SECRET>" from Supabase Vault.
// The /post page also pokes it while you're signed in, so a signed-in admin
// session is accepted too. Anyone else gets 401. An unset PUBLISH_RUN_SECRET
// means only the admin session works, never "open".
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function secretOk(header: string | null): boolean {
  const want = process.env.PUBLISH_RUN_SECRET ?? ''
  const got = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? ''
  if (!want || !got) return false
  const a = Buffer.from(got), b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(req: Request) {
  if (!secretOk(req.headers.get('authorization')) && !(await consoleAuthed())) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  }
  await refreshThreadsTokens().catch(() => {})
  const due = await duePosts().catch(() => [])
  const results: { id: string; status: string }[] = []
  const started = Date.now()
  for (const p of due) {
    if (Date.now() - started > 40_000) break
    // A post the composer is actively publishing right now is left to it.
    if (p.status === 'publishing' && Date.now() - new Date(p.updated_at).getTime() < 70_000) continue
    if (p.status === 'scheduled' && !(await claim(p.id))) continue
    const done = await run({ ...p, status: 'publishing' }, 20_000)
    results.push({ id: done.id, status: done.status })
  }
  return NextResponse.json({ ran: results.length, results })
}

export const GET = handle
export const POST = handle
