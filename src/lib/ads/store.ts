// Client-safe: each live app's App Store page, and the Clarendon landing page
// ads use as their Download link. Meta refuses apps.apple.com as an ad link
// unless the campaign is an App Installs campaign, so Download buttons point
// to clarendon.dev/get/<app>, which forwards straight to the App Store.
export const STORE_APPS: Record<string, { name: string; store: string; tagline: string }> = {
  rolligan: { name: 'Rolligan', store: 'https://apps.apple.com/us/app/rolligan/id6774974562', tagline: 'The push-your-luck dice party game.' },
  gagorder: { name: 'Gag Order', store: 'https://apps.apple.com/us/app/gag-order-party-game/id6776382535', tagline: 'The anonymous “most likely to” party game.' },
  borea: { name: 'Borea', store: 'https://apps.apple.com/us/app/borea/id6799219647', tagline: 'Progress pics, played back.' },
}
export const downloadLink = (appId: string) => `https://clarendon.dev/get/${appId}`

// ─── App Store campaign links (FEAT-CLA-024) ────────────────────────────────
// /get/<app>?ct=<token> 302s to Apple's campaign URL
//   https://apps.apple.com/app/apple-store/id<APP_ID>?pt=<provider>&ct=<token>&mt=8
// so App Store Connect → App Analytics → Sources → Campaigns attributes the
// installs. Apps without an App Store ID yet 404 at /get/<app> until it's set.

/** App Store numeric IDs. `undefined` = not on the App Store yet (404 at /get/<app>). */
export const APP_STORE_IDS: Record<string, string | undefined> = {
  rolligan: '6774974562',
  gagorder: '6776382535',
  borea: '6799219647',
  yulepick: undefined,
  jinglewire: undefined,
}

/** Apple's campaign token limit. */
export const CT_MAX = 40
export const CT_DEFAULT = 'direct'

/** Apple campaign token: a-z 0-9 _ - only, lower-cased, at most 40 chars; 'direct' when nothing's left. */
export function cleanCt(v: unknown): string {
  const s = typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, CT_MAX) : ''
  return s || CT_DEFAULT
}

/** A caption/notes fragment as a token slug: "New 3D dice!" → "new-3d-dice". */
export function ctSlug(v: string, max = 20): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '')
}

const yyyymmdd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/** The token a post's link carries: <platform>-<yyyymmdd>-<slug>, trimmed to Apple's 40 chars. */
export function campaignToken(platform: string, date: Date, slug: string): string {
  const head = `${platform}-${yyyymmdd(date)}`
  const s = ctSlug(slug, Math.max(0, CT_MAX - head.length - 1))
  return cleanCt(s ? `${head}-${s}` : head)
}

/** clarendon.dev/get/<app>?ct=<token> — what goes in a caption or an ad's Download button. */
export const campaignLink = (appId: string, ct: string) => `${downloadLink(appId)}?ct=${encodeURIComponent(cleanCt(ct))}`
