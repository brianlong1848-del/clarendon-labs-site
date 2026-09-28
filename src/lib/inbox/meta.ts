// ─── Meta sources: Instagram DMs + comments, Facebook messages + comments ────
//
// SERVER ONLY. One system-user token (META_ACCESS_TOKEN) reaches every
// Clarendon Page; each Page hands back its own Page token, which is what
// Messenger/Instagram messaging and comment moderation use. Apps are matched
// by the Instagram account linked to their Page (<APP>_IG_ACCOUNT_ID).
//
// Permissions each source needs on the token (the setup panel shows the fix
// when one is missing):
//   Instagram comments  instagram_basic, instagram_manage_comments
//   Instagram DMs       instagram_manage_messages (+ "Allow access to messages")
//   Facebook comments   pages_read_user_content, pages_manage_engagement
//   Facebook messages   pages_messaging

import type { Adapter, InboxItem, SourceStatus, ThreadEntry } from './types'

const G = 'https://graph.facebook.com/v21.0'
const APPS = [
  { id: 'rolligan', name: 'Rolligan' },
  { id: 'gagorder', name: 'Gag Order' },
  { id: 'yulepick', name: 'YulePick' },
  { id: 'borea', name: 'Borea' },
]
const DAYS = 30
const token = () => process.env.META_ACCESS_TOKEN
const igId = (app: string) => process.env[`${app.toUpperCase()}_IG_ACCOUNT_ID`]

type Item = Omit<InboxItem, 'state'>

