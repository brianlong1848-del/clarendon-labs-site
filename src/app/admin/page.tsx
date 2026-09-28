'use client'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'

// ─── /admin — the studio console ─────────────────────────────────────────────
//
// Every app at a glance (its own live numbers and latest activity, straight
// from that app's admin API), then whatever is waiting on you — today that's
// Gag Order's card suggestions. This page holds NO database credentials: it
// sends the console password to /api/console, which fans out to each app's
// admin API with that app's token (see src/lib/console.ts and
// docs/APP_ADMIN_CONTRACT.md).

type Suggestion = { id: string; message: string; audience: string | null; player_name: string | null; platform: string | null; created_at: string }
type LiveCard = { id: string; text: string; pack_id: string; tier: string; format: string; active: boolean }
type Stat = { label: string; value: number | string; delta?: string; hint?: string; format?: 'usd' }
type Recent = { icon?: string; title: string; detail?: string; at: string }
type AppState = {
  id: string; name: string; accent: string; ok: boolean; ms: number; error?: string
  pending: Suggestion[]; live: LiveCard[]; stats?: Stat[]; recent?: Recent[]
}
type Missing = { id: string; name: string; accent: string }
type Draft = { text: string; pack: string; tier: string; format: string }

const PACKS = [['base', 'Everyone'], ['afterdark', 'After Dark'], ['gay', 'Gay'], ['lesbian', 'Lesbian'], ['transenby', 'Dolls']] as const
const TIERS = [['free', 'Free'], ['core', 'Core'], ['afterdark', 'After Dark']] as const
const FORMATS = [['vote', 'Vote'], ['action', 'Action']] as const
const ORDER = ['rolligan', 'gagorder', 'yulepick', 'borea']
const NOTES: Record<string, string> = {
  rolligan: 'Rolligan has no server of its own — games stay on players’ phones. Its downloads, money, reviews and social live under Analytics and Inbox; in-app feedback arrives in the Inbox once the “Send feedback” screen ships.',
  yulepick: 'Connect YulePick to see users, exchanges, names drawn and the waitlist here.',
  borea: 'Connect Borea to see active users, AI usage and cost, subscribers and paywall hits here.',
  gagorder: 'Connect Gag Order to review card suggestions here.',
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
    const saved = sessionStorage.getItem('clarendon:console')
    if (saved) { setPw(saved); setAuthed(true) }
  }, [])

  const load = useCallback(async (password: string) => {
    setLoading(true); setError(null)
    const res = await fetch('/api/console', { headers: { 'x-console-password': password } }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Could not reach the console API.'); return }
    if (res.status === 401) { setError('Wrong password.'); setAuthed(false); sessionStorage.removeItem('clarendon:console'); return }
    const data = await res.json()
    setApps(data.apps ?? []); setMissing(data.missing ?? []); setLoaded(true)
    setDrafts((prev) => {
      const next: Record<string, Draft> = {}
      for (const app of (data.apps ?? []) as AppState[]) for (const s of app.pending) {
        const k = `${app.id}:${s.id}`
        next[k] = prev[k] ?? {
          text: s.message,
          pack: s.audience && PACKS.some(([v]) => v === s.audience) ? s.audience : 'base',
          tier: 'free', format: /\{player\}/.test(s.message) ? 'action' : 'vote',
        }
      }
      return next
    })
  }, [])
  useEffect(() => { if (authed && pw) load(pw) }, [authed, pw, load])

  const act = async (appId: string, key: string, payload: Record<string, unknown>) => {
    setBusy(key); setToast(null)
    const res = await fetch('/api/console', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-console-password': pw },
      body: JSON.stringify({ appId, ...payload }),
    }).catch(() => null)
    const out = await res?.json().catch(() => ({})) ?? {}
    setBusy(null)
    if (!res?.ok) { setToast({ text: out.error ?? 'That didn’t go through.', tone: 'bad' }); return }
    if (payload.action === 'approve') setToast({ text: out.voiced ? `Published ${out.id ?? 'card'} — voiced and live now.` : `Published ${out.id ?? 'card'} — live now, but the voice clip failed.`, tone: out.voiced ? 'ok' : 'bad' })
    if (payload.action === 'reject') setToast({ text: 'Suggestion rejected.', tone: 'ok' })
    if (payload.action === 'retire') setToast({ text: 'Card retired.', tone: 'ok' })
    load(pw)
  }

  const tiles = useMemo(() => {
    const all: (AppState | (Missing & { missing: true }))[] = [...apps, ...missing.map((m) => ({ ...m, missing: true as const }))]
    return all.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
  }, [apps, missing])
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

  const label: React.CSSProperties = { fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft }
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
      subtitle="Each app’s live numbers and latest activity — and anything waiting on you."
      actions={<>
        <span style={{ fontSize: 12.5, color: C.soft }}>{loading ? 'Refreshing…' : `${apps.length} of ${apps.length + missing.length} apps connected`}</span>
        <button style={btn('ghost')} onClick={() => load(pw)}>Refresh</button>
        <button style={btn('ghost')} onClick={() => { sessionStorage.removeItem('clarendon:console'); setAuthed(false); setPw('') }}>Sign out</button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(420px,1fr))', gap: 18 }}>
        {!loaded ? [0, 1].map((i) => <div key={i} style={{ height: 220, borderRadius: 18, background: C.card, border: `1px solid ${C.rule}` }} />)
          : tiles.map((a) => {
            const isMissing = 'missing' in a
            const app = isMissing ? null : (a as AppState)
            const stats: Stat[] = app?.stats ?? (app ? [
              { label: 'Suggestions waiting', value: app.pending.length },
              { label: 'Live community cards', value: app.live.filter((c) => c.active !== false).length },
            ] : [])
            return (
              <section key={a.id} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20, display: 'grid', gap: 16, alignContent: 'start' }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={`/icons/${a.id}.png`} alt="" width={44} height={44} style={{ borderRadius: 11, boxShadow: '0 4px 12px rgba(20,20,19,.14)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 800 }}>{a.name}</div>
                    <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: C.soft }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: isMissing ? C.faint : app!.ok ? C.mint : C.red }} />
                      {isMissing ? 'Not connected' : app!.ok ? `Connected · ${app!.ms}ms` : app!.error}
                    </div>
                  </div>
                  <Link href={`/analytics/${a.id}`} style={{ ...btn('ghost'), textDecoration: 'none', fontSize: 12.5 }}>Analytics →</Link>
                </header>

                {isMissing ? (
                  <p style={{ margin: 0, fontSize: 13.5, color: C.ink2, lineHeight: 1.5 }}>{NOTES[a.id]}</p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                      {stats.map((s) => (
                        <div key={s.label} title={s.hint} style={{ background: C.card2, borderRadius: 12, padding: '12px 14px' }}>
                          <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{fmtNum(s.value, s.format)}</div>
                          <div style={{ ...label, fontSize: 9.5, marginTop: 5 }}>{s.label}</div>
                          {s.delta && <div style={{ fontSize: 11.5, color: C.mint, fontWeight: 700, marginTop: 4 }}>{s.delta}</div>}
                        </div>
                      ))}
                    </div>
                    {app!.recent && app!.recent.length > 0 && (
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ ...label, marginBottom: 4 }}>Latest</div>
                        {app!.recent.slice(0, 5).map((r, i) => (
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
                    {app!.id === 'gagorder' && app!.pending.length > 0 && (
                      <a href="#review" style={{ fontSize: 13, fontWeight: 700, color: C.mint, textDecoration: 'none' }}>Review {app!.pending.length} suggestion{app!.pending.length === 1 ? '' : 's'} ↓</a>
                    )}
                  </>
                )}
              </section>
            )
          })}
      </div>

      {/* Waiting on you */}
      {loaded && (
        <>
          <div id="review">{section('Card suggestions', <span style={{ fontSize: 12.5, color: C.soft }}>{pending.length} waiting</span>)}</div>
          {pending.length === 0 ? (
            <p style={{ margin: 0, color: C.soft, fontSize: 14 }}>Nothing waiting — new suggestions from players land here and in the Inbox.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(460px,1fr))', gap: 16 }}>
              {pending.map(({ app, s }) => {
                const k = `${app.id}:${s.id}`
                const d = drafts[k]
                if (!d) return null
                const set = (patch: Partial<Draft>) => setDrafts((x) => ({ ...x, [k]: { ...d, ...patch } }))
                const edited = d.text.trim() !== s.message.trim()
                return (
                  <article key={k} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 18, display: 'grid', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.soft }}>
                      <img src={`/icons/${app.id}.png`} alt="" width={18} height={18} style={{ borderRadius: 4 }} />
                      <b style={{ color: C.ink }}>{s.player_name || 'A player'}</b>
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
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      {edited && <button style={btn('ghost')} onClick={() => set({ text: s.message })}>Undo edits</button>}
                      <button style={btn('ghost')} disabled={busy === k} onClick={() => act(app.id, k, { action: 'reject', feedbackId: s.id })}>Reject</button>
                      <button style={{ ...btn('mint'), minWidth: 150 }} disabled={busy === k || !d.text.trim()}
                        onClick={() => act(app.id, k, { action: 'approve', feedbackId: s.id, ...d })}>
                        {busy === k ? 'Publishing…' : edited ? 'Publish edited card' : 'Publish card'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {live.length > 0 || query ? (
            <>
              {section('Live community cards', <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards…"
                style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, width: 220, background: C.card }} />)}
              <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, overflow: 'hidden' }}>
                {live.map(({ app, c }, i) => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center', padding: '12px 18px', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.text}</div>
                      <div style={{ fontSize: 11.5, color: C.soft, marginTop: 3 }}>{app.name} · {c.id}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[PACKS.find(([v]) => v === c.pack_id)?.[1] ?? c.pack_id, TIERS.find(([v]) => v === c.tier)?.[1] ?? c.tier, c.format].map((t) => (
                        <span key={t} style={{ fontSize: 11, fontWeight: 700, color: C.ink2, background: C.card2, borderRadius: 99, padding: '3px 9px' }}>{t}</span>
                      ))}
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
