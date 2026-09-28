// ─── Unified inbox: the shape everything is normalised into ─────────────────
//
// Every conversation, comment, review or suggestion — whatever platform it
// came from — becomes one InboxItem. The web /inbox page and the Studio iOS
// Inbox render only this shape, so a new source (TikTok comments, support
// email, an app's in-app feedback) is a new adapter on the server and shows
// up in both clients without touching either.

export type InboxKind = 'message' | 'comment' | 'review' | 'suggestion' | 'feedback' | 'mention'

export type SourceId =
  | 'instagram_dm' | 'instagram_comment'
  | 'facebook_message' | 'facebook_comment'
  | 'threads_reply' | 'tiktok_comment'
  | 'appstore_review' | 'app_admin' | 'support_email'

export type InboxAction = 'reply' | 'hide' | 'unhide' | 'approve' | 'reject' | 'done' | 'reopen' | 'read' | 'snooze'

export type ThreadEntry = { from: 'them' | 'us'; name?: string; text: string; at: string }

export type InboxItem = {
  id: string                         // '<source>:<remote id>' — stable across refreshes
  source: SourceId
  kind: InboxKind
  app: string                        // app id (rolligan, gagorder, …)
  author: { name: string; handle?: string; avatar?: string }
  title?: string                     // review title, suggested card text…
  text: string                       // the newest thing they said
  rating?: number                    // 1–5 for reviews
  at: string                         // ISO time of the newest message
  url?: string                       // open it on the platform
  context?: { label: string; thumb?: string; text?: string }  // "on your post …"
  thread: ThreadEntry[]              // oldest → newest, including our replies
  needsReply: boolean                // their message is the latest word
  actions: InboxAction[]             // what this item supports beyond done/read
  replyLimit?: number                // max characters for a reply
  replyNote?: string                 // e.g. "Instagram only lets you reply within 24h"
  meta?: Record<string, unknown>     // adapter-private (ids needed to act)
  state: { status: 'open' | 'done'; read: boolean; snoozedUntil?: string | null; note?: string | null }
}

export type SourceStatus = {
  source: SourceId
  app?: string
  label: string
  connected: boolean
  count: number
  reason?: string                    // why it isn't connected, phrased as the fix
}

export type Adapter = {
  source: SourceId
  label: string
  /** Everything recent from this source for every app it covers. Never throws:
   *  a failure becomes a SourceStatus with the reason. */
  collect(): Promise<{ items: Omit<InboxItem, 'state'>[]; status: SourceStatus[] }>
  /** Do something to one item (reply, hide, approve…). Throws with a readable
   *  message on failure. */
  act?(item: Omit<InboxItem, 'state'>, action: InboxAction, payload: { text?: string; [k: string]: unknown }): Promise<void>
}
