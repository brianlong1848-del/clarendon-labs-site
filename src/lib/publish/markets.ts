// KEEP IN SYNC: hand-copied in studio-ios/Studio/Core/Markets.swift (Studio iPhone app). Any change here
// needs the same change there, and the reverse.
// ─── Markets: one post, a local edition per country & language ──────────────
//
// Client-safe (no secrets). Some apps ship in several languages (Rolligan:
// US/UK/AU English, Spain + Latin-American Spanish, German, French; Borea: US
// English + Canadian English/French; YulePick's holiday launch: eight
// storefronts). A "market" is where an edition of a post is aimed: a set of
// countries, the exact language variant to write in, the local time zone, and
// Meta's language codes for boosting it to the right people.
//
// The composer uses this to:
//   • match each uploaded video to its market from the file name
//     ("Rolligan — UK.mp4", "appstore-es-MX-home.png", "Borea fr-CA.mp4"),
//     falling back to an untagged video, then to a same-language one;
//   • have Claude write each edition's caption in that variant (British
//     spelling for the UK, vosotros for Spain, ustedes for Mexico, Québec
//     French for Canada…), with the local App Store link and local hashtags;
//   • post every edition at the same local time in its own country;
//   • open Promote already aimed at that market's countries and language.

export type MarketId = 'us' | 'gb' | 'au' | 'ca' | 'cafr' | 'latam' | 'es' | 'br' | 'de' | 'fr'

export type Market = {
  id: MarketId
  flag: string
  /** Short label for chips: "UK", "Québec". */
  short: string
  name: string
  /** ISO country codes this edition is for (Meta geo targeting uses them as keys). */
  countries: string[]
  /** BCP-47 language variant the caption is written in. */
  lang: string
  langName: string
  /** Where "7 PM local" is measured. */
  tz: string
  /** App Store storefront for links. */
  storefront: string
  /** Meta ad locale ids, so a boost reaches speakers of this language in those
   *  countries (empty = everyone in the countries). 5 German · 9 French (France)
   *  · 44 French (Canada) · 1001 English (all). */
  metaLocales: number[]
  /** How Claude should write for this market. */
  voice: string
  /** File-name tags that mark media as made for this market (most specific first). */
  tags: string[]
}

