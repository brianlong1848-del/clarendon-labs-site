// ─── Unified inbox: registry, gathering, state, actions ─────────────────────
//
// SERVER ONLY. Adding a source = write an Adapter and add it to ADAPTERS.
// Items are fetched live from each platform (cached ~45s), then merged with
// the studio's own state (read / done / snoozed) from Supabase.

import type { Adapter, InboxAction, InboxItem, SourceStatus } from './types'
import { facebookComments, facebookMessages, instagramComments, instagramDMs } from './meta'
import { appAdmin, appStoreReviews, upcoming } from './sources'

export const ADAPTERS: Adapter[] = [instagramDMs, instagramComments, facebookMessages, facebookComments, appStoreReviews, appAdmin]

type Raw = Omit<InboxItem, 'state'>
type StateRow = { item_id: string; status: 'open' | 'done'; read_at: string | null; snoozed_until: string | null; note: string | null }

let cache: { at: number; items: Raw[]; status: SourceStatus[] } | null = null

async function gather(force = false) {
  if (!force && cache && Date.now() - cache.at < 45_000) return cache
  const results = await Promise.all(ADAPTERS.map((a) => a.collect().catch((e) => ({ items: [] as Raw[], status: [{ source: a.source, label: a.label, connected: false, count: 0, reason: (e as Error).message }] }))))
  cache = { at: Date.now(), items: results.flatMap((r) => r.items), status: [...results.flatMap((r) => r.status), ...upcoming] }
  return cache
}

// ── state in Supabase (studio_inbox_state) ──
const sb = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? { url, key, h: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } } : null
}
async function loadState(): Promise<Map<string, StateRow>> {
  const s = sb()
  if (!s) return new Map()
  const res = await fetch(`${s.url}/rest/v1/studio_inbox_state?select=*`, { headers: s.h, cache: 'no-store' }).catch(() => null)
  const rows = (res?.ok ? await res.json() : []) as StateRow[]
  return new Map(rows.map((r) => [r.item_id, r]))
}
async function saveState(itemId: string, patch: Partial<StateRow>) {
  const s = sb()
  if (!s) return
  await fetch(`${s.url}/rest/v1/studio_inbox_state?on_conflict=item_id`, {
    method: 'POST', headers: { ...s.h, Prefer: 'resolution=merge-duplicates' }, cache: 'no-store',
    body: JSON.stringify({ item_id: itemId, ...patch, updated_at: new Date().toISOString() }),
  })
}
async function log(itemId: string, action: string, body: string | undefined, ok: boolean, error?: string) {
  const s = sb()
  if (!s) return
  await fetch(`${s.url}/rest/v1/studio_inbox_log`, { method: 'POST', headers: s.h, cache: 'no-store', body: JSON.stringify({ item_id: itemId, action, body, ok, error }) }).catch(() => {})
}

export async function inbox(opts: { force?: boolean } = {}) {
  const [{ items, status }, state] = await Promise.all([gather(opts.force), loadState()])
  const now = Date.now()
  const merged: InboxItem[] = items.map((it) => {
    const s = state.get(it.id)
    // Something new from them after we marked it done re-opens it.
    const reopened = s?.status === 'done' && it.needsReply && s.read_at && new Date(it.at).getTime() > new Date(s.read_at).getTime()
    return {
      ...it,
      state: {
        status: reopened ? 'open' : s?.status ?? 'open',
        read: !!s?.read_at && new Date(s.read_at).getTime() >= new Date(it.at).getTime(),
        snoozedUntil: s?.snoozed_until && new Date(s.snoozed_until).getTime() > now ? s.snoozed_until : null,
        note: s?.note ?? null,
      },
    }
  }).sort((a, b) => b.at.localeCompare(a.at))
  // Strip adapter-private ids before they leave the server.
  const safe = merged.map(({ meta, ...rest }) => ({ ...rest, meta: meta && 'cardText' in meta ? { cardText: meta.cardText } : undefined }))
  return { items: safe, sources: status, fetchedAt: new Date(cache?.at ?? now).toISOString() }
}

export async function act(id: string, action: InboxAction, payload: { text?: string; until?: string; note?: string; [k: string]: unknown }) {
  const { items } = await gather()
  const item = items.find((i) => i.id === id) ?? (await gather(true)).items.find((i) => i.id === id)
  if (!item) throw new Error('That item is no longer there — refresh.')
  const now = new Date().toISOString()

  switch (action) {
    case 'read': return saveState(id, { read_at: now })
    case 'done': return saveState(id, { status: 'done', read_at: now })
    case 'reopen': return saveState(id, { status: 'open' })
    case 'snooze': return saveState(id, { snoozed_until: payload.until ?? new Date(Date.now() + 86400_000).toISOString() })
  }
  if (!item.actions.includes(action)) throw new Error('That action isn’t available for this item.')
  if (action === 'reply') {
    const text = String(payload.text ?? '').trim()
    if (!text) throw new Error('Write a reply first.')
    if (item.replyLimit && text.length > item.replyLimit) throw new Error(`Replies here are limited to ${item.replyLimit} characters.`)
  }
  const adapter = ADAPTERS.find((a) => a.source === item.source)
  if (!adapter?.act) throw new Error('This source is read-only.')
  try {
    await adapter.act(item, action, payload)
    await log(id, action, payload.text, true)
    // Replying, approving or rejecting closes the loop.
    if (action === 'reply' || action === 'approve' || action === 'reject') await saveState(id, { status: 'done', read_at: now })
    cache = null
  } catch (e) {
    await log(id, action, payload.text, false, (e as Error).message)
    throw e
  }
}
