'use client'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell, AppTag, C, appAccent, btn, labelStyle } from '@/components/AdminNav'

// ─── /admin — the studio console ─────────────────────────────────────────────
//
// Every app at a glance (its own live numbers and latest activity, straight
// from that app's admin API), then whatever is waiting on you — today that's
// Gag Order's card suggestions. This page holds NO database credentials: it
// sends the console password to /api/console, which fans out to each app's
// admin API with that app's token (see src/lib/console.ts and
// docs/APP_ADMIN_CONTRACT.md).

type Suggestion = {
  id: string; message: string; audience: string | null; player_name: string | null; platform: string | null; created_at: string
  /** Default thank-you the app would send if published as-is (Gag Order's /api/admin). */
  thank_you_draft?: string
  /** False when the suggester's build didn't send a device id — the note is kept but can't be shown. */
  reachable?: boolean
}
type LiveCard = { id: string; text: string; pack_id: string; tier: string; format: string; active: boolean; credit_name?: string | null }
type Stat = { label: string; value: number | string; delta?: string; hint?: string; format?: 'usd' }
type Recent = { icon?: string; title: string; detail?: string; at: string }
type AppState = {
  id: string; name: string; accent: string; ok: boolean; ms: number; error?: string
  pending: Suggestion[]; live: LiveCard[]; stats?: Stat[]; recent?: Recent[]
}
type Missing = { id: string; name: string; accent: string }
type Draft = {
  text: string; pack: string; tier: string; format: string
  /** Thank-you note for the suggester. Follows the card text/pack until edited by hand. */
  note: string; noteEdited: boolean
  /** "Suggested by <name>" under the card in game. */
  credit: boolean
}

const PACKS = [['base', 'Everyone'], ['afterdark', 'After Dark'], ['gay', 'Gay'], ['lesbian', 'Lesbian'], ['transenby', 'Dolls']] as const
const TIERS = [['free', 'Free'], ['core', 'Core'], ['afterdark', 'After Dark']] as const
const FORMATS = [['vote', 'Vote'], ['action', 'Action']] as const
const ORDER = ['rolligan', 'gagorder', 'yulepick', 'borea', 'jinglewire']
const NOTES: Record<string, string> = {
  rolligan: 'Rolligan has no server of its own — games stay on players’ phones. Its downloads, money, reviews and social live under Analytics and Inbox; in-app feedback arrives in the Inbox once the “Send feedback” screen ships.',
  yulepick: 'Connect YulePick to see users, exchanges, names drawn and the waitlist here.',
  borea: 'Connect Borea to see active users, AI usage and cost, subscribers and paywall hits here.',
  gagorder: 'Connect Gag Order to review card suggestions here.',
  jinglewire: 'Jinglewire’s numbers show here once its admin API is connected (JINGLEWIRE_ADMIN_URL + JINGLEWIRE_ADMIN_TOKEN).',
}

// The app drafts the note against the suggestion as submitted. While Brian hasn't
// touched the note, keep it in step with edits to the card text and pack so the
// note never quotes a card that isn't the one being published.
const packPhrase = (pack: string) => pack === 'base'
  ? 'for every Gag Order table'
  : `in the ${PACKS.find(([v]) => v === pack)?.[1] ?? pack} pack for every Gag Order table`
const quoted = (t: string) => `“${t.trim().replace(/\{player\}/g, '___')}”`
function retarget(base: string, s: Suggestion, startPack: string, text: string, pack: string) {
  return base.replace(quoted(s.message), quoted(text)).replace(packPhrase(startPack), packPhrase(pack))
}
const firstName = (n: string | null) => {
  const f = (n ?? '').trim().split(/\s+/)[0] ?? ''
  return f ? f.charAt(0).toUpperCase() + f.slice(1, 24) : null
}

const fmtNum = (v: number | string, format?: 'usd') =>
  typeof v !== 'number' ? v : format === 'usd' ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : v.toLocaleString('en-US')
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const ICON: Record<string, string> = { person: '👤', gift: '🎁', mail: '✉︎', star: '★', lock: '🔒', card: '🃏' }

const startPack = (s: Suggestion) => s.audience && PACKS.some(([v]) => v === s.audience) ? s.audience : 'base'