export const MARKETS: Record<MarketId, Market> = {
  us: {
    id: 'us', flag: '🇺🇸', short: 'US', name: 'United States', countries: ['US'], lang: 'en-US', langName: 'English (US)',
    tz: 'America/Chicago', storefront: 'us', metaLocales: [],
    voice: 'American English spelling and slang.',
    tags: ['en us', 'usa', 'us', 'american', 'america'],
  },
  gb: {
    id: 'gb', flag: '🇬🇧', short: 'UK', name: 'United Kingdom & Ireland', countries: ['GB', 'IE'], lang: 'en-GB', langName: 'English (UK)',
    tz: 'Europe/London', storefront: 'gb', metaLocales: [],
    voice: 'British English: British spelling (favourite, colour, organise), British words (mates, mobile, pub, quid, brilliant). Never American-only phrasing like "y\'all", "gotten" or "awesome sauce".',
    tags: ['en gb', 'uk', 'gb', 'british', 'britain', 'england', 'ireland'],
  },
  au: {
    id: 'au', flag: '🇦🇺', short: 'AU', name: 'Australia & New Zealand', countries: ['AU', 'NZ'], lang: 'en-AU', langName: 'English (Australia)',
    tz: 'Australia/Sydney', storefront: 'au', metaLocales: [],
    voice: 'Australian English: British spelling, relaxed Aussie register (mates, arvo, reckon) used lightly, never parody. No American-only phrasing.',
    tags: ['en au', 'en nz', 'australia', 'aussie', 'au', 'aus', 'nz', 'new zealand'],
  },
  ca: {
    id: 'ca', flag: '🇨🇦', short: 'Canada', name: 'Canada (English)', countries: ['CA'], lang: 'en-CA', langName: 'English (Canada)',
    tz: 'America/Toronto', storefront: 'ca', metaLocales: [1001],
    voice: 'Canadian English: British-style spelling (colour, favourite, centre) with North American vocabulary. No "y\'all".',
    tags: ['en ca', 'canada', 'canadian', 'ca'],
  },
  cafr: {
    id: 'cafr', flag: '⚜️', short: 'Québec', name: 'Canada (français)', countries: ['CA'], lang: 'fr-CA', langName: 'Français (Canada)',
    tz: 'America/Toronto', storefront: 'ca', metaLocales: [44],
    voice: 'Québec French (français québécois), not France French: Québec vocabulary and usage (e.g. déjeuner/dîner/souper for breakfast/lunch/supper, cellulaire, magasiner). Follow the brief\'s form of address; if it says nothing, use "vous". French typography: a space before ? ! : ;',
    tags: ['fr ca', 'quebec', 'québec', 'quebecois', 'québécois', 'qc'],
  },
  latam: {
    id: 'latam', flag: '🇲🇽', short: 'LatAm', name: 'Mexico & Latin America', countries: ['MX', 'CO', 'AR', 'CL', 'PE'], lang: 'es-419', langName: 'Español (Latinoamérica)',
    tz: 'America/Mexico_City', storefront: 'mx', metaLocales: [],
    voice: 'Latin-American Spanish (es-419): "ustedes" never "vosotros", "celular"/"teléfono" never "móvil", neutral Mexican register. Opening ¡ and ¿.',
    tags: ['es mx', 'es 419', 'es la', 'mexico', 'méxico', 'latam', 'latin america', 'latinoamerica', 'mx'],
  },
  es: {
    id: 'es', flag: '🇪🇸', short: 'Spain', name: 'Spain', countries: ['ES'], lang: 'es-ES', langName: 'Español (España)',
    tz: 'Europe/Madrid', storefront: 'es', metaLocales: [],
    voice: 'Castilian Spanish from Spain (es-ES): "vosotros" for the group, "móvil", Spain slang used lightly (quedada, mola). Opening ¡ and ¿.',
    tags: ['es es', 'spain', 'españa', 'espana', 'castilian', 'castellano', 'spanish', 'español', 'espanol', 'es'],
  },
  br: {
    id: 'br', flag: '🇧🇷', short: 'Brazil', name: 'Brazil', countries: ['BR'], lang: 'pt-BR', langName: 'Português (Brasil)',
    tz: 'America/Sao_Paulo', storefront: 'br', metaLocales: [],
    voice: 'Brazilian Portuguese (pt-BR), never European Portuguese: "você", "celular", warm and casual.',
    tags: ['pt br', 'brazil', 'brasil', 'portuguese', 'português', 'portugues', 'br', 'pt'],
  },
  de: {
    id: 'de', flag: '🇩🇪', short: 'DE', name: 'Germany, Austria & Switzerland', countries: ['DE', 'AT', 'CH'], lang: 'de-DE', langName: 'Deutsch',
    tz: 'Europe/Berlin', storefront: 'de', metaLocales: [5],
    voice: 'German (de-DE): informal "du"/"ihr" for a social post, natural German not translated English; nouns capitalised; no Anglicisms where a common German word exists.',
    tags: ['de de', 'german', 'deutsch', 'germany', 'deutschland', 'de'],
  },
  fr: {
    id: 'fr', flag: '🇫🇷', short: 'France', name: 'France & Belgium', countries: ['FR', 'BE'], lang: 'fr-FR', langName: 'Français (France)',
    tz: 'Europe/Paris', storefront: 'fr', metaLocales: [9],
    voice: 'France French (fr-FR), not Québécois: "tu"/"vous" per the brief (default "vous" to an audience, "tu" fine for a party game), "portable" for phone. French typography: a space before ? ! : ;',
    tags: ['fr fr', 'french', 'français', 'francais', 'france', 'fr'],
  },
}

