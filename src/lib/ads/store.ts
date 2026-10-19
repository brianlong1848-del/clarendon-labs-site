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
