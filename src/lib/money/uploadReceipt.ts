'use client'
import { supabaseBrowser } from '@/lib/supabase/browser'

// Browser → private "receipts" bucket, directly (Storage RLS: owner + 2FA), then
// /api/money/receipts records it and has it read. Returns that route's reply.
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }

export type UploadResult = {
  receipt: { id: string; transaction_id: string | null; status: string; file_name: string | null }
  extracted: null | { vendor: string | null; date: string | null; total: number | null; suggested_app: string | null; suggested_category: string | null; line_items: { description: string; amount: number | null }[] }
  matches: { id: string; posted_on: string; amount_cents: number; merchant: string | null; status: string; source: string }[]
}

export async function uploadReceipt(file: File, transactionId?: string): Promise<UploadResult> {
  const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '')
  if (/heic|heif/i.test(type) || /\.(heic|heif)$/i.test(file.name)) throw new Error('HEIC photos aren’t supported on the web — export as JPG, or use the Studio app, which converts them.')
  const ext = EXT[type]
  if (!ext) throw new Error('Receipts can be JPG, PNG or PDF.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Receipts are capped at 10 MB.')

  const sb = supabaseBrowser()
  const { data } = await sb.auth.getUser()
  if (!data.user) throw new Error('Signed out — sign in again.')
  const path = `${data.user.id}/${crypto.randomUUID()}.${ext}`
  const up = await sb.storage.from('receipts').upload(path, file, { contentType: type, upsert: false })
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`)

  const res = await fetch('/api/money/receipts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage_path: path, file_name: file.name, mime_type: type, size_bytes: file.size, transaction_id: transactionId, uploaded_via: 'web' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as UploadResult
}