/** Each app's markets, home market first. Only languages the app actually
 *  ships (or, for YulePick, the launch plan's storefronts). */
export const APP_MARKETS: Record<string, MarketId[]> = {
  rolligan: ['us', 'gb', 'au', 'ca', 'latam', 'es', 'de', 'fr'],
  borea: ['us', 'ca', 'cafr'],
  yulepick: ['us', 'gb', 'au', 'latam', 'es', 'br', 'de', 'fr'],
  gagorder: ['us'],
  jinglewire: ['us'],
}

/** App-specific words that change by market — fed to Claude with the voice. */
export const APP_MARKET_NOTES: Record<string, Partial<Record<MarketId, string>>> = {
  rolligan: {
    gb: 'UK players search "pub game", "drinking game", "game with mates" — fine to lean on pub / game-night-with-mates.',
    au: 'Aussie players search "pub game", "game with mates".',
    latam: 'The pot is "el pozo"; "bank or bust" = plantarse o reventar, as in the app.',
    es: 'The pot is "el bote"; "bank or bust" = plantarse o reventar, as in the app.',
  },
  yulepick: {
    gb: 'Secret Santa (in Ireland it is also "Kris Kringle").',
    au: 'Secret Santa (often "Kris Kringle" in Australia).',
    latam: 'Secret Santa is "amigo secreto" / "intercambio de regalos".',
    es: 'Secret Santa is "amigo invisible".',
    br: 'Secret Santa is "amigo secreto".',
    de: 'Secret Santa is "Wichteln" (the person is the "Wichtel").',
    fr: 'Secret Santa is "Père Noël secret".',
  },
  borea: {
    cafr: 'Meals are déjeuner (breakfast), dîner (lunch), souper (supper), collation (snack), as in the app.',
  },
}

export const marketsFor = (appId: string): Market[] => (APP_MARKETS[appId] ?? ['us']).map((id) => MARKETS[id])
export const isMarket = (id: unknown): id is MarketId => typeof id === 'string' && id in MARKETS
export const baseLang = (m: Market) => m.lang.split('-')[0]

const norm = (s: string) => ` ${s.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9àâäçéèêëîïôöûüñ¿¡]+/g, ' ').trim()} `

/** Which market a file is for, from its name — or null if it isn't tagged.
 *  The most specific tag wins ("fr-CA" beats "fr", "es-MX" beats "es"). A tag
 *  for a market this app doesn't have maps to the app's market in the same
 *  language (a "French" video is Borea's Québec edition). */
export function marketFromName(name: string, appId: string): MarketId | null {
  const n = norm(name)
  let best: { id: MarketId; len: number } | null = null
  for (const m of Object.values(MARKETS)) {
    for (const t of m.tags) {
      if (n.includes(` ${t} `) && (!best || t.length > best.len)) best = { id: m.id, len: t.length }
    }
  }
  if (!best) return null
  const mine = APP_MARKETS[appId] ?? ['us']
  if (mine.includes(best.id)) return best.id
  const lang = baseLang(MARKETS[best.id])
  return mine.find((id) => baseLang(MARKETS[id]) === lang) ?? null
}

export type Assignment = {
  /** Media keys for this edition, in upload order. */
  keys: string[]
  /** How they were chosen. */
  how: 'tagged' | 'universal' | 'same-language' | 'picked' | 'none'
  /** Set when the media is in a different language or dialect than the market. */
  note?: string
}

/** Pick each market's media: its own tagged files, else the untagged ones
 *  (made for everyone), else another edition's file in the same language. */