async function get(url: string) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  return body
}
async function post(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`)
  return body
}

type Page = { id: string; name: string; access_token: string; ig?: string; app?: string }
let pageCache: { at: number; pages: Page[] } | null = null
export async function metaPages(): Promise<Page[]> {
  const t = token()
  if (!t) return []
  if (pageCache && Date.now() - pageCache.at < 60_000) return pageCache.pages
  try {
    const body = await get(`${G}/me/accounts?fields=id,name,access_token,instagram_business_account{id}&limit=100&access_token=${t}`)
    const pages: Page[] = (body.data ?? []).map((p: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }) => {
      const ig = p.instagram_business_account?.id
      return { id: p.id, name: p.name, access_token: p.access_token, ig, app: APPS.find((a) => igId(a.id) && igId(a.id) === ig)?.id }
    })
    pageCache = { at: Date.now(), pages }
  } catch { pageCache = { at: Date.now(), pages: [] } }
  return pageCache.pages
}

const since = () => new Date(Date.now() - DAYS * 86400_000)
const fixReason = (e: unknown, perm: string) => {
  const m = (e as Error).message ?? ''
  if (/permission|not authorized|#10|#200|#230|#3/i.test(m)) return `Needs ${perm} on the Meta token — add it when you regenerate the token.`
  return m
}

// ── Instagram comments ──────────────────────────────────────────────────────
type IgComment = { id: string; text: string; username?: string; timestamp: string; like_count?: number; hidden?: boolean; from?: { id: string; username: string }; replies?: { data: IgComment[] } }
type IgMedia = { id: string; caption?: string; permalink?: string; thumbnail_url?: string; media_url?: string; media_type?: string; timestamp: string; comments?: { data: IgComment[] } }

export const instagramComments: Adapter = {
  source: 'instagram_comment',
  label: 'Instagram comments',
  async collect() {
    const items: Item[] = []
    const status: SourceStatus[] = []
    for (const app of APPS) {
      const ig = igId(app.id)
      if (!ig || !token()) { status.push({ source: 'instagram_comment', app: app.id, label: 'Instagram comments', connected: false, count: 0, reason: 'No Instagram account set for this app.' }); continue }
      try {
        const me = await get(`${G}/${ig}?fields=username&access_token=${token()}`)
        const body = await get(`${G}/${ig}/media?fields=id,caption,permalink,thumbnail_url,media_url,media_type,timestamp,comments.limit(50){id,text,username,timestamp,like_count,hidden,from,replies.limit(20){id,text,username,timestamp,from}}&limit=20&access_token=${token()}`)
        let n = 0
        for (const m of (body.data ?? []) as IgMedia[]) {
          for (const c of m.comments?.data ?? []) {
            if (new Date(c.timestamp) < since()) continue
            const author = c.username ?? c.from?.username ?? 'someone'
            if (author === me.username) continue
            const replies = (c.replies?.data ?? []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            const thread: ThreadEntry[] = [
              { from: 'them', name: author, text: c.text, at: c.timestamp },
              ...replies.map((r) => ({ from: (r.username ?? r.from?.username) === me.username ? 'us' as const : 'them' as const, name: r.username ?? r.from?.username, text: r.text, at: r.timestamp })),
            ]
            const last = thread[thread.length - 1]
            items.push({
              id: `instagram_comment:${c.id}`, source: 'instagram_comment', kind: 'comment', app: app.id,
              author: { name: author, handle: author }, text: last.from === 'them' ? last.text : c.text, at: last.at,
              url: m.permalink, thread, needsReply: last.from === 'them',
              context: { label: m.media_type === 'VIDEO' ? 'On your Reel' : 'On your post', thumb: m.thumbnail_url ?? m.media_url, text: m.caption?.slice(0, 140) },
              actions: ['reply', c.hidden ? 'unhide' : 'hide'], replyLimit: 2200,
              meta: { commentId: c.id, hidden: !!c.hidden },
            })
            n++
          }
        }
        status.push({ source: 'instagram_comment', app: app.id, label: 'Instagram comments', connected: true, count: n })
      } catch (e) {
        status.push({ source: 'instagram_comment', app: app.id, label: 'Instagram comments', connected: false, count: 0, reason: /does not exist|#100/i.test(String(e)) ? 'Link this Instagram account to its Facebook Page.' : fixReason(e, 'instagram_manage_comments') })
      }
    }
    return { items, status }
  },
  async act(item, action, payload) {
    const id = String(item.meta?.commentId)
    if (action === 'reply') await post(`${G}/${id}/replies`, { message: String(payload.text ?? ''), access_token: token()! })
    else if (action === 'hide' || action === 'unhide') await post(`${G}/${id}`, { hide: String(action === 'hide'), access_token: token()! })
    else throw new Error('Not supported for Instagram comments.')
  },
}

// ── Instagram + Facebook conversations (DMs) ───────────────────────────────
type Conv = { id: string; updated_time: string; link?: string; participants?: { data: { id: string; name?: string; username?: string }[] }; messages?: { data: { id: string; message?: string; created_time: string; from?: { id: string; name?: string; username?: string } }[] } }

function conversations(platform: 'instagram' | 'messenger'): Adapter {
  const source = platform === 'instagram' ? 'instagram_dm' as const : 'facebook_message' as const
  const label = platform === 'instagram' ? 'Instagram messages' : 'Facebook messages'
  const perm = platform === 'instagram' ? 'instagram_manage_messages' : 'pages_messaging'
  return {
    source, label,
    async collect() {
      const items: Item[] = []
      const status: SourceStatus[] = []
      const pages = await metaPages()
      for (const app of APPS) {
        const page = pages.find((p) => p.app === app.id)
        if (!page) { status.push({ source, app: app.id, label, connected: false, count: 0, reason: 'No Facebook Page linked to this app’s Instagram yet.' }); continue }
        try {
          const body = await get(`${G}/${page.id}/conversations?platform=${platform}&fields=id,updated_time,link,participants,messages.limit(15){id,message,created_time,from}&limit=25&access_token=${page.access_token}`)
          let n = 0
          for (const c of (body.data ?? []) as Conv[]) {
            if (new Date(c.updated_time) < since()) continue
            const us = new Set([page.id, page.ig].filter(Boolean) as string[])
            const other = c.participants?.data.find((p) => !us.has(p.id))
            const msgs = (c.messages?.data ?? []).slice().reverse()
            if (!msgs.length || !other) continue
            const thread: ThreadEntry[] = msgs.map((m) => ({ from: us.has(m.from?.id ?? '') ? 'us' : 'them', name: m.from?.username ?? m.from?.name, text: m.message || '(attachment)', at: m.created_time }))
            const last = thread[thread.length - 1]
            const lastTheirs = [...thread].reverse().find((t) => t.from === 'them')
            const windowOpen = platform === 'instagram' && lastTheirs ? Date.now() - new Date(lastTheirs.at).getTime() < 24 * 3600_000 : true
            items.push({
              id: `${source}:${c.id}`, source, kind: 'message', app: app.id,
              author: { name: other.username ?? other.name ?? 'Someone', handle: other.username },
              text: last.text, at: last.at, url: c.link ? `https://www.facebook.com${c.link}` : undefined,
              thread, needsReply: last.from === 'them',
              actions: windowOpen ? ['reply'] : [],
              replyLimit: 1000,
              replyNote: windowOpen ? undefined : 'Instagram only allows replies within 24 hours of their last message — answer in the Instagram app.',
              meta: { pageId: page.id, recipient: other.id },
            })
            n++
          }
          status.push({ source, app: app.id, label, connected: true, count: n })
        } catch (e) {
          status.push({ source, app: app.id, label, connected: false, count: 0, reason: fixReason(e, perm) })
        }
      }
      return { items, status }
    },
    async act(item, action, payload) {
      if (action !== 'reply') throw new Error('Messages can only be replied to.')
      const page = (await metaPages()).find((p) => p.id === item.meta?.pageId)
      if (!page) throw new Error('Page not found.')
      await post(`${G}/${page.id}/messages`, {
        recipient: JSON.stringify({ id: item.meta?.recipient }),
        message: JSON.stringify({ text: String(payload.text ?? '') }),
        messaging_type: 'RESPONSE',
        access_token: page.access_token,
      })
    },
  }
}
export const instagramDMs = conversations('instagram')
export const facebookMessages = conversations('messenger')

