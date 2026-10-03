import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { bearerToken } from '@/lib/supabase/guard'
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES, extractReceipt, findMatches, type Extracted } from '@/lib/money/receipts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── /api/money/receipts ────────────────────────────────────────────────────
//
// The file itself goes straight from the browser / Studio app to the private
// "receipts" bucket at <user id>/<uuid>.<ext> (Storage RLS: owner + 2FA). That
// keeps 10 MB files clear of Vercel's request-size limit. This route then
// records it, has Claude read it, and suggests the transaction it belongs to.
//
//   GET    ?status=unmatched (default) | ?transaction_id=…  → rows + 5-minute signed URLs
//   POST   { storage_path, file_name, mime_type, size_bytes, transaction_id?, uploaded_via }
//          → { receipt, extracted, matches }
//   PATCH  { id, action: 'attach', transaction_id } | { id, action: 'dismiss' } | { id, action: 'reread' }

const deny = () => NextResponse.json({ error: 'not authorised' }, { status: 401 })
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function userId(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const token = bearerToken((await headers()).get('authorization'))
  const { data } = token ? await sb.auth.getUser(token) : await sb.auth.getUser()
  return data.user?.id ?? null
}

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const q = new URL(req.url).searchParams
  const sb = await supabaseServer()
  let query = sb.from('receipts').select('id,transaction_id,storage_path,file_name,mime_type,extracted,status,uploaded_via,created_at').order('created_at', { ascending: false }).limit(100)
  const tx = q.get('transaction_id')
  query = tx ? query.eq('transaction_id', tx) : query.eq('status', q.get('status') ?? 'unmatched')
  const { data, error } = await query
  if (error) return bad(error.message, 500)
  const rows = data ?? []
  const signed = rows.length
    ? await sb.storage.from('receipts').createSignedUrls(rows.map((r) => r.storage_path), 300)
    : { data: [] as { signedUrl: string }[] }
  return NextResponse.json({ receipts: rows.map((r, i) => ({ ...r, url: signed.data?.[i]?.signedUrl ?? null })) })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  const sb = await supabaseServer()
  const uid = await userId(sb)
  if (!b || !uid) return bad('bad request')

  const path = String(b.storage_path ?? '')
  const mime = String(b.mime_type ?? '')
  if (!path.startsWith(`${uid}/`) || path.includes('..')) return bad('That file isn’t in your receipts folder.')
  if (!RECEIPT_TYPES[mime]) return bad('Receipts can be JPG, PNG or PDF. (HEIC photos: the Studio app converts them; on the web, export as JPG.)')
  const size = Number(b.size_bytes ?? 0)
  if (size > RECEIPT_MAX_BYTES) return bad('Receipts are capped at 10 MB.')
  const via = ['web', 'ios', 'email'].includes(b.uploaded_via) ? b.uploaded_via : 'web'

  let transaction_id: string | null = null
  if (b.transaction_id) {
    const { data: t } = await sb.from('transactions').select('id').eq('id', String(b.transaction_id)).maybeSingle()
    if (!t) return bad('That transaction wasn’t found.', 404)
    transaction_id = t.id
  }

  const { data: apps } = await sb.from('apps').select('slug,name')
  // Attaching to a known transaction: no need to wait on Claude; read it anyway for the tax export.
  const extracted: Extracted | null = await extractReceipt(sb, path, mime, apps ?? [])
  const { data: receipt, error } = await sb.from('receipts').insert({
    storage_path: path, file_name: String(b.file_name ?? '').slice(0, 200) || null, mime_type: mime, size_bytes: size || null,
    transaction_id, status: transaction_id ? 'matched' : 'unmatched', uploaded_via: via, extracted,
  }).select('id,transaction_id,status,file_name,extracted').single()
  if (error) return bad(error.message, 500)

  const matches = transaction_id ? [] : await findMatches(sb, extracted)
  return NextResponse.json({ receipt, extracted, matches })
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return deny()
  const b = await req.json().catch(() => null)
  if (!b?.id || !['attach', 'dismiss', 'reread'].includes(b.action)) return bad('bad request')
  const sb = await supabaseServer()
  const { data: r } = await sb.from('receipts').select('id,storage_path,mime_type').eq('id', b.id).maybeSingle()
  if (!r) return bad('Receipt not found.', 404)

  if (b.action === 'dismiss') {
    const u = await sb.from('receipts').update({ status: 'dismissed' }).eq('id', r.id)
    return u.error ? bad(u.error.message, 500) : NextResponse.json({ ok: true })
  }
  if (b.action === 'attach') {
    const { data: t } = await sb.from('transactions').select('id').eq('id', String(b.transaction_id ?? '')).maybeSingle()
    if (!t) return bad('That transaction wasn’t found.', 404)
    const u = await sb.from('receipts').update({ transaction_id: t.id, status: 'matched' }).eq('id', r.id)
    return u.error ? bad(u.error.message, 500) : NextResponse.json({ ok: true })
  }
  const { data: apps } = await sb.from('apps').select('slug,name')
  const extracted = await extractReceipt(sb, r.storage_path, r.mime_type ?? '', apps ?? [])
  if (!extracted) return bad('Couldn’t read that receipt (no ANTHROPIC_API_KEY, or the file is unreadable).', 422)
  await sb.from('receipts').update({ extracted }).eq('id', r.id)
  return NextResponse.json({ ok: true, extracted, matches: await findMatches(sb, extracted) })
}
