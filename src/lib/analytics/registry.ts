// ─── Analytics registry ──────────────────────────────────────────────────────
//
// Same shape as src/lib/console.ts's registry, on purpose: one place per app,
// missing config means the app just doesn't show that card rather than a
// broken panel. App Store ids are public (they're in the App Store URL), so
// they're hardcoded here; anything that's actually a credential or an
// account-specific id lives in an env var.
//
// YulePick joined 2026-11-11 (live on the App Store since 2026-11-05).
// Instagram: <APP>_IG_ACCOUNT_ID, else the Instagram linked to the app's
// Facebook Page (same lookup /post uses) — see withInstagram().

export type AnalyticsApp = {
  id: string
  name: string
  accent: string
  appStoreId: string
  instagramAccountId?: string
  tiktokAdvertiserId?: string
}

const APPS: Omit<AnalyticsApp, 'instagramAccountId' | 'tiktokAdvertiserId'>[] = [
  { id: 'rolligan', name: 'Rolligan', accent: '#F2814F', appStoreId: '6774974562' },
  { id: 'gagorder', name: 'Gag Order', accent: '#F0509A', appStoreId: '6776382535' },
  { id: 'yulepick', name: 'YulePick', accent: '#E8474C', appStoreId: '6778490588' },
  { id: 'borea', name: 'Borea', accent: '#22D3C4', appStoreId: '6799219647' },
]

export function analyticsRegistry(): AnalyticsApp[] {
  return APPS.map((a) => ({
    ...a,
    instagramAccountId: process.env[`${a.id.toUpperCase()}_IG_ACCOUNT_ID`] || undefined,
    tiktokAdvertiserId: process.env[`${a.id.toUpperCase()}_TIKTOK_ADVERTISER_ID`] || undefined,
  }))
}

/** Fills a missing instagramAccountId from the app's Facebook Page, so an app
 *  without <APP>_IG_ACCOUNT_ID still gets its Instagram + Facebook tiles. */
export async function withInstagram(apps: AnalyticsApp[]): Promise<AnalyticsApp[]> {
  const { igFor } = await import('@/lib/publish/platforms')
  return Promise.all(apps.map(async (a) => (a.instagramAccountId ? a : { ...a, instagramAccountId: (await igFor(a.id).catch(() => undefined)) || undefined })))
}
