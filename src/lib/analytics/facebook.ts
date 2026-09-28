// ─── Facebook Pages ──────────────────────────────────────────────────────────
//
// Each app's Facebook Page, found through the Instagram account it's linked
// to — so there's no extra env var per app: the system-user token lists the
// Pages it can see (/me/accounts), and each Page reports which Instagram
// professional account it's connected to. Uses META_ACCESS_TOKEN only.
//
// Followers and "posts in the last 30 days" need nothing beyond
// pages_show_list + pages_read_engagement. Page reach/impressions need
// read_insights, which only appears once that use case is added to the Meta
// app — until then reach30d stays null and the UI says so.

export type FacebookMetrics = {
  pageId: string
  name: string
  followers: number
  posts30d: number | null
} | null

type PageRow = {
  id: string
  name: string
  followers_count?: number
  fan_count?: number
  access_token?: string
  instagram_business_account?: { id: string }
}

const base = 'https://graph.facebook.com/v21.0'

// One /me/accounts call per request, shared by every app's lookup.
let inflight: { at: number; pages: Promise<PageRow[]> } | null = null

function pages(token: string): Promise<PageRow[]> {
  if (inflight && Date.now() - inflight.at < 30_000) return inflight.pages
  const p = (async () => {
    const res = await fetch(
      `${base}/me/accounts?fields=id,name,followers_count,fan_count,access_token,instagram_business_account{id}&limit=100&access_token=${token}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      console.error(`[facebook] /me/accounts: HTTP ${res.status}`,
        err?.error ? `${err.error.type ?? ''} ${err.error.code ?? ''} ${err.error.message ?? ''}` : '')
      return []
    }
    const body = await res.json()
    return (body?.data ?? []) as PageRow[]
  })().catch(() => [] as PageRow[])
  inflight = { at: Date.now(), pages: p }
  return p
}

export async function fetchFacebook(igAccountId?: string): Promise<FacebookMetrics> {
  const token = process.env.META_ACCESS_TOKEN
  if (!igAccountId || !token) return null
  const page = (await pages(token)).find((p) => p.instagram_business_account?.id === igAccountId)
  if (!page) return null

  let posts30d: number | null = null
  if (page.access_token) {
    try {
      const since = Math.floor(Date.now() / 1000) - 30 * 86400
      const res = await fetch(
        `${base}/${page.id}/published_posts?fields=id&since=${since}&limit=100&access_token=${page.access_token}`,
        { cache: 'no-store', signal: AbortSignal.timeout(8000) },
      )
      if (res.ok) posts30d = ((await res.json())?.data ?? []).length
    } catch { /* posts count is a bonus number */ }
  }

  return {
    pageId: page.id,
    name: page.name,
    followers: page.followers_count ?? page.fan_count ?? 0,
    posts30d,
  }
}
