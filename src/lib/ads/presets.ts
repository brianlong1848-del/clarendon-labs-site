// ─── Promote audience presets ────────────────────────────────────────────────
//
// Client-safe (no secrets): one-click audiences for the Promote sheet. Built-in
// presets live here; Brian's own saved ones live in studio_audience_presets
// (see /api/ads/meta?presets=1) and are merged in after these.
//
// Why Gag Order's preset is cities + adjacent interests: Meta removed every
// sexual-orientation targeting option (LGBT, gay, lesbian, queer, drag, RuPaul…)
// in January 2022 — the API returns nothing for them. The closest legal
// stand-ins are the US cities and resort towns with the biggest queer
// communities, interests that skew to nightlife / game night, and letting
// Meta learn from who engages with the post ("expand" on).
//
// Place keys are Meta's geo keys (stable). Cities fully inside another city's
// radius are left out (West Hollywood ⊂ LA 15 mi, Wilton Manors ⊂ Fort
// Lauderdale) because Meta rejects overlapping locations.

export type PresetPlace = { key: string; name: string; type: 'country' | 'region' | 'city'; region?: string; radiusMiles?: number }
export type PresetInterest = { id: string; name: string }
export type AudiencePreset = {
  id: string
  appId: string
  name: string
  note?: string
  platform?: 'instagram' | 'facebook'
  goal?: 'engagement' | 'reach' | 'downloads'
  dailyUsd?: number
  days?: number
  audience: {
    ageMin: number; ageMax: number; genders: 'all' | 'men' | 'women'
    places: PresetPlace[]; interests: PresetInterest[]; expand: boolean
    locales?: number[]
  }
  /** Set on the per-market presets (publish/markets.ts). */
  market?: MarketId
  saved?: boolean
}

import { APP_MARKETS, COUNTRY_NAME, MARKETS, type MarketId } from '@/lib/publish/markets'

const city = (key: string, name: string, region: string, radiusMiles = 15): PresetPlace => ({ key, name, type: 'city', region, radiusMiles })

const QUEER_CITIES: PresetPlace[] = [
  city('2438177', 'Chicago', 'Illinois'),
  city('2490299', 'New York', 'New York'),
  city('2420379', 'Los Angeles', 'California'),
  city('2421836', 'San Francisco', 'California'),
  city('2421209', 'Palm Springs', 'California', 10),
  city('2421830', 'San Diego', 'California'),
  city('2428179', 'Fort Lauderdale', 'Florida'),
  city('2428988', 'Miami Beach', 'Florida', 10),
  city('2466164', 'Provincetown', 'Massachusetts', 10),
  city('2464828', 'Boston', 'Massachusetts'),
  city('2427178', 'Washington D. C.', 'District of Columbia'),
  city('2511940', 'Philadelphia', 'Pennsylvania'),
  city('2483063', 'Asbury Park', 'New Jersey', 10),
  city('2454320', 'New Orleans', 'Louisiana'),
  city('2430536', 'Atlanta', 'Georgia'),
  city('2525495', 'Austin', 'Texas'),
  city('2526493', 'Dallas', 'Texas'),
  city('2527622', 'Houston', 'Texas'),
  city('2542527', 'Seattle', 'Washington'),
  city('2505639', 'Portland', 'Oregon'),
  city('2423371', 'Denver', 'Colorado'),
  city('2471428', 'Minneapolis', 'Minnesota'),
  city('2498913', 'Columbus', 'Ohio'),
  city('2469039', 'Saugatuck', 'Michigan', 10),
  city('2413713', 'Phoenix', 'Arizona'),
  city('2481714', 'Las Vegas', 'Nevada'),
  city('2532348', 'Salt Lake City', 'Utah'),
  city('2523484', 'Nashville', 'Tennessee'),
]

const GAME_NIGHT_INTERESTS: PresetInterest[] = [
  { id: '6003208313176', name: 'Party game' },
  { id: '6003342470823', name: 'Board games' },
  { id: '6003375995381', name: 'Nightlife' },
  { id: '6003531191998', name: 'Brunch' },
  { id: '6002931949762', name: 'Cocktail' },
  { id: '6003351312828', name: 'Musical theatre' },
  { id: '6003347246474', name: 'Karaoke' },
  { id: '6003337755136', name: 'Trivia' },
]

export const BUILT_IN_PRESETS: AudiencePreset[] = [
  {
    id: 'gagorder-queer-cities', appId: 'gagorder', name: 'Queer cities · game night',
    note: '28 US cities with the biggest gay & lesbian communities, 21–44, nightlife / game-night interests, Download button to the App Store, Meta expands to people like the ones who tap.',
    platform: 'instagram', goal: 'downloads', dailyUsd: 10, days: 3,
    audience: { ageMin: 21, ageMax: 44, genders: 'all', places: QUEER_CITIES, interests: GAME_NIGHT_INTERESTS, expand: true },
  },
  {
    id: 'gagorder-queer-cities-broad', appId: 'gagorder', name: 'Queer cities · everyone 21–44',
    note: 'Same cities, no interests — widest reach in those places.',
    platform: 'instagram', goal: 'reach', dailyUsd: 10, days: 3,
    audience: { ageMin: 21, ageMax: 44, genders: 'all', places: QUEER_CITIES, interests: [], expand: false },
  },
  {
    id: 'gagorder-chicago', appId: 'gagorder', name: 'Chicago only',
    note: 'Home city test: Chicago +15 mi (Boystown, Andersonville), 21–44.',
    platform: 'instagram', goal: 'engagement', dailyUsd: 5, days: 3,
    audience: { ageMin: 21, ageMax: 44, genders: 'all', places: [QUEER_CITIES[0]], interests: [], expand: true },
  },
]

// One preset per market for apps that ship in several languages: that
// market's countries, and (where a country speaks more than one language)
// only people using Facebook/Instagram in the edition's language.
const MARKET_AGES: Record<string, [number, number]> = { rolligan: [18, 44], borea: [21, 54], yulepick: [25, 55] }
export const marketPresetId = (appId: string, m: MarketId) => `market-${appId}-${m}`
const MARKET_PRESETS: AudiencePreset[] = Object.entries(APP_MARKETS).filter(([, ms]) => ms.length > 1).flatMap(([appId, ms]) =>
  ms.map((id) => {
    const m = MARKETS[id]
    const [ageMin, ageMax] = MARKET_AGES[appId] ?? [18, 65]
    return {
      id: marketPresetId(appId, id), appId, market: id, name: `${m.flag} ${m.short} · ${m.langName}`,
      note: `${m.countries.map((c) => COUNTRY_NAME[c] ?? c).join(', ')}${m.metaLocales.length ? `, people using Facebook/Instagram in ${m.langName}` : ''}. Pairs with the ${m.short} edition of a post.`,
      platform: 'instagram', goal: 'downloads', dailyUsd: 10, days: 3,
      audience: {
        ageMin, ageMax, genders: 'all', interests: [], expand: true, locales: m.metaLocales,
        places: m.countries.map((c) => ({ key: c, name: COUNTRY_NAME[c] ?? c, type: 'country' as const })),
      },
    } satisfies AudiencePreset
  }))

export const presetsFor = (appId: string, saved: AudiencePreset[] = []) =>
  [...BUILT_IN_PRESETS.filter((p) => p.appId === appId), ...MARKET_PRESETS.filter((p) => p.appId === appId), ...saved.filter((p) => p.appId === appId)]
