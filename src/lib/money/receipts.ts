// ─── Receipts: read with Claude, then find the transaction they belong to ─────
//
// SERVER ONLY. Files live in the private "receipts" bucket at <owner uuid>/…
// and are only ever read through the signed-in user's session or short-lived
// signed URLs. Extraction needs ANTHROPIC_API_KEY; without it receipts still
// upload and attach, they just aren't pre-read.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEDULE_C } from '@/lib/money/categories'

export const RECEIPT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

export type Extracted = {
  vendor: string | null; date: string | null; total: number | null; currency: string | null
  line_items: { description: string; amount: number | null }[]
  suggested_app: string | null; suggested_category: string | null
}

export type MatchCandidate = { id: string; posted_on: string; amount_cents: number; merchant: string | null; status: string; source: string }

const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64')

/** Ask Claude to read the receipt. Returns null when there's no key, the file is too
 *  big for the API, or the reply can't be parsed — callers treat that as "not read". */
export async function extractReceipt(sb: SupabaseClient, path: string, mime: string, apps: { slug: string; name: string }[]): Promise<Extracted | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const file = await sb.storage.from('receipts').download(path)
  if (file.error || !file.data) return null
  const buf = await file.data.arrayBuffer()
  if (mime !== 'application/pdf' && buf.byteLength > 4.5 * 1024 * 1024) return null // image limit for the API

  const source = { type: 'base64', media_type: mime, data: b64(buf) }
  const block = mime === 'application/pdf' ? { type: 'document', source } : { type: 'image', source }
  const prompt = `Read this receipt for a small app studio's books. Reply with ONLY a JSON object:
{"vendor": string|null, "date": "YYYY-MM-DD"|null, "total": number|null (amount charged, in dollars), "currency": "USD"|other|null,
 "line_items": [{"description": string, "amount": number|null}],
 "suggested_app": one of ${JSON.stringify(apps.map((a) => a.slug))} or null if it's shared or unclear,
 "suggested_category": one of ${JSON.stringify(SCHEDULE_C.map(([v]) => v))}}
Apps: ${apps.map((a) => `${a.slug} = ${a.name}`).join(', ')}.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(45_000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.RECEIPT_MODEL || 'claude-sonnet-4-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
      }),
    })
    if (!res.ok) { console.error('[receipts] extract HTTP', res.status); return null }
    const data = await res.json()
    const text: string = (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return {
      vendor: typeof json.vendor === 'string' ? json.vendor.slice(0, 120) : null,
      date: typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null,
      total: num(json.total), currency: typeof json.currency === 'string' ? json.currency.slice(0, 8) : null,
      line_items: Array.isArray(json.line_items) ? json.line_items.slice(0, 50).map((l: { description?: unknown; amount?: unknown }) => ({ description: String(l.description ?? '').slice(0, 200), amount: num(l.amount) })) : [],
      suggested_app: apps.some((a) => a.slug === json.suggested_app) ? json.suggested_app : null,
      suggested_category: SCHEDULE_C.some(([v]) => v === json.suggested_category) ? json.suggested_category : null,
    }
  } catch (e) {
    console.error('[receipts] extract failed:', (e as Error).message)
    return null
  }
}

/** Transactions this receipt could belong to: within 3 days and $1, merchant alike first. */
export async function findMatches(sb: SupabaseClient, ex: Extracted | null): Promise<MatchCandidate[]> {
  if (!ex?.date || ex.total == null) return []
  const cents = Math.round(ex.total * 100)
  const day = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
  const { data } = await sb.from('transactions')
    .select('id,posted_on,amount_cents,merchant,status,source')
    .gte('posted_on', day(ex.date, -3)).lte('posted_on', day(ex.date, 3))
    .gte('amount_cents', cents - 100).lte('amount_cents', cents + 100)
    .neq('status', 'ignored').limit(20)
  const word = (ex.vendor ?? '').toLowerCase().split(/\s+/)[0] ?? ''
  const alike = (m: string | null) => !!word && word.length >= 3 && (m ?? '').toLowerCase().includes(word)
  return ((data ?? []) as MatchCandidate[])
    .sort((a, b) => Number(alike(b.merchant)) - Number(alike(a.merchant)) || Math.abs(a.amount_cents - cents) - Math.abs(b.amount_cents - cents))
    .slice(0, 3)
}