export function assignMedia(
  items: { key: string; name: string }[], markets: MarketId[], appId: string,
  picked: Partial<Record<MarketId, string[]>> = {},
): Record<string, Assignment> {
  const tag = new Map(items.map((i) => [i.key, marketFromName(i.name, appId)]))
  const out: Record<string, Assignment> = {}
  for (const id of markets) {
    const m = MARKETS[id]
    const manual = picked[id]?.filter((k) => tag.has(k))
    if (manual?.length) {
      const foreign = manual.map((k) => tag.get(k)).find((t) => t && t !== id)
      out[id] = { keys: manual, how: 'picked', note: foreign ? mismatch(m, MARKETS[foreign]) : undefined }
      continue
    }
    const own = items.filter((i) => tag.get(i.key) === id).map((i) => i.key)
    if (own.length) { out[id] = { keys: own, how: 'tagged' }; continue }
    const universal = items.filter((i) => tag.get(i.key) == null).map((i) => i.key)
    if (universal.length) { out[id] = { keys: universal, how: 'universal' }; continue }
    const pref = NEAREST[id] ?? []
    const same = items
      .filter((i) => { const t = tag.get(i.key); return t && baseLang(MARKETS[t]) === baseLang(m) })
      .sort((a, b) => rank(pref, tag.get(a.key)!) - rank(pref, tag.get(b.key)!))[0]
    if (same) { out[id] = { keys: [same.key], how: 'same-language', note: mismatch(m, MARKETS[tag.get(same.key)!]) }; continue }
    out[id] = { keys: [], how: 'none' }
  }
  return out
}

/** Closest-sounding edition to borrow from when a market has no video of its own. */
const NEAREST: Partial<Record<MarketId, MarketId[]>> = {
  au: ['gb', 'us'], gb: ['au', 'us'], ca: ['us', 'gb'], us: ['ca', 'gb'], latam: ['es'], es: ['latam'], fr: ['cafr'], cafr: ['fr'],
}
const rank = (pref: MarketId[], t: MarketId) => { const i = pref.indexOf(t); return i < 0 ? 99 : i }

function mismatch(want: Market, got: Market): string {
  return baseLang(want) === baseLang(got)
    ? `Using the ${got.short} video (${got.langName}) — same language, different accent and wording.`
    : `This is the ${got.langName} video, not ${want.langName}.`
}

/** True when an edition's media speaks a different language than its market — a hard stop. */
export const wrongLanguage = (a: Assignment) => !!a.note && a.note.startsWith('This is the')

/** "2026-10-20T19:00" read as wall-clock time in `tz`, as an instant. */
export function zonedWallToUtc(wall: string, tz: string): Date {
  const [d, t = '00:00'] = wall.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const offset = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - ms
  }
  const first = guess - offset(guess)
  return new Date(guess - offset(first))
}

/** The same wall-clock time in each market; a time that has already passed
 *  there moves to the next day. */
export function localTimeIn(wall: string, tz: string, minLeadMs = 120_000): Date {
  let at = zonedWallToUtc(wall, tz)
  for (let i = 0; i < 2 && at.getTime() < Date.now() + minLeadMs; i++) {
    const d = new Date(`${wall.slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i + 1)
    at = zonedWallToUtc(`${d.toISOString().slice(0, 10)}T${wall.slice(11, 16)}`, tz)
  }
  return at
}

export const inZone = (d: Date, tz: string) =>
  d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** App Store link on the market's storefront, from a US store URL. */
export function storeLinkFor(storeUrl: string | undefined, m: Market): string | undefined {
  const id = storeUrl?.match(/id(\d+)/)?.[1]
  return id ? `https://apps.apple.com/${m.storefront}/app/id${id}` : undefined
}

/** Meta country names for the Promote sheet's chips. */
export const COUNTRY_NAME: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', IE: 'Ireland', AU: 'Australia', NZ: 'New Zealand', CA: 'Canada',
  MX: 'Mexico', CO: 'Colombia', AR: 'Argentina', CL: 'Chile', PE: 'Peru', ES: 'Spain', BR: 'Brazil',
  DE: 'Germany', AT: 'Austria', CH: 'Switzerland', FR: 'France', BE: 'Belgium',
}