// ── Facebook Page comments ─────────────────────────────────────────────────
type FbComment = { id: string; message: string; created_time: string; from?: { id: string; name: string }; is_hidden?: boolean; comments?: { data: FbComment[] } }
type FbPost = { id: string; message?: string; permalink_url?: string; full_picture?: string; comments?: { data: FbComment[] } }

export const facebookComments: Adapter = {
  source: 'facebook_comment',
  label: 'Facebook comments',
  async collect() {
    const items: Item[] = []
    const status: SourceStatus[] = []
    const pages = await metaPages()
    for (const app of APPS) {
      const page = pages.find((p) => p.app === app.id)
      if (!page) { status.push({ source: 'facebook_comment', app: app.id, label: 'Facebook comments', connected: false, count: 0, reason: 'No Facebook Page linked to this app’s Instagram yet.' }); continue }
      try {
        const body = await get(`${G}/${page.id}/feed?fields=id,message,permalink_url,full_picture,comments.limit(50){id,message,created_time,from,is_hidden,comments.limit(20){id,message,created_time,from}}&limit=15&access_token=${page.access_token}`)
        let n = 0
        for (const p of (body.data ?? []) as FbPost[]) {
          for (const c of p.comments?.data ?? []) {
            if (new Date(c.created_time) < since() || c.from?.id === page.id) continue
            const thread: ThreadEntry[] = [
              { from: 'them', name: c.from?.name, text: c.message, at: c.created_time },
              ...(c.comments?.data ?? []).map((r) => ({ from: r.from?.id === page.id ? 'us' as const : 'them' as const, name: r.from?.name, text: r.message, at: r.created_time })),
            ]
            const last = thread[thread.length - 1]
            items.push({
              id: `facebook_comment:${c.id}`, source: 'facebook_comment', kind: 'comment', app: app.id,
              author: { name: c.from?.name ?? 'Someone' }, text: last.from === 'them' ? last.text : c.message, at: last.at,
              url: p.permalink_url, thread, needsReply: last.from === 'them',
              context: { label: 'On your Facebook post', thumb: p.full_picture, text: p.message?.slice(0, 140) },
              actions: ['reply', c.is_hidden ? 'unhide' : 'hide'], replyLimit: 8000,
              meta: { commentId: c.id, pageId: page.id },
            })
            n++
          }
        }
        status.push({ source: 'facebook_comment', app: app.id, label: 'Facebook comments', connected: true, count: n })
      } catch (e) {
        status.push({ source: 'facebook_comment', app: app.id, label: 'Facebook comments', connected: false, count: 0, reason: fixReason(e, 'pages_read_user_content') })
      }
    }
    return { items, status }
  },
  async act(item, action, payload) {
    const page = (await metaPages()).find((p) => p.id === item.meta?.pageId)
    if (!page) throw new Error('Page not found.')
    const id = String(item.meta?.commentId)
    if (action === 'reply') await post(`${G}/${id}/comments`, { message: String(payload.text ?? ''), access_token: page.access_token })
    else if (action === 'hide' || action === 'unhide') await post(`${G}/${id}`, { is_hidden: String(action === 'hide'), access_token: page.access_token })
    else throw new Error('Not supported for Facebook comments.')
  },
}
