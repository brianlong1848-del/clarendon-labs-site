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

// ─── Browsing (Studio's Google Drive picker) ─────────────────────────────────
// Studio's "Google Drive" button lists Marketing/Assets through here, because
// the phone's own Files picker can't see Drive under the Workspace device
// policy. Picks come back down through /api/publish/drive/file with their real
// names, so cuts named for a platform find their platform (platformMedia.ts).

export const ASSETS_FOLDER = process.env.DRIVE_ASSETS_FOLDER_ID || '1u2a6IEQuaap3Xluf_rqBoQWwE9_9NNaL'

export type DriveFolder = { id: string; name: string }
export type DriveEntry = {
  id: string; name: string; mimeType: string; folder: boolean
  size?: number; modifiedTime?: string
  /** From Drive's media metadata when it has it. */
  width?: number; height?: number; duration?: number
}
export type DriveListing = { folder: DriveFolder; parent: DriveFolder | null; root: string; entries: DriveEntry[] }

const FOLDER = 'application/vnd.google-apps.folder'
const LIST_FIELDS = 'files(id,name,mimeType,size,modifiedTime,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height))'

type RawFile = {
  id: string; name: string; mimeType: string; size?: string; modifiedTime?: string
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
  imageMediaMetadata?: { width?: number; height?: number }
}

/** A folder's sub-folders and photos/videos, plus its parent (null at `root`, so Back stops there). */
export async function listFolder(id: string, root: string = ASSETS_FOLDER): Promise<DriveListing> {
  const meta = await (await drive(`${API}/${id}?fields=id,name,parents&${ALL}`)).json() as { id: string; name: string; parents?: string[] }
  const q = `'${id}' in parents and trashed = false`
  const res = await drive(`${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(LIST_FIELDS)}&orderBy=folder,name&pageSize=500&${ALL}`)
  const { files = [] } = await res.json() as { files?: RawFile[] }
  const entries: DriveEntry[] = files
    .filter((f) => f.mimeType === FOLDER || /^(image|video)\//.test(f.mimeType))
    .map((f) => ({
      id: f.id, name: f.name, mimeType: f.mimeType, folder: f.mimeType === FOLDER,
      size: f.size ? Number(f.size) : undefined, modifiedTime: f.modifiedTime,
      width: f.videoMediaMetadata?.width ?? f.imageMediaMetadata?.width,
      height: f.videoMediaMetadata?.height ?? f.imageMediaMetadata?.height,
      duration: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : undefined,
    }))
  let parent: DriveFolder | null = null
  const pid = meta.parents?.[0]
  if (id !== root && pid) {
    const p = await (await drive(`${API}/${pid}?fields=id,name&${ALL}`)).json() as DriveFolder
    parent = { id: p.id, name: p.name }
  }
  return { folder: { id: meta.id, name: meta.name }, parent, root, entries }
}

/** Where an app's picker opens: Assets/<App>/05_Exports, else Assets/<App>, else Assets. */
export async function exportsFolder(appName: string, assets: string = ASSETS_FOLDER): Promise<string> {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const app = (await listFolder(assets, assets)).entries.find((e) => e.folder && squash(e.name) === squash(appName))
  if (!app) return assets
  const exp = (await listFolder(app.id, assets)).entries.find((e) => e.folder && /export/i.test(e.name))
  return exp?.id ?? app.id
}

/** The file's bytes as a stream, for the phone to download through clarendon.dev. */
export async function fileStream(id: string): Promise<Response> {
  return drive(`${API}/${id}?alt=media&${ALL}`, { signal: AbortSignal.timeout(55_000) })
}
