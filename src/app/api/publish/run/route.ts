import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { claim, duePosts, getSeries, postsNeedingStats, unloggedPosts, updatePost, type PostStat } from '@/lib/publish/store'
import { postStats } from '@/lib/publish/platforms'
import { materializeDue } from '@/lib/publish/series'
import { logPost } from '@/lib/publish/marketing'
import { driveConfigured } from '@/lib/drive'
import { run } from '@/lib/publish/runner'
import { refreshThreadsTokens } from '@/lib/publish/tokens'
import { refreshTikTokTokens } from '@/lib/publish/tiktok'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { consoleAuthed } from '@/lib/console'

// Each run: (1) tops up repeating series — makes the next copy, with a fresh
// AI caption, up to 48h ahead; (2) publishes whatever is due; (3) appends
// finished posts to Marketing/<App>-post-log.md in Drive; (4) reads each
// post's reach/engagement ~48h later so "Best time" learns.
//
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
  await refreshTikTokTokens(PUBLISH_APPS.map((a) => a.id)).catch(() => {})
  const started = Date.now()
  const made = await materializeDue(15_000).catch(() => 0)
  const due = await duePosts().catch(() => [])
  const results: { id: string; status: string }[] = []
  for (const p of due) {
    if (Date.now() - started > 40_000) break
    // A post the composer is actively publishing right now is left to it.
    if (p.status === 'publishing' && Date.now() - new Date(p.updated_at).getTime() < 70_000) continue
    if (p.status === 'scheduled' && !(await claim(p.id))) continue
    const done = await run({ ...p, status: 'publishing' }, 20_000)
    results.push({ id: done.id, status: done.status })
  }
  let logged = 0
  const logErrors: string[] = []
  if (driveConfigured() && Date.now() - started < 48_000) {
    for (const p of await unloggedPosts().catch(() => [])) {
      if (Date.now() - started > 52_000) break
      try {
        const series = p.series_id ? await getSeries(p.series_id).catch(() => null) : null
        await logPost(p, series)
        await updatePost(p.id, { logged_at: new Date().toISOString() })
        logged++
      } catch (e) { logErrors.push(`${p.app_id}: ${(e as Error).message}`) }
    }
  }
  // (4) Read results ~48h after posting, for "Best time".
  let measured = 0
  if (Date.now() - started < 50_000) {
    for (const p of await postsNeedingStats().catch(() => [])) {
      if (Date.now() - started > 54_000) break
      const stats: Record<string, PostStat> = {}
      for (const t of p.targets) {
        const r = await postStats(p, t)
        if (r) stats[t.platform] = { ...r, at: new Date().toISOString() }
      }
      await updatePost(p.id, { stats: Object.keys(stats).length ? stats : null, stats_at: new Date().toISOString() }).catch(() => null)
      measured++
    }
  }
  return NextResponse.json({ made, measured, ran: results.length, results, logged, ...(logErrors.length ? { logErrors } : {}) })
}

export const GET = handle
export const POST = handle
