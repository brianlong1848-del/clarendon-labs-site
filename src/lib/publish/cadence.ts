// ─── Posting cadence targets (Calendar → cadence meter) ─────────────────────
//
// Client-safe. How often each app should post while a push is on, from the
// marketing plan. An app with no entry shows no meter. Stories are any target
// in Story format; posts are everything else (feed, Reel, Thread, TikTok).

export type Cadence = { posts: number; stories: number; /** Last day (America/Chicago) the target applies. */ until?: string; why?: string }

export const CADENCE: Record<string, Cadence> = {
  // Holiday push (YulePick marketing plan, 2026-11): 2 posts + 1 story a day through Thanksgiving week.
  yulepick: { posts: 2, stories: 1, until: '2026-11-27', why: 'Holiday push' },
}
