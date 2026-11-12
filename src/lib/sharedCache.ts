import { revalidateTag, unstable_cache } from 'next/cache'
import { after } from 'next/server'
// Internal to Next, used only by detachRefresh() below; pinned by next@15.5.x.
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'

// ─── Cache shared by every server instance ───────────────────────────────────
//
// SERVER ONLY. The Map caches elsewhere in src/lib live inside one server
// instance, so each new instance (Vercel starts them often) paid the full
// App Store / Meta / TikTok / edge-function round trips again: that was the
// 5-second Console. This keeps the finished answer in Vercel's Data Cache,
// which all instances read.
//
//   younger than `ttl`        served as is
//   between ttl and maxStale  served at once, refreshed behind the response
//   older than maxStale       rebuilt before answering
//
// Keep maxStale long. A rebuild on a cold instance (App Store reports, Meta,
// TikTok, every app's admin API) measured 18–22 s live on 2026-11-11, and
// whoever lands past maxStale waits for all of it. Better to show an older
// copy at once (it says when it was built) and let the page re-ask.
//   fresh: true               rebuilt before answering (Refresh buttons, and
//                             right after an action that changed the data)
//
// Only for data every admin sees alike, built from env credentials. Never for
// anything read through the signed-in user's session (Money, Household): the
// function must not touch cookies() or headers(), and row-level security
// decides those answers per person. Values must survive JSON.

export const DAY = 24 * 60 * 60

type Boxed<T> = { at: number; value: T }

export async function shared<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttl: number; maxStale?: number; fresh?: boolean },
): Promise<Boxed<T>> {
  const maxStale = opts.maxStale ?? opts.ttl * 10
  const read = unstable_cache(async (): Promise<Boxed<T>> => ({ at: Date.now(), value: await fn() }), [key], { revalidate: opts.ttl, tags: [key] })
  const direct = async (): Promise<Boxed<T>> => ({ at: Date.now(), value: await fn() })
  try {
    if (opts.fresh) {
      // Next won't store a value in the request that invalidated it, so build
      // it here and let the next plain read store its own copy.
      const out = await direct()
      revalidateTag(key)
      return out
    }
    const hit = await read()
    detachRefresh()
    if (Date.now() - hit.at <= maxStale * 1000) return hit
    // Too old to show. Reading it already started the refresh that will be
    // stored; answer this request with a build of its own.
    return await direct()
  } catch {
    // The cache itself failing must never take the page down with it.
    return direct()
  }
}

/** Next 15.5.27 bug: a stale unstable_cache read starts the refresh in the
 *  background, but a route handler's response is not ended until that refresh
 *  finishes (build/templates/app-route.js hands it to waitUntil, then passes
 *  the same promise to sendResponse, which awaits it before res.end()). Live,
 *  that made every stale read as slow as a rebuild. Move the pending refresh
 *  onto after(), which Vercel runs once the response has gone out. If the
 *  internals ever change shape this does nothing and reads are just slower. */
function detachRefresh() {
  try {
    const store = workAsyncStorage.getStore() as { pendingRevalidates?: Record<string, Promise<unknown>> } | undefined
    const pending = store?.pendingRevalidates
    if (!store || !pending || !Object.keys(pending).length) return
    const work = Object.values(pending)
    store.pendingRevalidates = {}
    after(() => Promise.allSettled(work))
  } catch { /* leave Next's own handling in place */ }
}

/** Drop a cached answer after something changed it. */
export function forget(key: string) {
  try { revalidateTag(key) } catch { /* outside a request */ }
}
