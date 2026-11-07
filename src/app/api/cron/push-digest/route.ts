import { NextResponse } from 'next/server'
import { studioDb } from '@/lib/money/studioDb'
import { inbox } from '@/lib/inbox'
import type { InboxItem, InboxKind } from '@/lib/inbox/types'
import { notify } from '@/lib/push/notify'

// ─── /api/cron/push-digest — what's new since the last look → one push each ──
//
// Runs every 15 minutes from Supabase pg_cron (vercel.json also runs it daily
// as a fallback — Hobby crons are daily-only). Each check is cheap: the inbox
// uses its own cache, and the cursors in studio_push_state mean an item is
// announced once. Kinds:
//   suggestion   new Gag Order card suggestion(s)      → studio://inbox?kind=suggestion
//   review       new App Store review                  → studio://inbox?kind=review
//   message      new DM / comment / mention / feedback → studio://inbox
//   transactions bank transactions waiting in Triage   → studio://money/triage
//   bank         a bank needs to be reconnected        → studio://money
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LABEL: Record<InboxKind, { one: string; many: string; link: string }> = {
  suggestion: { one: 'New card suggestion', many: 'new card suggestions', link: 'studio://inbox?kind=suggestion' },
  review: { one: 'New App Store review', many: 'new App Store reviews', link: 'studio://inbox?kind=review' },
  comment: { one: 'New comment', many: 'new comments', link: 'studio://inbox' },
  message: { one: 'New message', many: 'new messages', link: 'studio://inbox' },
  mention: { one: 'New mention', many: 'new mentions', link: 'studio://inbox' },
  feedback: { one: 'New in-app feedback', many: 'new pieces of feedback', link: 'studio://inbox' },
}
const APP_NAME: Record<string, string> = { rolligan: 'Rolligan', gagorder: 'Gag Order', yulepick: 'YulePick', borea: 'Borea', jinglewire: 'Jinglewire' }
const name = (id: string) => APP_NAME[id] ?? id
const trim = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) return new NextResponse('Unauthorized', { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  const out: Record<string, unknown> = {}

  // ── Inbox: anything open + unread that we haven't announced ──
  const stateRow = await db.select<{ value: { seen?: string[]; since?: string } }[]>('studio_push_state', 'select=value&key=eq.inbox')
  const state = stateRow.ok && stateRow.data[0]?.value ? stateRow.data[0].value : {}
  const seen = new Set(state.seen ?? [])
  const firstRun = !state.since
  try {
    const { items } = await inbox()
    const fresh = items.filter((it: InboxItem) => it.state.status === 'open' && !it.state.read && !seen.has(it.id) && (!firstRun || Date.now() - new Date(it.at).getTime() < 24 * 3600_000))
    const byKind = new Map<InboxKind, InboxItem[]>()
    for (const it of fresh) byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it])
    for (const [kind, list] of byKind) {
      const l = LABEL[kind]
      const apps = Array.from(new Set(list.map((i) => name(i.app))))
      const newest = list[0]
      const title = list.length === 1 ? `${l.one} · ${name(newest.app)}` : `${list.length} ${l.many} · ${apps.join(', ')}`
      const body = list.length === 1
        ? trim(newest.kind === 'review' && newest.rating ? `${'★'.repeat(newest.rating)} ${newest.title ?? newest.text}` : newest.title ?? newest.text)
        : trim(list.slice(0, 2).map((i) => `${i.author.name}: ${i.title ?? i.text}`).join(' · '))
      await notify({ kind, title, body, link: l.link, appId: list.length === 1 ? newest.app : undefined, dedupe: `inbox:${kind}:${newest.id}` })
      out[kind] = list.length
    }
    const keep = items.filter((it) => it.state.status === 'open').map((it) => it.id).slice(0, 2000)
    await db.upsert('studio_push_state', [{ key: 'inbox', value: { seen: keep, since: new Date().toISOString() }, updated_at: new Date().toISOString() }], 'key')
  } catch (e) { out.inbox_error = (e as Error).message }

  // ── Money: unreviewed bank transactions (announce when the count grows) ──
  try {
    const n = await db.count('transactions', `owner_id=eq.${db.owner}&status=eq.unreviewed`)
    const prev = await db.select<{ value: { count?: number } }[]>('studio_push_state', 'select=value&key=eq.triage')
    const last = prev.ok ? prev.data[0]?.value?.count ?? 0 : 0
    if (n.ok && n.data > last) {
      const added = n.data - last
      await notify({ kind: 'transactions', title: added === 1 ? '1 transaction to categorize' : `${added} new transactions to categorize`, body: `${n.data} waiting in Triage. Swipe to assign an app or mark personal.`, link: 'studio://money/triage', dedupe: `triage:${n.data}:${new Date().toISOString().slice(0, 13)}` })
      out.transactions = added
    }
    if (n.ok) await db.upsert('studio_push_state', [{ key: 'triage', value: { count: n.data }, updated_at: new Date().toISOString() }], 'key')
  } catch (e) { out.triage_error = (e as Error).message }

  // ── Money: a bank that needs re-login ──
  try {
    const items = await db.select<{ id: string; institution: string | null; status: string | null }[]>('plaid_items', 'select=id,institution,status&status=eq.needs_reauth')
    for (const i of items.ok ? items.data : []) {
      await notify({ kind: 'bank', title: `${i.institution ?? 'A bank'} needs you to sign in again`, body: 'Transactions stop syncing until you reconnect it in Money.', link: 'studio://money', dedupe: `reauth:${i.id}:${new Date().toISOString().slice(0, 10)}` })
    }
    out.reauth = items.ok ? items.data.length : 0
  } catch (e) { out.reauth_error = (e as Error).message }

  return NextResponse.json({ ok: true, ...out })
}
