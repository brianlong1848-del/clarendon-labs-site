import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { SCHEDULE_C } from '@/lib/money/categories'
import { PAID_FROM_OTHER, appSlugs, isDate, normaliseSplits, resolvePaidFrom, str, toCents } from '@/lib/money/ledger'

export const dynamic = 'force-dynamic'

// ─── /api/money/ledger — manual entries (Quick Add) ─────────────────────────
//
// Used by the web Ledger page and the native Studio Quick Add sheet. Everything
// runs through the signed-in session, so RLS (owner + 2FA) scopes it.
//
//   GET                       → form options + recent manual/recurring entries
//   POST   { posted_on, amount, merchant, app_slug? | splits?, schedule_c,
//            paid_from, notes?, receipt_ids? }       → creates a business entry
//   PATCH  { id, action: 'merge' | 'not_duplicate' } → resolve a Plaid duplicate
//   DELETE ?id=                                      → remove a manual entry

const CATS = new Set<string>(SCHEDULE_C.map(([v]) => v))
const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET() {
  if (!(await consoleAuthed())) return deny()
  const sb = await supabaseServer()
  const [apps, accounts, recent, owed] = await Promise.all([
    sb.from('apps').select('slug,name').order('name'),
    sb.from('money_accounts').select('id,institution,name,mask,ownership,source').order('ownership').order('name'),
    sb.from('transactions')
      .select('id,posted_on,amount_cents,merchant,app_slug,split_apps,schedule_c,paid_from,notes,source,status,splits:transaction_splits(app_slug,share),receipts(id,file_name)')
      .in('source', ['manual', 'recurring']).neq('status', 'ignored')
      .order('posted_on', { ascending: false }).limit(60),
    sb.from('v_owner_contributions').select('owed_cents'),
  ])
  if (recent.error) return bad(recent.error.message, 500)
  return NextResponse.json({
    apps: apps.data ?? [],
    paidFrom: [
      ...(accounts.data ?? []).map((a) => ({ id: a.id, label: `${a.name ?? a.institution ?? 'Account'}${a.mask ? ` ···${a.mask}` : ''}`, ownership: a.ownership })),
      ...PAID_FROM_OTHER.map((o) => ({ ...o, ownership: 'personal' })),
    ],
    categories: SCHEDULE_C.map(([value, label]) => ({ value, label })),
    recent: recent.data ?? [],
    owedCents: (owed.data ?? []).reduce((a, r: { owed_cents: number }) => a + Number(r.owed_cents ?? 0), 0),
  })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b) return bad('bad request')
  const sb = await supabaseServer()

  const amount_cents = toCents(b.amount)
  if (!amount_cents) return bad('Enter an amount greater than zero.')
  if (!isDate(b.posted_on)) return bad('Pick a date.')
  const merchant = str(b.merchant, 120)
  if (!merchant) return bad('Who was it paid to?')
  const schedule_c = str(b.schedule_c, 40)
  if (!CATS.has(schedule_c)) return bad('Pick a category.')
  const paid = await resolvePaidFrom(sb, b.paid_from)
  if (!paid) return bad('Pick what it was paid from.')

  const slugs = await appSlugs(sb)
  const splits = normaliseSplits(b.splits ?? null, amount_cents, slugs)
  if (typeof splits === 'string') return bad(splits)
  const app_slug = splits ? null : (b.app_slug ? String(b.app_slug) : null)
  if (app_slug && !slugs.has(app_slug)) return bad('Unknown app.')

  const { data: tx, error } = await sb.from('transactions').insert({
    posted_on: b.posted_on, amount_cents, merchant, raw_description: merchant, schedule_c,
    app_slug, status: 'business', source: 'manual', paid_from: paid.paid_from, account_id: paid.account_id,
    notes: str(b.notes, 1000) || null,
  }).select('id').single()
  if (error) return bad(error.message, 500)

  if (splits) {
    const s = await sb.from('transaction_splits').insert(splits.map((x) => ({ ...x, transaction_id: tx.id })))
    if (s.error) { await sb.from('transactions').delete().eq('id', tx.id); return bad(s.error.message, 500) }
  }
  const receiptIds = Array.isArray(b.receipt_ids) ? b.receipt_ids.filter((x: unknown) => typeof x === 'string').slice(0, 10) : []
  if (receiptIds.length) await sb.from('receipts').update({ transaction_id: tx.id, status: 'matched' }).in('id', receiptIds)

  return NextResponse.json({ ok: true, id: tx.id })
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b?.id || !['merge', 'not_duplicate'].includes(b.action)) return bad('bad request')
  const sb = await supabaseServer()

  const { data: bank } = await sb.from('transactions').select('id,possible_duplicate_of,notes').eq('id', b.id).maybeSingle()
  if (!bank?.possible_duplicate_of) return bad('That transaction isn’t flagged as a duplicate.')
  if (b.action === 'not_duplicate') {
    const r = await sb.from('transactions').update({ possible_duplicate_of: null }).eq('id', bank.id)
    return r.error ? bad(r.error.message, 500) : NextResponse.json({ ok: true })
  }

  // Merge: the bank's row is the record (real account, real date). It takes the
  // manual entry's app, category, splits and receipts; the manual entry is kept
  // but ignored so nothing is counted twice and the history stays.
  const { data: manual } = await sb.from('transactions')
    .select('id,app_slug,split_apps,schedule_c,notes,posted_on').eq('id', bank.possible_duplicate_of).maybeSingle()
  if (!manual) return bad('The matching manual entry is gone.', 404)
  const notes = [bank.notes, manual.notes].filter(Boolean).join(' · ') || null
  const steps = [
    sb.from('transactions').update({ status: 'business', app_slug: manual.app_slug, split_apps: manual.split_apps, schedule_c: manual.schedule_c, notes }).eq('id', bank.id),
    sb.from('transaction_splits').update({ transaction_id: bank.id }).eq('transaction_id', manual.id),
    sb.from('receipts').update({ transaction_id: bank.id }).eq('transaction_id', manual.id),
    sb.from('transactions').update({ status: 'ignored', notes: `Merged into bank import ${bank.id}${manual.notes ? ` · ${manual.notes}` : ''}` }).eq('id', manual.id),
  ]
  for (const step of steps) { const r = await step; if (r.error) return bad(r.error.message, 500) }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const sb = await supabaseServer()
  // Only hand-entered rows can be deleted here; bank imports are triaged, never deleted.
  // Attached receipts survive (receipts.transaction_id → null) per the retention policy.
  const { data, error } = await sb.from('transactions').delete().eq('id', id).eq('source', 'manual').select('id')
  if (error) return bad(error.message, 500)
  if (!data?.length) return bad('Not found, or not a manual entry.', 404)
  await sb.from('receipts').update({ status: 'unmatched' }).is('transaction_id', null).eq('status', 'matched')
  return NextResponse.json({ ok: true })
}
