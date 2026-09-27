// ─── Analytics registry ──────────────────────────────────────────────────────
//
// Same shape as src/lib/console.ts's registry, on purpose: one place per app,
// missing config means the app just doesn't show that card rather than a
// broken panel. App Store ids are public (they're in the App Store URL), so
// they're hardcoded here; anything that's actually a credential or an
// account-specific id lives in an env var.
//
// YulePick is left out until it's live on the App Store (no sales reports
// exist for it yet) — add it here once it ships.

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
  { id: 'borea', name: 'Borea', accent: '#22D3C4', appStoreId: '6799219647' },
]

export function analyticsRegistry(): AnalyticsApp[] {
  return APPS.map((a) => ({
    ...a,
    instagramAccountId: process.env[`${a.id.toUpperCase()}_IG_ACCOUNT_ID`] || undefined,
    tiktokAdvertiserId: process.env[`${a.id.toUpperCase()}_TIKTOK_ADVERTISER_ID`] || undefined,
  }))
}
