import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { SCHEDULE_C } from '@/lib/money/categories'
import { appSlugs, isDate, normaliseSplits, resolvePaidFrom, str, toCents } from '@/lib/money/ledger'

export const dynamic = 'force-dynamic'

// ─── /api/money/transactions — every transaction (bank, manual, recurring) ───
//
//   GET   ?q=&status=&source=&app=&category=&from=&to=&offset=&format=csv
//   PATCH { id, status?, app_slug?, schedule_c?, notes?, splits?,
//           posted_on?, amount?, merchant?, paid_from? }   (last four: manual/recurring rows only)
// Signed-in session + RLS, same as the rest of Money. Bank imports can be
// re-categorised and re-labelled here but never deleted.

const CATS = new Set<string>(SCHEDULE_C.map(([v]) => v))
const STATUSES = new Set(['business', 'personal', 'ignored', 'unreviewed'])
const PAGE = 100
const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const SELECT = 'id,posted_on,amount_cents,merchant,app_slug,split_apps,schedule_c,paid_from,notes,source,status,possible_duplicate_of,splits:transaction_splits(app_slug,share),receipts(id,file_name)'

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const u = new URL(req.url).searchParams
  const sb = await supabaseServer()
  let q = sb.from('transactions').select(SELECT, { count: 'exact' })
  const q_ = (u.get('q') ?? '').replace(/[%,()]/g, ' ').trim()
  if (q_) q = q.or(`merchant.ilike.%${q_}%,notes.ilike.%${q_}%`)
  const status = u.get('status'); if (status && STATUSES.has(status)) q = q.eq('status', status)
  const source = u.get('source'); if (source && ['plaid', 'manual', 'recurring'].includes(source)) q = q.eq('source', source)
  const app = u.get('app'); if (app) q = app === '__none' ? q.is('app_slug', null) : q.eq('app_slug', app)
  const category = u.get('category'); if (category && CATS.has(category)) q = q.eq('schedule_c', category)
  const from = u.get('from'); if (isDate(from)) q = q.gte('posted_on', from)
  const to = u.get('to'); if (isDate(to)) q = q.lte('posted_on', to)
  q = q.order('posted_on', { ascending: false }).order('id')

  if (u.get('format') === 'csv') {
    const { data, error } = await q.limit(5000)
    if (error) return bad(error.message, 500)
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['date', 'merchant', 'amount', 'status', 'source', 'app', 'category', 'paid_from', 'notes', 'receipts'].join(',')]
    for (const r of data ?? []) lines.push([r.posted_on, esc(r.merchant), (r.amount_cents / 100).toFixed(2), r.status, r.source, r.app_slug ?? (r.split_apps ?? []).join('/'), r.schedule_c ?? '', esc(r.paid_from), esc(r.notes), (r.receipts as unknown[]).length].join(','))
    return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="transactions.csv"' } })
  }

  const offset = Math.max(0, Number(u.get('offset')) || 0)
  const { data, error, count } = await q.range(offset, offset + PAGE - 1)
  if (error) return bad(error.message, 500)
  const [apps, accounts] = await Promise.all([
    sb.from('apps').select('slug,name').order('name'),
    sb.from('money_accounts').select('id,institution,name,mask').order('name'),
  ])
  return NextResponse.json({
    rows: data ?? [], total: count ?? 0, pageSize: PAGE, apps: apps.data ?? [],
    accounts: (accounts.data ?? []).map((a) => ({ id: a.id, label: `${a.name ?? a.institution ?? 'Account'}${a.mask ? ` ···${a.mask}` : ''}` })),
    categories: SCHEDULE_C.map(([value, label]) => ({ value, label })),
  })
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b?.id) return bad('bad request')
  const sb = await supabaseServer()
  const { data: cur } = await sb.from('transactions').select('id,source,amount_cents').eq('id', b.id).maybeSingle()
  if (!cur) return bad('Not found.', 404)
  const own = cur.source !== 'plaid'
  const upd: Record<string, unknown> = {}

  if ('status' in b) { if (!STATUSES.has(b.status)) return bad('Bad status.'); upd.status = b.status }
  if ('schedule_c' in b) { if (b.schedule_c && !CATS.has(b.schedule_c)) return bad('Bad category.'); upd.schedule_c = b.schedule_c || null }
  if ('notes' in b) upd.notes = str(b.notes, 1000) || null
  const slugs = await appSlugs(sb)
  let amount = cur.amount_cents as number
  if ('amount' in b || 'posted_on' in b || 'merchant' in b || 'paid_from' in b) {
    if (!own) return bad('Bank imports keep their bank date, amount and merchant; edit those on manual entries only.')
    if ('amount' in b) { const c = toCents(b.amount); if (!c) return bad('Enter an amount greater than zero.'); upd.amount_cents = c; amount = c }
    if ('posted_on' in b) { if (!isDate(b.posted_on)) return bad('Pick a date.'); upd.posted_on = b.posted_on }
    if ('merchant' in b) { const m = str(b.merchant, 120); if (!m) return bad('Who was it paid to?'); upd.merchant = m }
    if ('paid_from' in b) { const p = await resolvePaidFrom(sb, b.paid_from); if (!p) return bad('Pick what it was paid from.'); upd.paid_from = p.paid_from; upd.account_id = p.account_id }
  }
  let splits: { app_slug: string; share: number }[] | null | undefined
  if ('splits' in b && b.splits) {
    const s = normaliseSplits(b.splits, amount, slugs); if (typeof s === 'string') return bad(s)
    splits = s; upd.app_slug = null
  } else if ('app_slug' in b) {
    if (b.app_slug && !slugs.has(b.app_slug)) return bad('Unknown app.')
    upd.app_slug = b.app_slug || null; splits = null; upd.split_apps = null
  }
  if (!Object.keys(upd).length && splits === undefined) return bad('Nothing to change.')

  if (Object.keys(upd).length) { const r = await sb.from('transactions').update(upd).eq('id', cur.id); if (r.error) return bad(r.error.message, 500) }
  if (splits !== undefined) {
    const d = await sb.from('transaction_splits').delete().eq('transaction_id', cur.id); if (d.error) return bad(d.error.message, 500)
    if (splits) { const i = await sb.from('transaction_splits').insert(splits.map((x) => ({ ...x, transaction_id: cur.id }))); if (i.error) return bad(i.error.message, 500) }
  }
  return NextResponse.json({ ok: true })
}
