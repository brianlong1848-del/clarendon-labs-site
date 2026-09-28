import { NextResponse } from 'next/server'
import { claim, duePosts } from '@/lib/publish/store'
import { run } from '@/lib/publish/runner'

// Poked every 5 minutes by pg_cron in Supabase. Only ever publishes posts
// whose scheduled time has passed (or that are mid-publish), so it needs no
// secret: calling it early just does nothing.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle() {
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
