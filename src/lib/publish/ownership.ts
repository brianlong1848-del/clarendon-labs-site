// ─── Is this social account really the app's? ───────────────────────────────
//
// Threads connects whichever account is signed in on threads.net, and TikTok
// lets you pick any account you're signed in to — so it's easy to connect an
// app to the wrong brand, or to Brian's personal account. Every app's handle
// contains its id (@playrolligan, @gagordergame, @yulepick.app, @borea360,
// @boreaapp, @jinglewire), so a handle without it is refused or flagged.

const NAMES: Record<string, string> = { rolligan: 'Rolligan', gagorder: 'Gag Order', yulepick: 'YulePick', borea: 'Borea', jinglewire: 'Jinglewire' }

export const appName = (appId: string) => NAMES[appId] ?? appId

/** True when the handle plausibly belongs to the app; unknown handles pass. */
export function handleFits(appId: string, handle: string | null | undefined) {
  if (!handle) return true
  return handle.toLowerCase().replace(/[^a-z0-9]/g, '').includes(appId.toLowerCase())
}

export function wrongAccount(appId: string, handle: string, platform: 'Threads' | 'TikTok') {
  return `@${handle} isn’t ${appName(appId)}’s ${platform} account. ${platform === 'Threads'
    ? `On threads.com, log out, log in as ${appName(appId)}’s account (through its Instagram), then press Connect again.`
    : `Press Connect TikTok again and pick ${appName(appId)}’s account on TikTok’s screen (use “Switch account” there if it opens on another one).`}`
}
