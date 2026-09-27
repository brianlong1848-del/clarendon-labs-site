// ─── Instagram Graph API ─────────────────────────────────────────────────────
//
// Follower count, post count, and 30-day reach for one professional Instagram
// account. Needs META_ACCESS_TOKEN (a long-lived Page/Instagram access token
// from the Clarendon Labs Meta app, once its Graph API permissions are
// approved) plus that app's IG business-account id (the numeric id shown next
// to the account in Business Suite → Instagram accounts → Details — not the
// @handle).

export type InstagramMetrics = { followers: number; posts: number; reach30d: number | null } | null

export async function fetchInstagram(igAccountId?: string): Promise<InstagramMetrics> {
  const token = process.env.META_ACCESS_TOKEN
  if (!igAccountId || !token) return null
  const base = 'https://graph.facebook.com/v21.0'

  try {
    const profileRes = await fetch(
      `${base}/${igAccountId}?fields=followers_count,media_count&access_token=${token}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    )
    if (!profileRes.ok) {
      // Surface Meta's reason in Vercel's runtime logs (never the token itself):
      // expired token, missing permission, or a Page id where an IG id belongs.
      const err = await profileRes.json().catch(() => null)
      console.error(`[instagram] ${igAccountId}: HTTP ${profileRes.status}`,
        err?.error ? `${err.error.type ?? ''} ${err.error.code ?? ''}/${err.error.error_subcode ?? ''} ${err.error.message ?? ''}` : '')
      return null
    }
    const profile = await profileRes.json()

    let reach30d: number | null = null
    try {
      const end = Math.floor(Date.now() / 1000)
      const start = end - 30 * 86400
      const insightsRes = await fetch(
        `${base}/${igAccountId}/insights?metric=reach&period=day&since=${start}&until=${end}&access_token=${token}`,
        { cache: 'no-store', signal: AbortSignal.timeout(8000) },
      )
      if (insightsRes.ok) {
        const insights = await insightsRes.json()
        const values = insights?.data?.[0]?.values ?? []
        reach30d = values.reduce((sum: number, v: { value: number }) => sum + (v.value ?? 0), 0)
      }
    } catch {
      // Reach is a bonus number — a miss here shouldn't sink the followers/posts card.
    }

    return {
      followers: profile.followers_count ?? 0,
      posts: profile.media_count ?? 0,
      reach30d,
    }
  } catch (e) {
    console.error(`[instagram] ${igAccountId}: request failed`, e instanceof Error ? e.message : '')
    return null
  }
}
