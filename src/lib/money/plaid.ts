// ─── Plaid (Transactions) ────────────────────────────────────────────────────
//
// SERVER ONLY. Access tokens never leave the database: they're stored and read
// through the Vault-backed functions store_plaid_item / get_plaid_token, which
// only the service role can call. Env: PLAID_CLIENT_ID, PLAID_SECRET (secrets),
// PLAID_ENV (sandbox | production).
//
// Money convention: Plaid amounts are positive = money OUT, same as
// transactions.amount_cents. Pending transactions are skipped; Plaid sends the
// posted version later, so nothing is double-counted.

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import type { StudioDb } from './studioDb'

const HOSTS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
}
export const plaidEnv = () => (process.env.PLAID_ENV ?? 'sandbox').toLowerCase()
export const plaidConfigured = () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && HOSTS[plaidEnv()])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function plaid(path: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${HOSTS[plaidEnv()]}${path}`, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...body }),
    signal: AbortSignal.timeout(25000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Plaid ${path}: ${json?.error_code ?? res.status} ${json?.error_message ?? ''}`.trim())
  return json
}

export const siteOrigin = (req: Request) => process.env.SITE_ORIGIN ?? new URL(req.url).origin

// ─── Rules engine ────────────────────────────────────────────────────────────

type Rule = { id: string; match_merchant: string; set_status: string; set_app: string | null; set_schedule_c: string | null; priority: number }

const likeToRegex = (pat: string) =>
  new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')

export function ruleMatcher(rules: Rule[]) {
  const compiled = [...rules].sort((a, b) => a.priority - b.priority)
    .map((r) => ({ r, re: likeToRegex(r.match_merchant) }))
  return (merchant: string, raw: string) =>
    compiled.find(({ re }) => re.test(merchant) || re.test(raw))?.r ?? null
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toRow = (t: any, owner: string, accountId: string | null) => ({
  owner_id: owner, account_id: accountId, external_id: t.transaction_id,
  posted_on: t.date, amount_cents: Math.round(t.amount * 100),
  merchant: t.merchant_name ?? t.name ?? null, raw_description: t.name ?? null,
  plaid_category: t.personal_finance_category?.primary ?? null,
})

/** Pull everything new for one Plaid item. Safe to run repeatedly. */
export async function syncItem(db: StudioDb, itemId: string) {
  const tok = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
  if (!tok.ok || !tok.data) return { itemId, error: tok.ok ? 'no token' : tok.error }
  const accessToken = tok.data

  const [item, accts, rules] = await Promise.all([
    db.select<any[]>('plaid_items', `select=cursor&id=eq.${encodeURIComponent(itemId)}`),
    db.select<any[]>('money_accounts', `select=id,plaid_account_id&plaid_item_id=eq.${encodeURIComponent(itemId)}`),
    db.select<Rule[]>('rules', 'select=*&order=priority'),
  ])
  if (!item.ok || !accts.ok || !rules.ok) return { itemId, error: 'db read failed' }
  const accountId = new Map(accts.data.map((a: any) => [a.plaid_account_id, a.id as string]))
  const match = ruleMatcher(rules.data)

  let cursor: string | undefined = item.data[0]?.cursor ?? undefined
  let added = 0, modified = 0, removed = 0, more = true, guard = 0
  try {
    while (more && guard++ < 20) {
      const page = await plaid('/transactions/sync', { access_token: accessToken, cursor, count: 250 })

      const fresh = (page.added as any[]).filter((t) => !t.pending).map((t) => {
        const row: Record<string, unknown> = toRow(t, db.owner, accountId.get(t.account_id) ?? null)
        const rule = match(String(row.merchant ?? ''), String(row.raw_description ?? ''))
        if (rule) Object.assign(row, { status: rule.set_status, app_slug: rule.set_app, schedule_c: rule.set_schedule_c, rule_id: rule.id })
        return row
      })
      const ins = await db.insertIgnore('transactions', fresh, 'external_id')
      if (!ins.ok) return { itemId, error: ins.error }
      added += fresh.length

      for (const t of page.modified as any[]) {
        if (t.pending) continue
        const { owner_id: _o, external_id: _e, ...fields } = toRow(t, db.owner, accountId.get(t.account_id) ?? null)
        void _o; void _e
        await db.patch('transactions', `external_id=eq.${encodeURIComponent(t.transaction_id)}`, fields)
        modified++
      }
      const gone = (page.removed as any[]).map((t) => t.transaction_id)
      if (gone.length) { await db.remove('transactions', `external_id=in.(${gone.map(encodeURIComponent).join(',')})`); removed += gone.length }

      cursor = page.next_cursor
      more = !!page.has_more
      await db.patch('plaid_items', `id=eq.${encodeURIComponent(itemId)}`, { cursor, status: 'ok', updated_at: new Date().toISOString() })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ITEM_LOGIN_REQUIRED/.test(msg)) await db.patch('plaid_items', `id=eq.${encodeURIComponent(itemId)}`, { status: 'needs_reauth' })
    return { itemId, error: msg }
  }
  return { itemId, added, modified, removed }
}

/** After a new link: store the token, create the account rows, run the first sync. */
export async function connectItem(db: StudioDb, publicToken: string, ownership: 'business' | 'personal') {
  const ex = await plaid('/item/public_token/exchange', { public_token: publicToken })
  const itemId: string = ex.item_id
  const info = await plaid('/item/get', { access_token: ex.access_token })
  let institution: string | null = null
  if (info.item?.institution_id) {
    institution = (await plaid('/institutions/get_by_id', { institution_id: info.item.institution_id, country_codes: ['US'] })
      .catch(() => null))?.institution?.name ?? null
  }
  const stored = await db.rpc('store_plaid_item', { p_item_id: itemId, p_owner: db.owner, p_token: ex.access_token, p_institution: institution })
  if (!stored.ok) throw new Error(stored.error)

  const acc = await plaid('/accounts/get', { access_token: ex.access_token })
  const rows = (acc.accounts as any[]).map((a) => ({
    owner_id: db.owner, source: 'plaid', institution, name: a.name ?? a.official_name, mask: a.mask ?? null,
    ownership, plaid_item_id: itemId, plaid_account_id: a.account_id,
  }))
  const up = await db.upsert('money_accounts', rows, 'plaid_account_id')
  if (!up.ok) throw new Error(up.error)
  return { itemId, institution, accounts: rows.length, sync: await syncItem(db, itemId) }
}

// ─── Webhook verification ────────────────────────────────────────────────────
//
// Plaid signs each webhook with an ES256 JWT in the Plaid-Verification header;
// the JWT carries the SHA-256 of the request body. Check signature, freshness
// (≤5 min), and body hash.

const keyCache = new Map<string, JsonWebKey>()

export async function verifyWebhook(rawBody: string, jwt: string | null): Promise<boolean> {
  try {
    if (!jwt) return false
    const [h, p, s] = jwt.split('.')
    if (!h || !p || !s) return false
    const header = JSON.parse(Buffer.from(h, 'base64url').toString())
    if (header.alg !== 'ES256' || !header.kid) return false

    let jwk = keyCache.get(header.kid)
    if (!jwk) {
      jwk = (await plaid('/webhook_verification_key/get', { key_id: header.kid })).key as JsonWebKey
      keyCache.set(header.kid, jwk)
    }
    const ok = cryptoVerify('SHA256', Buffer.from(`${h}.${p}`),
      { key: createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
    if (!ok) return false

    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (Math.floor(Date.now() / 1000) - claims.iat > 300) return false
    return claims.request_body_sha256 === createHash('sha256').update(rawBody).digest('hex')
  } catch {
    return false
  }
}
