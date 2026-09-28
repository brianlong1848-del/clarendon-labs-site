import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { analyticsRegistry } from '@/lib/analytics/registry'
import { fetchAppStore } from '@/lib/analytics/appstore'
import { fetchAudience } from '@/lib/analytics/audience'

// ─── /api/analytics/geo ──────────────────────────────────────────────────────
//
// The map behind "where should I advertise?", shared by the web admin
// (/analytics/<app>) and the Studio iOS app so both show the same numbers.
//
//   ?app=rolligan              → per-country: installs + proceeds (App Store,
//                                30 days) and Instagram followers
//   ?app=rolligan&country=US   → that country's totals plus a state/province
//                                breakdown
//
// Apple only reports sales by storefront country — never by state — so the
// sub-country layer comes from sources that do know: Instagram follower
// cities today, and ad-platform region reports once Meta/TikTok ads run
// (reported as `ads.status` until then). Every layer says where it came from.
// Region shapes live in /public/geo so both clients draw identical maps.

export const dynamic = 'force-dynamic'

type Feature = { properties: { c: string; n: string; t?: string } }

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(state|province|prefecture|region|oblast|county|department|of)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()

export async function GET(req: Request) {
  if (!consoleAuthed(req)) return NextResponse.json({ error: 'not authorised' }, { status: 401 })

  const url = new URL(req.url)
  const app = analyticsRegistry().find((a) => a.id === url.searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 404 })
  const country = url.searchParams.get('country')?.toUpperCase() ?? null

  const [store, audience] = await Promise.all([
    fetchAppStore(app.appStoreId),
    fetchAudience(app.instagramAccountId),
  ])
  const ads = { status: 'not_connected' as const, note: 'Region-level results appear here once Meta or TikTok ads run for this app.' }

  if (!country) {
    const byCode = new Map<string, { code: string; installs: number; proceeds: number; followers: number }>()
    const row = (code: string) => {
      if (!byCode.has(code)) byCode.set(code, { code, installs: 0, proceeds: 0, followers: 0 })
      return byCode.get(code)!
    }
    for (const c of store?.countries ?? []) Object.assign(row(c.code), { installs: c.installs, proceeds: c.proceeds })
    for (const c of audience.countries) row(c.code).followers = c.followers
    return NextResponse.json({
      app: app.id,
      reportDate: store?.reportDate ?? null,
      countries: Array.from(byCode.values()).sort((a, b) => b.installs - a.installs || b.proceeds - a.proceeds || b.followers - a.followers),
      audienceStatus: audience.status,
      ads,
    })
  }

  // Region shapes (served statically) → names to match Instagram cities against.
  let features: Feature[] = []
  try {
    const res = await fetch(new URL(`/geo/admin1/${country}.json`, url.origin), { cache: 'force-cache' })
    if (res.ok) features = (await res.json()).features ?? []
  } catch { /* no shapes for this country — list still works */ }

  const lookup = new Map(features.map((f) => [norm(f.properties.n), f.properties]))
  const regions = new Map<string, { code: string; name: string; followers: number; cities: { name: string; followers: number }[] }>()
  let matchedFollowers = 0
  for (const city of audience.cities) {
    const regionName = city.name.split(',').slice(1).join(',').trim() || city.name
    const hit = lookup.get(norm(regionName))
    if (!hit) continue
    const r = regions.get(hit.c) ?? { code: hit.c, name: hit.n, followers: 0, cities: [] }
    r.followers += city.followers
    r.cities.push({ name: city.name.split(',')[0].trim(), followers: city.followers })
    regions.set(hit.c, r)
    matchedFollowers += city.followers
  }

  const storeRow = store?.countries?.find((c) => c.code === country)
  const followersInCountry = audience.countries.find((c) => c.code === country)?.followers ?? 0
  const types = features.map((f) => f.properties.t).filter(Boolean) as string[]
  const regionType = types.sort((a, b) => types.filter((t) => t === b).length - types.filter((t) => t === a).length)[0] ?? 'Region'

  return NextResponse.json({
    app: app.id,
    country,
    regionType,
    appStore: { installs: storeRow?.installs ?? 0, proceeds: storeRow?.proceeds ?? 0, note: 'Apple reports sales by country only.' },
    instagram: {
      status: audience.status,
      followers: followersInCountry,
      // Instagram only lists each account's top cities, so regions won't
      // always add up to the country total.
      mappedFollowers: matchedFollowers,
    },
    regions: Array.from(regions.values()).sort((a, b) => b.followers - a.followers),
    ads,
  })
}
