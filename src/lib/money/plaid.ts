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

type Rule = { id: string; match_merchant: string; set_status: string; set_app: string | null; set_split_apps: string[] | null; set_schedule_c: string | null; priority: number }

const likeToRegex = (pat: string) =>
  new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')

export function ruleMatcher(rules: Rule[]) {
  const compiled = [...rules].sort((a, b) => a.priority - b.priority)
    .map((r) => ({ r, re: likeToRegex(r.match_merchant) }))
  return (merchant: string, raw: string) =>
    compiled.find(({ re }) => re.test(merchant) || re.test(raw))?.r ?? null
}

// ─── Sync ────────────────────────────────────────────────────────────────────

// Plaid only learns where to send webhooks from the link token, so this is the
// production URL no matter which host (preview, localhost, Studio) asked for it.
// www on purpose: the apex 307-redirects to www, and Plaid doesn't follow redirects.
export const PLAID_WEBHOOK_URL = process.env.PLAID_WEBHOOK_URL ?? 'https://www.clarendon.dev/api/plaid/webhook'
// History to request on a new item. Plaid fixes this at link time; an existing
// item can't be widened, only removed and linked again (Reconnect bank).
export const PLAID_DAYS_REQUESTED = 730

const toRow = (t: any, owner: string, accountId: string | null) => ({
  owner_id: owner, account_id: accountId, external_id: t.transaction_id,
  posted_on: t.date, amount_cents: Math.round(t.amount * 100),
  merchant: t.merchant_name ?? t.name ?? null, raw_description: t.name ?? null,
  plaid_category: t.personal_finance_category?.primary ?? null,
})

/** Status line for the Money tab. Best effort: a missing column (migration not run yet) never blocks a sync. */
async function markItem(db: StudioDb, itemId: string, fields: Record<string, unknown>) {
  const r = await db.patch('plaid_items', `id=eq.${encodeURIComponent(itemId)}`, { ...fields, updated_at: new Date().toISOString() })
  if (!r.ok) console.error(`[plaid] status write ${itemId}: ${r.error}`)
}

export type SyncResult = { itemId: string; added?: number; modified?: number; removed?: number; more?: boolean; pending?: boolean; error?: string }

/**
 * Pull everything new for one Plaid item: /transactions/sync page by page
 * until has_more is false, saving the cursor after every page so a timeout or
 * crash resumes where it stopped. Safe to run repeatedly (inserts skip known
 * transaction ids). PRODUCT_NOT_READY means Plaid is still pulling history:
 * reported as pending, not success; the HISTORICAL_UPDATE webhook (or Sync
 * now) picks it up later.
 */
