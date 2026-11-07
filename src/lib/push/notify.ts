// ─── notify(): one Studio push, deduped, logged ─────────────────────────────
//
// SERVER ONLY. Inserts the notification (dedupe_key is unique, so the same
// event never sends twice), fans out to every registered device, disables
// tokens APNs reports dead, and records what happened. Never throws: a push
// that fails must not break the webhook or cron that asked for it.
import { studioDb } from '@/lib/money/studioDb'
import { apnsConfigured, sendPush, type PushMessage } from './apns'

export type Notify = PushMessage & { dedupe?: string; appId?: string }
type Device = { token: string; env: 'production' | 'sandbox'; disabled_at: string | null }

export async function notify(n: Notify): Promise<{ sent: number; skipped?: string }> {
  const db = studioDb()
  if (!db) return { sent: 0, skipped: 'studio db not configured' }
  const kind = n.kind ?? 'studio'
  if (n.dedupe) {
    const r = await db.insertIgnore('studio_notifications', [{ kind, title: n.title, body: n.body, link: n.link ?? null, dedupe_key: n.dedupe, app_id: n.appId ?? null }], 'dedupe_key')
    if (!r.ok) return { sent: 0, skipped: r.error }
    const mine = await db.select<{ id: string; sent_at: string | null }[]>('studio_notifications', `select=id,sent_at&dedupe_key=eq.${encodeURIComponent(n.dedupe)}&limit=1`)
    const row = mine.ok ? mine.data[0] : undefined
    if (!row) return { sent: 0, skipped: 'insert failed' }
    if (row.sent_at) return { sent: 0, skipped: 'already sent' }
    return deliver(db, row.id, n)
  }
  const ins = await db.insert<{ id: string }[]>('studio_notifications', [{ kind, title: n.title, body: n.body, link: n.link ?? null, app_id: n.appId ?? null }])
  if (!ins.ok || !ins.data?.[0]) return { sent: 0, skipped: ins.ok ? 'insert failed' : ins.error }
  return deliver(db, ins.data[0].id, n)
}

async function deliver(db: NonNullable<ReturnType<typeof studioDb>>, id: string, n: Notify): Promise<{ sent: number; skipped?: string }> {
  const stamp = (fields: Record<string, unknown>) => db.patch('studio_notifications', `id=eq.${id}`, fields)
  if (!apnsConfigured()) { await stamp({ error: 'APNs not configured (APNS_AUTH_KEY / APNS_KEY_ID / APNS_TEAM_ID)' }); return { sent: 0, skipped: 'apns not configured' } }
  const devs = await db.select<Device[]>('studio_devices', 'select=token,env,disabled_at&disabled_at=is.null')
  if (!devs.ok) { await stamp({ error: devs.error }); return { sent: 0, skipped: devs.error } }
  if (!devs.data.length) { await stamp({ sent_at: new Date().toISOString(), sent_to: 0, error: 'no devices registered' }); return { sent: 0, skipped: 'no devices' } }
  const results = await Promise.all(devs.data.map((d) => sendPush(d.token, d.env, { ...n, collapseId: n.collapseId ?? n.dedupe })))
  const dead = results.filter((r) => !r.ok && (r.reason === 'Unregistered' || r.reason === 'BadDeviceToken' || r.status === 410))
  for (const r of dead) await db.patch('studio_devices', `token=eq.${r.token}`, { disabled_at: new Date().toISOString() })
  for (const r of results) if (r.ok) await db.patch('studio_devices', `token=eq.${r.token}`, { last_seen_at: new Date().toISOString(), env: r.gateway })
  const sent = results.filter((r) => r.ok).length
  const errors = results.filter((r) => !r.ok).map((r) => `${r.status} ${r.reason ?? ''}`.trim())
  await stamp({ sent_at: new Date().toISOString(), sent_to: sent, error: errors.length ? errors.join('; ').slice(0, 300) : null })
  console.log(`[push] ${n.kind ?? 'studio'} "${n.title}" → ${sent}/${results.length}${errors.length ? ` (${errors.join('; ')})` : ''}`)
  return { sent }
}
