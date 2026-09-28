// ─── Runner ──────────────────────────────────────────────────────────────────
//
// SERVER ONLY. Takes a post as far as it can go within `budgetMs`: creates
// containers, waits for processing, publishes. Anything still processing when
// the budget runs out stays 'publishing' and the next run (Supabase pg_cron
// pokes /api/publish/run every 5 minutes) picks it up.

import { advance } from './platforms'
import { updatePost, type Post, type TargetState } from './store'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function run(post: Post, budgetMs = 45_000): Promise<Post> {
  const deadline = Date.now() + budgetMs
  let targets: TargetState[] = post.targets.map((t) => ({ ...t }))
  let current = post

  while (true) {
    const open = targets.filter((t) => t.status === 'pending' || t.status === 'processing')
    if (open.length === 0) break
    const steps = await Promise.all(open.map((t) => advance(current, t)))
    open.forEach((t, i) => Object.assign(t, steps[i]))
    targets = [...targets]
    const stillOpen = targets.some((t) => t.status === 'pending' || t.status === 'processing')
    current = await updatePost(post.id, { targets, status: stillOpen ? 'publishing' : finalStatus(targets) })
    if (!stillOpen || Date.now() + 6000 > deadline) break
    await sleep(5000)
  }
  return current
}

function finalStatus(targets: TargetState[]): Post['status'] {
  const ok = targets.filter((t) => t.status === 'published').length
  if (ok === targets.length) return 'done'
  return ok === 0 ? 'failed' : 'partial'
}
