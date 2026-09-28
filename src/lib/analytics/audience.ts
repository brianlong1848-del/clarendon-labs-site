// ─── Instagram audience locations ────────────────────────────────────────────
//
// Where an app's Instagram followers live, by country and by city, from the
// follower_demographics insight (instagram_manage_insights). Meta only
// returns this once an account has 100+ followers — below that the call
// fails and we report status 'too_small' so the UI can explain rather than
// show an empty map.
//
// Cities come back as "Chicago, Illinois" with no country code, so the geo
// route matches the part after the last comma against the country's
// state/province names (public/geo/admin1/<CC>.json).

export type AudienceStatus = 'ok' | 'too_small' | 'not_connected' | 'error'
export type Audience = {
  status: AudienceStatus
  countries: { code: string; followers: number }[]
  cities: { name: string; followers: number }[]
}

const base = 'https://graph.facebook.com/v21.0'

async function breakdown(igId: string, token: string, by: 'country' | 'city') {
  const res = await fetch(
    `${base}/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${by}&access_token=${token}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) },
  )
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const e = body?.error
    console.error(`[audience] ${igId} ${by}: HTTP ${res.status}`, e ? `${e.code ?? ''}/${e.error_subcode ?? ''} ${e.message ?? ''}` : '')
    // Meta's "not enough followers" reply is a 400 with code 100; treat any
    // 400 here as the small-account case so the UI stays calm.
    return res.status === 400 ? 'too_small' as const : 'error' as const
  }
  const results = body?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []
  return (results as { dimension_values: string[]; value: number }[])
    .map((r) => ({ key: r.dimension_values?.[0] ?? '', value: r.value ?? 0 }))
    .filter((r) => r.key)
}

export async function fetchAudience(igAccountId?: string): Promise<Audience> {
  const token = process.env.META_ACCESS_TOKEN
  if (!igAccountId || !token) return { status: 'not_connected', countries: [], cities: [] }
  try {
    const [c, city] = await Promise.all([
      breakdown(igAccountId, token, 'country'),
      breakdown(igAccountId, token, 'city'),
    ])
    if (typeof c === 'string') return { status: c, countries: [], cities: [] }
    return {
      status: 'ok',
      countries: c.map((r) => ({ code: r.key.toUpperCase(), followers: r.value }))
        .sort((a, b) => b.followers - a.followers),
      cities: typeof city === 'string' ? [] : city.map((r) => ({ name: r.key, followers: r.value }))
        .sort((a, b) => b.followers - a.followers),
    }
  } catch {
    return { status: 'error', countries: [], cities: [] }
  }
}