export async function syncItem(db: StudioDb, itemId: string): Promise<SyncResult> {
  const id = encodeURIComponent(itemId)
  const fail = async (error: string, extra: Record<string, unknown> = {}): Promise<SyncResult> => {
    console.error(`[plaid] sync ${itemId}: ${error}`)
    await markItem(db, itemId, { last_error: error.slice(0, 500), ...extra })
    return { itemId, error }
  }

  const tok = await db.rpc<string>('get_plaid_token', { p_item_id: itemId })
  if (!tok.ok || !tok.data) return fail(tok.ok ? 'no access token stored' : tok.error)
  const accessToken = tok.data

  const [item, accts, rules] = await Promise.all([
    db.select<any[]>('plaid_items', `select=cursor&id=eq.${id}`),
    db.select<any[]>('money_accounts', `select=id,plaid_account_id&plaid_item_id=eq.${id}`),
    db.select<Rule[]>('rules', 'select=*&order=priority'),
  ])
  if (!item.ok || !accts.ok || !rules.ok) return fail(`db read failed: ${[item, accts, rules].map((r) => (r.ok ? '' : r.error)).join(' ').trim()}`)
  const accountId = new Map(accts.data.map((a: any) => [a.plaid_account_id, a.id as string]))
  const match = ruleMatcher(rules.data)
  const adopt = await orphanAdopter(db, accts.data.map((a: any) => a.id as string))

  const startCursor: string | undefined = item.data[0]?.cursor || undefined
  let cursor = startCursor
  let added = 0, modified = 0, removed = 0, more = true, restarts = 0
  const deadline = Date.now() + 45_000 // leave headroom under maxDuration; the saved cursor resumes the rest
  try {
    while (more) {
      if (Date.now() > deadline) {
        await markItem(db, itemId, { last_error: null })
        return { itemId, added, modified, removed, more: true }
      }
      let page: any
      try {
        page = await plaid('/transactions/sync', { access_token: accessToken, cursor, count: 500, options: { days_requested: PLAID_DAYS_REQUESTED } })
      } catch (e) {
        // Plaid changed data mid-pagination: restart this run from where it began (inserts are idempotent).
        if (/TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION/.test(String(e)) && restarts++ < 3) { cursor = startCursor; continue }
        throw e
      }

      // Every row must carry the same keys: PostgREST rejects a bulk insert
      // whose objects differ (PGRST102), which is what stalled the first sync.
      const fresh = (page.added as any[]).filter((t) => !t.pending).map((t) => {
        const rule = match(String(t.merchant_name ?? t.name ?? ''), String(t.name ?? ''))
        return {
          ...toRow(t, db.owner, accountId.get(t.account_id) ?? null),
          status: rule?.set_status ?? 'unreviewed',
          app_slug: rule && !rule.set_split_apps ? rule.set_app : null,
          split_apps: rule?.set_split_apps ?? null,
          schedule_c: rule?.set_schedule_c ?? null,
          rule_id: rule?.id ?? null,
        }
      })
      const toInsert = []
      for (const row of fresh) if (!(await adopt(row))) toInsert.push(row)
      const ins = await db.insertIgnore('transactions', toInsert, 'external_id')
      if (!ins.ok) return fail(ins.error)
      added += toInsert.length

      for (const t of page.modified as any[]) {
        if (t.pending) continue
        // Plaid's fields only; the sorting done in Triage stays.
        const { owner_id: _o, external_id: _e, ...fields } = toRow(t, db.owner, accountId.get(t.account_id) ?? null)
        void _o; void _e
        await db.patch('transactions', `external_id=eq.${encodeURIComponent(t.transaction_id)}`, fields)
        modified++
      }
      const gone = (page.removed as any[]).map((t) => t.transaction_id)
      if (gone.length) { await db.remove('transactions', `external_id=in.(${gone.map(encodeURIComponent).join(',')})`); removed += gone.length }

      cursor = page.next_cursor || cursor
      more = !!page.has_more
      const saved = await db.patch('plaid_items', `id=eq.${id}`, { cursor, status: 'ok', updated_at: new Date().toISOString() })
      if (!saved.ok) return fail(`cursor save failed: ${saved.error}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/PRODUCT_NOT_READY/.test(msg)) {
      await markItem(db, itemId, { last_error: 'Plaid is still pulling history from the bank — will retry when it says it is ready.' })
      return { itemId, added, modified, removed, pending: true }
    }
    if (/ITEM_LOGIN_REQUIRED|PENDING_EXPIRATION|ACCESS_NOT_GRANTED/.test(msg)) return fail(msg, { status: 'needs_reauth' })
    return fail(msg)
  }
  await markItem(db, itemId, { last_synced_at: new Date().toISOString(), last_error: null })
  await pruneEmptyOrphanAccounts(db)
  return { itemId, added, modified, removed }
}

/**
 * After Reconnect bank, Plaid re-sends the same history under new transaction
 * ids. The old rows (with their Triage sorting, splits and receipts) sit on the
 * old, now-unlinked account row with the same last four. Instead of inserting a
 * duplicate, re-point the matching old row (same date, amount, description) at
 * the new id and account. Returns true when a row was adopted. Old account rows
 * left empty are dropped once the sync finishes adopting.
 */
async function orphanAdopter(db: StudioDb, newAccountIds: string[]) {
  const none = async () => false
  if (!newAccountIds.length) return none
  const mine = await db.select<any[]>('money_accounts', `select=id,mask,institution&id=in.(${newAccountIds.join(',')})`)
  const orphans = await db.select<any[]>('money_accounts', 'select=id,mask,institution&source=eq.plaid&plaid_item_id=is.null')
  if (!mine.ok || !orphans.ok || !orphans.data.length) return none
  // new account id → old account ids with the same institution + last four
  const oldFor = new Map<string, string[]>()
  for (const a of mine.data) {
    const olds = orphans.data.filter((o) => o.mask && o.mask === a.mask && o.institution === a.institution).map((o) => o.id as string)
    if (olds.length) oldFor.set(a.id, olds)
  }
  const oldIds = Array.from(new Set(Array.from(oldFor.values()).flat()))
  if (!oldIds.length) return none
  const prior = await db.select<any[]>('transactions', `select=id,account_id,posted_on,amount_cents,raw_description&source=eq.plaid&account_id=in.(${oldIds.join(',')})`)
  if (!prior.ok) return none
  const pool = new Map<string, string[]>() // key → old transaction ids
  const key = (acct: string, d: string, c: number, desc: string | null) => `${acct}|${d}|${c}|${desc ?? ''}`
  for (const t of prior.data) {
    const k = key(t.account_id, t.posted_on, Number(t.amount_cents), t.raw_description)
    pool.set(k, [...(pool.get(k) ?? []), t.id])
  }
  return async (row: { account_id: string | null; posted_on: string; amount_cents: number; raw_description: string | null; external_id: string }) => {
    if (!row.account_id) return false
    for (const oldAcct of oldFor.get(row.account_id) ?? []) {
      const ids = pool.get(key(oldAcct, row.posted_on, row.amount_cents, row.raw_description))
      const id = ids?.shift()
      if (!id) continue
      const r = await db.patch('transactions', `id=eq.${id}`, { external_id: row.external_id, account_id: row.account_id })
      if (!r.ok) { console.error(`[plaid] adopt ${id}: ${r.error}`); return false }
      return true
    }
    return false
  }
}

/** Drop old, unlinked Plaid account rows that no longer hold any transactions. */
export async function pruneEmptyOrphanAccounts(db: StudioDb) {
  const orphans = await db.select<any[]>('money_accounts', 'select=id&source=eq.plaid&plaid_item_id=is.null')
  if (!orphans.ok) return
  for (const o of orphans.data) {
    const n = await db.count('transactions', `account_id=eq.${o.id}`)
    if (n.ok && n.data === 0) await db.remove('money_accounts', `id=eq.${o.id}`)
  }
}

/** Safe-to-show status for every connected item (no tokens, no cursors). */
export async function itemStatuses(db: StudioDb) {
  let r = await db.select<any[]>('plaid_items', 'select=id,institution,status,updated_at,last_synced_at,last_error&order=institution')
  if (!r.ok) r = await db.select<any[]>('plaid_items', 'select=id,institution,status,updated_at&order=institution') // before the migration
  if (!r.ok) throw new Error(r.error)
  const accts = await db.select<any[]>('money_accounts', 'select=id,plaid_item_id&plaid_item_id=not.is.null')
  const perItem = new Map<string, number>()
  await Promise.all(r.data.map(async (i) => {
    const ids = (accts.ok ? accts.data : []).filter((a) => a.plaid_item_id === i.id).map((a) => a.id)
    if (!ids.length) return
    const c = await db.count('transactions', `source=eq.plaid&account_id=in.(${ids.join(',')})`)
    if (c.ok) perItem.set(i.id, c.data)
  }))
  return r.data.map((i) => ({
    id: i.id as string, institution: i.institution as string | null, status: i.status as string,
    last_synced_at: (i.last_synced_at ?? null) as string | null, last_error: (i.last_error ?? null) as string | null,
    updated_at: i.updated_at as string, transactions: perItem.get(i.id) ?? 0,
  }))
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