export default function ConsolePage() {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<AppState[]>([])
  const [missing, setMissing] = useState<Missing[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const saved = 'session'
    if (saved) { setPw(saved); setAuthed(true) }
  }, [])

  const load = useCallback(async (password: string) => {
    setLoading(true); setError(null)
    const res = await fetch('/api/console', { headers: {} }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Could not reach the console API.'); return }
    if (res.status === 401) { setError('Wrong password.'); setAuthed(false); (window.location.href = '/login'); return }
    const data = await res.json()
    setApps(data.apps ?? []); setMissing(data.missing ?? []); setLoaded(true)
    setDrafts((prev) => {
      const next: Record<string, Draft> = {}
      for (const app of (data.apps ?? []) as AppState[]) for (const s of app.pending) {
        const k = `${app.id}:${s.id}`
        next[k] = prev[k] ?? {
          text: s.message,
          pack: startPack(s),
          tier: 'free', format: /\{player\}/.test(s.message) ? 'action' : 'vote',
          note: s.thank_you_draft ?? '', noteEdited: false, credit: true,
        }
      }
      return next
    })
  }, [])
  useEffect(() => { if (authed && pw) load(pw) }, [authed, pw, load])

  const act = async (appId: string, key: string, payload: Record<string, unknown>) => {
    setBusy(key); setToast(null)
    const res = await fetch('/api/console', {
      method: 'POST', headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({ appId, ...payload }),
    }).catch(() => null)
    const out = await res?.json().catch(() => ({})) ?? {}
    setBusy(null)
    if (!res?.ok) { setToast({ text: out.error ?? 'That didn’t go through.', tone: 'bad' }); return }
    if (payload.action === 'approve') {
      const base = out.voiced ? `Published ${out.id ?? 'card'} — voiced and live now.` : `Published ${out.id ?? 'card'} — live now, but the voice clip failed.`
      const who = typeof out.credit === 'string' ? out.credit : 'They'
      const thanks = out.thanked ? ` ${who} will see your thank-you next time they open the app.` : ' (Their app version can’t receive the thank-you.)'
      setToast({ text: base + thanks, tone: out.voiced ? 'ok' : 'bad' })
    }
    if (payload.action === 'reject') setToast({ text: 'Suggestion rejected.', tone: 'ok' })
    if (payload.action === 'retire') setToast({ text: 'Card retired.', tone: 'ok' })
    load(pw)
  }

  // Connected apps get a full card; the rest share one compact row.
  const tiles = useMemo(() => [...apps].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)), [apps])
  const notConnected = useMemo(() => [...missing].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)), [missing])
  const pending = apps.flatMap((a) => a.pending.map((s) => ({ app: a, s })))
  const live = apps.flatMap((a) => a.live.filter((c) => c.active !== false).map((c) => ({ app: a, c })))
    .filter(({ c }) => !query || c.text.toLowerCase().includes(query.toLowerCase()))

  if (!authed) {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink, display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
          <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '10px 0 22px' }}>Console</h1>
          <input type="password" placeholder="Password" value={entry} onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && entry) { sessionStorage.setItem('clarendon:console', entry); setPw(entry); setAuthed(true) } }}
            style={{ background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
          <button style={{ ...btn('mint'), width: '100%', marginTop: 12 }} disabled={!entry}
            onClick={() => { sessionStorage.setItem('clarendon:console', entry); setPw(entry); setAuthed(true) }}>Sign in</button>
          {error && <p style={{ color: C.soft, fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    )
  }

  const label = labelStyle
  const section = (title: string, aside?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
      <h2 style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h2>
      <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: 'center' }} />{aside}
    </div>
  )
  const chips = (value: string, options: readonly (readonly [string, string])[], onChange: (v: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          style={{ border: `1px solid ${value === v ? C.ink : C.rule2}`, background: value === v ? C.ink : C.card, color: value === v ? C.paper : C.ink2,
                   borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>{l}</button>
      ))}
    </div>
  )

  return (
    <AdminShell
      title="Console"
      subtitle={`Each app’s live numbers and anything waiting on you${loaded ? ` · ${apps.length} of ${apps.length + missing.length} apps connected` : ''}`}
      actions={<>
        <button style={btn('ghost')} disabled={loading} onClick={() => load(pw)}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        <button style={btn('ghost')} onClick={() => { fetch('/auth/signout', { method: 'POST' }).finally(() => { window.location.href = '/login' }) }}>Sign out</button>
      </>}
    >
      <div style={{ display: 'grid', gap: 24 }}>
      {toast && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
                                    background: toast.tone === 'ok' ? C.mintTint : '#FBE7E5', color: toast.tone === 'ok' ? C.mint : C.red, fontWeight: 700, fontSize: 14 }}>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss" style={{ all: 'unset', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}

      {/* Apps at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(420px,100%),1fr))', gap: 18 }}>
        {!loaded ? [0, 1].map((i) => <div key={i} style={{ height: 220, borderRadius: 18, background: C.card, border: `1px solid ${C.rule}` }} />)
          : tiles.map((app) => {
            const stats: Stat[] = app.stats ?? [
              { label: 'Suggestions waiting', value: app.pending.length },
              { label: 'Live community cards', value: app.live.filter((c) => c.active !== false).length },
            ]
            return (
              <section key={app.id} style={{ background: C.card, border: `1px solid ${C.rule}`, borderTop: `4px solid ${app.accent ?? appAccent(app.id)}`,
                                             borderRadius: 18, padding: 20, display: 'grid', gap: 16, alignContent: 'start' }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
                    <AppTag id={app.id} name={app.name} size={32} style={{ fontSize: 20, fontWeight: 700 }} />
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: C.soft }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: app.ok ? C.mint : C.red }} />
                      {app.ok ? `Connected · ${app.ms}ms` : app.error}
                    </div>
                  </div>
                  <Link href={`/analytics/${app.id}`} style={{ ...btn('ghost'), textDecoration: 'none', fontSize: 12.5 }}>Analytics</Link>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                  {stats.map((s) => (
                    <div key={s.label} title={s.hint} style={{ background: C.card2, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{fmtNum(s.value, s.format)}</div>
                      <div style={{ ...label, marginTop: 5 }}>{s.label}</div>
                      {s.delta && <div style={{ fontSize: 11.5, color: C.mint, fontWeight: 700, marginTop: 4 }}>{s.delta}</div>}
                    </div>
                  ))}
                </div>
                {app.recent && app.recent.length > 0 && (
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ ...label, marginBottom: 4 }}>Latest</div>
                    {app.recent.slice(0, 5).map((r, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 8, alignItems: 'baseline', fontSize: 13, padding: '5px 0', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
                        <span aria-hidden style={{ color: C.soft }}>{ICON[r.icon ?? ''] ?? '•'}</span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <b style={{ fontWeight: 650 }}>{r.title}</b>{r.detail && <span style={{ color: C.soft }}> · {r.detail}</span>}
                        </span>
                        <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>{ago(r.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {app.id === 'gagorder' && (app.pending.length > 0
                  ? <a href="#review" style={{ fontSize: 13, fontWeight: 700, color: C.mint, textDecoration: 'none' }}>Review {app.pending.length} suggestion{app.pending.length === 1 ? '' : 's'}</a>
                  : <p style={{ margin: 0, fontSize: 13, color: C.soft }}>No suggestions waiting</p>)}
              </section>
            )
          })}
      </div>

      {/* Apps without an admin API yet: one row, how to connect each on hover / tap */}
      {loaded && notConnected.length > 0 && (
        <div data-card style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: '14px 18px',
                                display: 'flex', alignItems: 'flex-start', gap: '10px 22px', flexWrap: 'wrap' }}>
          <span style={{ ...label, paddingTop: 4 }}>Not connected</span>
          {notConnected.map((m) => (
            <details key={m.id} title={NOTES[m.id]} style={{ fontSize: 14, fontWeight: 600, maxWidth: 360 }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'inline-flex' }}>
                <AppTag id={m.id} name={m.name} />
              </summary>
              <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 400, color: C.ink2, lineHeight: 1.5 }}>{NOTES[m.id]}</p>
            </details>
          ))}
        </div>
      )}

      {/* Waiting on you */}
      {loaded && (
        <>
          {pending.length > 0 && (<>
          <div id="review">{section('Card suggestions', <span style={{ fontSize: 12.5, color: C.soft }}>{pending.length} waiting</span>)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(460px,100%),1fr))', gap: 16 }}>
              {pending.map(({ app, s }) => {
                const k = `${app.id}:${s.id}`
                const d = drafts[k]
                if (!d) return null
                const set = (patch: Partial<Draft>) => setDrafts((x) => {
                  const nd = { ...d, ...patch }
                  if (!nd.noteEdited && ('text' in patch || 'pack' in patch) && s.thank_you_draft) {
                    nd.note = retarget(s.thank_you_draft, s, startPack(s), nd.text, nd.pack)
                  }
                  return { ...x, [k]: nd }
                })
                const who = firstName(s.player_name)
                const edited = d.text.trim() !== s.message.trim()
                return (
                  <article key={k} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 18, display: 'grid', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.soft }}>
                      <AppTag id={app.id} name={app.name} size={18} style={{ color: C.ink2 }} />
                      <b style={{ color: C.ink }}>· {s.player_name || 'A player'}</b>
                      <span>· {s.platform ?? 'app'} · {ago(s.created_at)}</span>
                    </div>
                    {/* The card as players will see it */}
                    <div style={{ borderRadius: 16, padding: 18, minHeight: 110, display: 'grid', alignContent: 'space-between', gap: 10,
                                  background: 'linear-gradient(135deg,#2B1B3D 0%,#6B2A5E 55%,#C2436E 100%)', color: '#fff', boxShadow: '0 10px 24px rgba(107,42,94,.25)' }}>
                      <textarea value={d.text} onChange={(e) => set({ text: e.target.value })} rows={3} aria-label="Card text"
                        style={{ all: 'unset', fontFamily: C.serif, fontSize: 19, fontWeight: 800, lineHeight: 1.3, whiteSpace: 'pre-wrap', width: '100%' }} />
                      <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .85 }}>
                        <span>{PACKS.find(([v]) => v === d.pack)?.[1]}</span>·<span>{d.format}</span>·<span>{TIERS.find(([v]) => v === d.tier)?.[1]}</span>
                        {edited && <span style={{ marginLeft: 'auto', opacity: .8 }}>edited</span>}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Pack</span>{chips(d.pack, PACKS, (v) => set({ pack: v }))}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Tier</span>{chips(d.tier, TIERS, (v) => set({ tier: v }))}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}><span style={label}>Format</span>{chips(d.format, FORMATS, (v) => set({ format: v }))}</div>
                    </div>
                    {/* Close the loop with whoever sent it */}
                    <div style={{ display: 'grid', gap: 8, background: C.card2, borderRadius: 14, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={label}>Thank-you to {who ?? 'the player'}</span>
                        <span style={{ flex: 1 }} />
                        {d.noteEdited && s.thank_you_draft && (
                          <button style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: C.soft, textDecoration: 'underline' }}
                            onClick={() => set({ noteEdited: false, note: retarget(s.thank_you_draft!, s, startPack(s), d.text, d.pack) })}>Reset</button>
                        )}
                      </div>
                      <textarea value={d.note} rows={4} aria-label="Thank-you note"
                        onChange={(e) => set({ note: e.target.value, noteEdited: true })}
                        style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, fontFamily: C.sans, background: C.card, resize: 'vertical' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink2, cursor: who ? 'pointer' : 'default' }}>
                        <input type="checkbox" checked={!!who && d.credit} disabled={!who} onChange={(e) => set({ credit: e.target.checked })} />
                        {who ? <>Show “Suggested by {who}” on the card in game</> : <>No name on this suggestion — no credit line</>}
                      </label>
                      {s.reachable === false && (
                        <p style={{ margin: 0, fontSize: 12, color: C.soft }}>Sent from an older app version, so there’s no way to deliver the note to them. The credit line still shows.</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      {edited && <button style={btn('ghost')} onClick={() => set({ text: s.message })}>Undo edits</button>}
                      <button style={btn('ghost')} disabled={busy === k} onClick={() => act(app.id, k, { action: 'reject', feedbackId: s.id })}>Reject</button>
                      <button style={{ ...btn('mint'), minWidth: 150 }} disabled={busy === k || !d.text.trim()}
                        onClick={() => act(app.id, k, { action: 'approve', feedbackId: s.id, text: d.text, pack: d.pack, tier: d.tier, format: d.format, thankYou: d.note, credit: d.credit })}>
                        {busy === k ? 'Publishing…' : edited ? 'Publish edited card' : 'Publish card'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </>)}

          {live.length > 0 || query ? (
            <>
              {section('Live community cards', <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards…"
                style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, width: 220, background: C.card }} />)}
              <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, overflow: 'hidden' }}>
                {live.map(({ app, c }, i) => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', padding: '12px 18px', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.text}</div>
                      <div style={{ fontSize: 13, color: C.ink2, marginTop: 3 }}>
                        {[PACKS.find(([v]) => v === c.pack_id)?.[1] ?? c.pack_id, TIERS.find(([v]) => v === c.tier)?.[1] ?? c.tier, FORMATS.find(([v]) => v === c.format)?.[1] ?? c.format].join(' · ')}
                      </div>
                      <div title={c.id} style={{ fontSize: 11.5, color: C.soft, marginTop: 2 }}>{c.credit_name ? `Suggested by ${c.credit_name}` : app.name}</div>
                    </div>
                    <button style={{ ...btn('ghost'), fontSize: 12.5 }} disabled={busy === c.id}
                      onClick={() => { if (confirm('Retire this card for every player?')) act(app.id, c.id, { action: 'retire', cardId: c.id }) }}>
                      {busy === c.id ? 'Retiring…' : 'Retire'}
                    </button>
                  </div>
                ))}
                {live.length === 0 && <p style={{ padding: 18, margin: 0, color: C.soft }}>No cards match “{query}”.</p>}
              </div>
            </>
          ) : null}
        </>
      )}
      </div>
    </AdminShell>
  )
}
