// ─── Non-Meta sources: App Store reviews, each app's own admin API, and the
//     slots for sources that aren't wired yet ──────────────────────────────
//
// SERVER ONLY.

import { signAppStoreJWT } from '@/lib/analytics/appstore'
import { registry } from '@/lib/console'
import type { Adapter, InboxItem, SourceStatus } from './types'

type Item = Omit<InboxItem, 'state'>
const ASC = 'https://api.appstoreconnect.apple.com/v1'
const STORE_APPS = [
  { id: 'rolligan', appleId: '6774974562' },
  { id: 'gagorder', appleId: '6776382535' },
  { id: 'borea', appleId: '6799219647' },
]
const flag = (cc: string) => cc.length === 3 ? cc : cc

// ── App Store reviews ───────────────────────────────────────────────────────
// Needs the ASC API key's role to include Customer Support (or Admin/App
// Manager) to post responses; reading works with any role.
type Review = { id: string; attributes: { rating: number; title?: string; body?: string; reviewerNickname?: string; createdDate: string; territory?: string }; relationships?: { response?: { data?: { id: string } | null } } }
type ReviewResponse = { id: string; attributes: { responseBody: string; lastModifiedDate: string; state?: string } }

export const appStoreReviews: Adapter = {
  source: 'appstore_review',
  label: 'App Store reviews',
  async collect() {
    const jwt = signAppStoreJWT()
    const items: Item[] = []
    const status: SourceStatus[] = []
    for (const app of STORE_APPS) {
      if (!jwt) { status.push({ source: 'appstore_review', app: app.id, label: 'App Store reviews', connected: false, count: 0, reason: 'App Store Connect key not configured.' }); continue }
      try {
        const res = await fetch(`${ASC}/apps/${app.appleId}/customerReviews?sort=-createdDate&limit=50&include=response`, {
          headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.errors?.[0]?.detail ?? `HTTP ${res.status}`)
        const responses = new Map<string, ReviewResponse>(((body.included ?? []) as ReviewResponse[]).map((r) => [r.id, r]))
        for (const r of (body.data ?? []) as Review[]) {
          const a = r.attributes
          const respId = r.relationships?.response?.data?.id
          const resp = respId ? responses.get(respId) : undefined
          items.push({
            id: `appstore_review:${r.id}`, source: 'appstore_review', kind: 'review', app: app.id,
            author: { name: a.reviewerNickname ?? 'App Store reviewer' },
            title: a.title, text: a.body ?? '', rating: a.rating, at: a.createdDate,
            url: `https://appstoreconnect.apple.com/apps/${app.appleId}/distribution/activity/ios/ratingsResponses`,
            context: a.territory ? { label: `App Store · ${flag(a.territory)}` } : { label: 'App Store' },
            thread: [
              { from: 'them', name: a.reviewerNickname, text: [a.title, a.body].filter(Boolean).join('\n\n'), at: a.createdDate },
              ...(resp ? [{ from: 'us' as const, text: resp.attributes.responseBody, at: resp.attributes.lastModifiedDate }] : []),
            ],
            needsReply: !resp,
            actions: ['reply'], replyLimit: 5970,
            replyNote: resp ? 'Replying again replaces your published response.' : 'Apple reviews responses before they appear — usually within a day.',
            meta: { reviewId: r.id, responseId: respId ?? null },
          })
        }
        status.push({ source: 'appstore_review', app: app.id, label: 'App Store reviews', connected: true, count: (body.data ?? []).length })
      } catch (e) {
        status.push({ source: 'appstore_review', app: app.id, label: 'App Store reviews', connected: false, count: 0, reason: (e as Error).message })
      }
    }
    status.push({ source: 'appstore_review', app: 'yulepick', label: 'App Store reviews', connected: false, count: 0, reason: 'YulePick isn’t on the App Store yet.' })
    return { items, status }
  },
  async act(item, action, payload) {
    if (action !== 'reply') throw new Error('Reviews can only be replied to.')
    const jwt = signAppStoreJWT()
    if (!jwt) throw new Error('App Store Connect key not configured.')
    const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
    if (item.meta?.responseId) {
      await fetch(`${ASC}/customerReviewResponses/${item.meta.responseId}`, { method: 'DELETE', headers })
    }
    const res = await fetch(`${ASC}/customerReviewResponses`, {
      method: 'POST', headers,
      body: JSON.stringify({ data: { type: 'customerReviewResponses', attributes: { responseBody: String(payload.text ?? '') },
        relationships: { review: { data: { type: 'customerReviews', id: item.meta?.reviewId } } } } }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body?.errors?.[0]?.detail ?? `HTTP ${res.status}`
      throw new Error(res.status === 403 ? 'The App Store Connect key needs the Customer Support (or Admin) role to reply.' : detail)
    }
  },
}

// ── Each app's own admin API ─────────────────────────────────────────────────
//
// THE CONTRACT (docs/APP_ADMIN_CONTRACT.md): an app that wants its in-app
// feedback, support messages or anything else in the studio inbox exposes
//   GET  <APP>_ADMIN_URL/api/admin/inbox   → { items: InboxItem-like[] }
//   POST <APP>_ADMIN_URL/api/admin/inbox   { id, action, text? }
// behind x-admin-token. Gag Order's existing card-review API (GET /api/admin
// → { pending }) is adapted below until it adopts the contract.

type Suggestion = { id: string | number; message?: string; card_text?: string; city?: string; audience?: string; player_name?: string; platform?: string; created_at: string }

export const appAdmin: Adapter = {
  source: 'app_admin',
  label: 'In-app feedback & suggestions',
  async collect() {
    const items: Item[] = []
    const status: SourceStatus[] = []
    const configured = registry()
    for (const id of ['rolligan', 'gagorder', 'yulepick', 'borea']) {
      const app = configured.find((a) => a.id === id)
      if (!app) {
        status.push({ source: 'app_admin', app: id, label: 'In-app feedback', connected: false, count: 0,
          reason: `Set ${id.toUpperCase()}_ADMIN_URL and ${id.toUpperCase()}_ADMIN_TOKEN on clarendon.dev (and ADMIN_TOKEN on the app’s own site).` })
        continue
      }
      const h = { 'x-admin-token': app.token }
      try {
        // Contract endpoint first; fall back to Gag Order's card-review API.
        const inbox = await fetch(`${app.baseUrl}/api/admin/inbox`, { headers: h, cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (inbox.ok) {
          const body = await inbox.json()
          for (const it of (body.items ?? []) as Item[]) items.push({ ...it, id: `app_admin:${id}:${it.id}`, source: 'app_admin', app: id, meta: { ...(it.meta ?? {}), remoteId: it.id, contract: true } })
          status.push({ source: 'app_admin', app: id, label: 'In-app feedback', connected: true, count: (body.items ?? []).length })
          continue
        }
        const res = await fetch(`${app.baseUrl}/api/admin`, { headers: h, cache: 'no-store', signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(res.status === 401 ? 'Token rejected — the app’s ADMIN_TOKEN doesn’t match.' : `HTTP ${res.status}`)
        const body = await res.json()
        for (const s of (body.pending ?? []) as Suggestion[]) {
          items.push({
            id: `app_admin:${id}:suggestion-${s.id}`, source: 'app_admin', kind: 'suggestion', app: id,
            author: { name: s.player_name || 'A player' },
            title: s.card_text ?? undefined, text: s.card_text || s.message || '', at: s.created_at,
            context: { label: ['Card suggestion', s.audience, s.city, s.platform].filter(Boolean).join(' · ') },
            thread: [{ from: 'them', name: s.player_name, text: [s.card_text, s.message].filter(Boolean).join('\n\n'), at: s.created_at }],
            needsReply: true, actions: ['approve', 'reject'],
            meta: { feedbackId: s.id, cardText: s.card_text },
          })
        }
        status.push({ source: 'app_admin', app: id, label: 'Card suggestions', connected: true, count: (body.pending ?? []).length })
      } catch (e) {
        status.push({ source: 'app_admin', app: id, label: 'In-app feedback', connected: false, count: 0, reason: (e as Error).name === 'TimeoutError' ? `${app.name}’s admin API didn’t answer in 8s.` : (e as Error).message })
      }
    }
    return { items, status }
  },
  async act(item, action, payload) {
    const app = registry().find((a) => a.id === item.app)
    if (!app) throw new Error('App admin API not configured.')
    const h = { 'x-admin-token': app.token, 'Content-Type': 'application/json' }
    const contract = !!item.meta?.contract
    const res = contract
      ? await fetch(`${app.baseUrl}/api/admin/inbox`, { method: 'POST', headers: h, body: JSON.stringify({ id: item.meta?.remoteId, action, ...payload }) })
      : await fetch(`${app.baseUrl}/api/admin`, { method: 'POST', headers: h, body: JSON.stringify({
          action, feedbackId: item.meta?.feedbackId, text: payload.text ?? item.meta?.cardText, pack: payload.pack, tier: payload.tier, format: payload.format }) })
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `${app.name} returned ${res.status}`)
  },
}

// ── In-app feedback (clarendon.dev/api/feedback → studio_feedback) ────────
type FeedbackRow = { id: string; app_id: string; message: string; email: string | null; name: string | null; kind: string; platform: string | null; app_version: string | null; device: string | null; created_at: string }
const KIND_LABEL: Record<string, string> = { feedback: 'Feedback', bug: 'Bug report', idea: 'Idea', support: 'Support request' }

export const inAppFeedback: Adapter = {
  source: 'app_feedback',
  label: 'In-app feedback',
  async collect() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return { items: [], status: [{ source: 'app_feedback', label: 'In-app feedback', connected: false, count: 0, reason: 'Supabase not configured on clarendon.dev.' }] }
    const since = new Date(Date.now() - 60 * 86400_000).toISOString()
    const res = await fetch(`${url}/rest/v1/studio_feedback?select=*&created_at=gte.${since}&order=created_at.desc&limit=200`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
    const rows = (res.ok ? await res.json() : []) as FeedbackRow[]
    const items: Item[] = rows.map((r) => ({
      id: `app_feedback:${r.id}`, source: 'app_feedback', kind: 'feedback', app: r.app_id,
      author: { name: r.name || (r.email ? r.email.split('@')[0] : 'Anonymous'), handle: r.email ?? undefined },
      title: KIND_LABEL[r.kind] ?? 'Feedback', text: r.message, at: r.created_at,
      url: r.email ? `mailto:${r.email}?subject=${encodeURIComponent(`Re: your ${KIND_LABEL[r.kind]?.toLowerCase() ?? 'feedback'}`)}` : undefined,
      context: { label: [KIND_LABEL[r.kind] ?? 'Feedback', r.platform, r.app_version && `v${r.app_version}`, r.device].filter(Boolean).join(' · ') },
      thread: [{ from: 'them', name: r.name ?? undefined, text: r.message, at: r.created_at }],
      needsReply: !!r.email || r.kind === 'bug' || r.kind === 'support',
      actions: [],
      replyNote: r.email ? 'Replies go by email — Open ↗ starts one in Mail.' : 'Sent without an email address, so there’s no way to reply.',
    }))
    const apps = ['rolligan', 'gagorder', 'yulepick', 'borea']
    return { items, status: apps.map((a) => ({ source: 'app_feedback' as const, app: a, label: 'In-app feedback', connected: true, count: items.filter((i) => i.app === a).length,
      reason: undefined })) }
  },
}

// ── Not wired yet — listed so the setup panel shows the whole map ───────────
export const upcoming: SourceStatus[] = [
  { source: 'threads_reply', label: 'Threads replies', connected: false, count: 0, reason: 'Arrives with the Threads connection (one sign-in per app account).' },
  { source: 'tiktok_comment', label: 'TikTok comments', connected: false, count: 0, reason: 'Needs TikTok to approve the app for comment access.' },
  { source: 'support_email', label: 'Support email', connected: false, count: 0, reason: 'support@ and the app aliases can land here once Gmail is connected to clarendon.dev.' },
]
