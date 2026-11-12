import { revalidateTag, unstable_cache } from 'next/cache'

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
//   fresh: true               rebuilt before answering (Refresh buttons, and
//                             right after an action that changed the data)
//
// Only for data every admin sees alike, built from env credentials. Never for
// anything read through the signed-in user's session (Money, Household): the
// function must not touch cookies() or headers(), and row-level security
// decides those answers per person. Values must survive JSON.

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
    if (Date.now() - hit.at <= maxStale * 1000) return hit
    // Too old to show. Reading it already started the refresh that will be
    // stored; answer this request with a build of its own.
    return await direct()
  } catch {
    // The cache itself failing must never take the page down with it.
    return direct()
  }
}

/** Drop a cached answer after something changed it. */
export function forget(key: string) {
  try { revalidateTag(key) } catch { /* outside a request */ }
}
