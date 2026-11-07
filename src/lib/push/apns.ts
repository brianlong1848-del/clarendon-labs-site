// ─── APNs sender for the Studio iPhone app (FEAT-CLA-027) ───────────────────
//
// SERVER ONLY. Token-based auth (ES256 JWT from the team's APNs key — the same
// .p8 YulePick pushes with; one key serves every app on the team) over HTTP/2
// via node:http2 (fetch/undici can't speak HTTP/2 to APNs). Production first,
// falling back to the sandbox gateway when APNs answers BadDeviceToken, because
// build-to-phone.sh signs Studio for development and those tokens are sandbox.
//
//   APNS_AUTH_KEY   the .p8 contents (PEM, BEGIN/END lines; \n escapes are fine)
//   APNS_KEY_ID     its 10-character Key ID
//   APNS_TEAM_ID    VPTJN4K7C3
//   APNS_BUNDLE_ID  com.clarendonlabs.Studio (default)
import { connect, constants } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'

const PROD = 'https://api.push.apple.com'
const SANDBOX = 'https://api.sandbox.push.apple.com'
export const apnsConfigured = () => !!(process.env.APNS_AUTH_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID)
const bundle = () => process.env.APNS_BUNDLE_ID || 'com.clarendonlabs.Studio'

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
let jwtCache: { token: string; iat: number } | null = null
/** APNs provider token, reused for up to 50 minutes (Apple allows 60). */
function providerToken(): string {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache && now - jwtCache.iat < 50 * 60) return jwtCache.token
  const pem = (process.env.APNS_AUTH_KEY ?? '').replace(/\\n/g, '\n')
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }))
  const claims = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now }))
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' })
  jwtCache = { token: `${header}.${claims}.${b64url(sig)}`, iat: now }
  return jwtCache.token
}

export type PushMessage = { title: string; body: string; link?: string; kind?: string; badge?: number; collapseId?: string; sound?: string }
export type PushResult = { token: string; ok: boolean; status: number; reason?: string; gateway: 'production' | 'sandbox' }

function post(gateway: string, token: string, msg: PushMessage): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = connect(gateway)
    const finish = (r: { status: number; reason?: string }) => { client.close(); resolve(r) }
    client.on('error', (e) => finish({ status: 0, reason: String(e) }))
    const payload = JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: msg.sound ?? 'default', ...(msg.badge != null ? { badge: msg.badge } : {}), 'thread-id': msg.kind ?? 'studio' }, link: msg.link, kind: msg.kind })
    const req = client.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST', [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`, 'apns-topic': bundle(), 'apns-push-type': 'alert', 'apns-priority': '10',
      ...(msg.collapseId ? { 'apns-collapse-id': msg.collapseId.slice(0, 64) } : {}),
      'content-type': 'application/json',
    })
    let status = 0, text = ''
    req.on('response', (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0) })
    req.on('data', (c) => { text += c })
    req.on('end', () => { let reason: string | undefined; try { reason = JSON.parse(text).reason } catch { /* empty body on 200 */ } finish({ status, reason }) })
    req.on('error', (e) => finish({ status: 0, reason: String(e) }))
    req.setTimeout(15_000, () => finish({ status: 0, reason: 'timeout' }))
    req.end(payload)
  })
}

/** Sends to one device. Tries the gateway the device registered with first, then the other on BadDeviceToken. */
export async function sendPush(token: string, env: 'production' | 'sandbox', msg: PushMessage): Promise<PushResult> {
  const order: ('production' | 'sandbox')[] = env === 'sandbox' ? ['sandbox', 'production'] : ['production', 'sandbox']
  let last: PushResult = { token, ok: false, status: 0, gateway: order[0] }
  for (const g of order) {
    const r = await post(g === 'production' ? PROD : SANDBOX, token, msg)
    last = { token, ok: r.status === 200, status: r.status, reason: r.reason, gateway: g }
    if (last.ok || r.reason !== 'BadDeviceToken') break
  }
  return last
}
