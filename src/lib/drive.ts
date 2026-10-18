// ─── Google Drive (Clarendon Marketing folder) ──────────────────────────────
//
// SERVER ONLY. A Google Cloud service account that Brian shared the Drive
// "Clarendon/Marketing" folder with (Editor). No googleapis dependency: the
// JWT is signed here with node:crypto and exchanged for a 1-hour token.
//
//   GOOGLE_SERVICE_ACCOUNT_JSON — the key file Google gives you, pasted as-is
//                                 or base64-encoded. Vercel env only, never Drive.
//
// Service accounts have no Drive storage of their own, so this only READS and
// UPDATES files that already exist (Brian owns them). It never creates files.

import { createSign } from 'crypto'

type Key = { client_email: string; private_key: string }

function key(): Key | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return null
  try {
    const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null
  } catch { return null }
}

export const driveConfigured = () => key() !== null
export const driveAccount = () => key()?.client_email ?? null

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

let cached: { token: string; exp: number } | null = null
async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const k = key()
  if (!k) throw new Error('Drive isn’t connected (GOOGLE_SERVICE_ACCOUNT_JSON is not set).')
  const iat = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: k.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  }))}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(k.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`Drive sign-in failed: ${body.error_description ?? body.error ?? res.status}`)
  cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return cached.token
}

async function drive(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000), ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers as Record<string, string> ?? {}) } })
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 180)}`)
  return res
}

const API = 'https://www.googleapis.com/drive/v3/files'
const ALL = 'supportsAllDrives=true&includeItemsFromAllDrives=true'

/** A file by exact name inside a folder (not trashed), or null. */
export async function findFile(name: string, parentId: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed = false`
  const res = await drive(`${API}?q=${encodeURIComponent(q)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=2&${ALL}`)
  const { files } = await res.json()
  return files?.[0] ?? null
}

export async function readText(id: string): Promise<string> {
  return (await drive(`${API}/${id}?alt=media&${ALL}`)).text()
}

/** Replaces a file's content in place (same id, same name, version history kept by Drive). */
export async function writeText(id: string, content: string): Promise<void> {
  await drive(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&${ALL}`, {
    method: 'PATCH', headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: content,
  })
}
