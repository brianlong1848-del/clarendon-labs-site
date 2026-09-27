'use client'
import { useCallback, useEffect, useState } from 'react'

// ─── /admin — the studio console ─────────────────────────────────────────────
//
// One place to run every Clarendon app. This page holds NO database credentials:
// it sends the console password to /api/console, which fans out to each app's
// own admin API using that app's token. See src/lib/console.ts for why.
//
// Password lives in sessionStorage, so closing the tab signs you out.

type Suggestion = {
  id: string; message: string; audience: string | null
  player_name: string | null; platform: string | null; created_at: string
}
type LiveCard = {
  id: string; text: string; pack_id: string; tier: string
  format: string; active: boolean
}
type AppState = {
  id: string; name: string; accent: string; ok: boolean; ms: number
  error?: string; pending: Suggestion[]; live: LiveCard[]
}
type Draft = { text: string; pack: string; tier: string; format: string }

const PACKS = [
  ['base', 'Everyone'], ['afterdark', 'After Dark'], ['gay', 'Gay'],
  ['lesbian', 'Lesbian'], ['transenby', 'Dolls'],
] as const
const TIERS = ['free', 'core', 'afterdark'] as const

const C = {
  paper: '#0B0D11', card: '#12151D', card2: '#161A24',
  ink: '#EEF1F6', ink2: '#B7BDC9', soft: '#7E8595',
  rule: 'rgba(255,255,255,.08)', rule2: 'rgba(255,255,255,.14)',
  mint: '#53E6B4', amber: '#FBBF24', red: '#F0509A',
  mono: "'IBM Plex Mono','SF Mono',Menlo,monospace",
  sans: "'Archivo',-apple-system,'Helvetica Neue',Arial,sans-serif",
  serif: "'Besley',Georgia,serif",
}

export default function ConsolePage() {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [entry, setEntry] = useState('')
  const [apps, setApps] = useState<AppState[]>([])
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  useEffect(() => {
    const saved = sessionStorage.getItem('clarendon:console')
    if (saved) { setPw(saved); setAuthed(true) }
  }, [])

  const load = useCallback(async (password: string) => {
    setLoading(true); setError(null)
    let res: Response
    try {
      res = await fetch('/api/console', { headers: { 'x-console-password': password } })
    } catch {
      setLoading(false); setError('Could not reach the console API.'); return
    }
    setLoading(false)
    if (res.status === 401) {
      setError('Wrong password.'); setAuthed(false)
      sessionStorage.removeItem('clarendon:console'); return
    }
    const data = await res.json()
    setApps(data.apps ?? [])
    setHint(data.hint ?? null)
    // Seed an editable draft per suggestion, so a prompt can be reworded before
    // it becomes a card without losing what was actually submitted.
    const next: Record<string, Draft> = {}
    for (const app of data.apps ?? []) {
      for (const s of app.pending as Suggestion[]) {
        next[`${app.id}:${s.id}`] = {
          text: s.message,
          pack: s.audience && PACKS.some(([v]) => v === s.audience) ? s.audience : 'base',
          tier: 'free',
          format: /\{player\}/.test(s.message) ? 'action' : 'vote',
        }
      }
    }
    setDrafts(next)
  }, [])

  useEffect(() => { if (authed && pw) load(pw) }, [authed, pw, load])

  const act = async (appId: string, payload: Record<string, unknown>) => {
    setNote(null)
    const res = await fetch('/api/console', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-console-password': pw },
      body: JSON.stringify({ appId, ...payload }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) { setNote(out.error ?? 'Failed.'); return }
    if (payload.action === 'approve') {
      setNote(out.voiced
        ? `Added ${out.id} — voiced and live now.`
        : `Added ${out.id} — live now, but the voice clip failed.`)
    }
    load(pw)
  }

  const signIn = () => {
    sessionStorage.setItem('clarendon:console', entry)
    setPw(entry); setAuthed(true)
  }

  const input: React.CSSProperties = {
    background: 'rgba(255,255,255,.04)', border: `1px solid ${C.rule2}`,
    borderRadius: 10, padding: '12px 14px', color: C.ink,
    fontFamily: C.sans, fontSize: 15, width: '100%',
  }
  const btn = (kind: 'solid' | 'ghost' | 'mint'): React.CSSProperties => ({
    fontFamily: C.sans, fontWeight: 600, fontSize: 14, padding: '10px 18px',
    borderRadius: 10, cursor: 'pointer', lineHeight: 1.2,
    border: `1px solid ${kind === 'ghost' ? C.rule2 : 'transparent'}`,
    background: kind === 'mint' ? C.mint : kind === 'solid' ? C.ink : 'rgba(255,255,255,.03)',
    color: kind === 'ghost' ? C.ink : '#06251B',
  })

  if (!authed) {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink,
                     display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <p style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em',
                      textTransform: 'uppercase', color: C.soft }}>Clarendon Labs</p>
          <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '10px 0 22px' }}>
            Console
          </h1>
          <input style={input} type="password" placeholder="Password" value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && entry) signIn() }} />
          <button style={{ ...btn('mint'), width: '100%', marginTop: 12 }}
            disabled={!entry} onClick={signIn}>Sign in</button>
          {error && <p style={{ color: C.soft, fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: C.paper, minHeight: '100dvh', color: C.ink,
                   fontFamily: C.sans, padding: '32px 20px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: C.serif, fontSize: 34, fontWeight: 900 }}>Console</h1>
          <span style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.14em',
                         textTransform: 'uppercase', color: C.soft }}>
            {loading ? 'refreshing…' : `${apps.length} app${apps.length === 1 ? '' : 's'}`}
          </span>
          <button style={{ ...btn('ghost'), marginLeft: 'auto' }} onClick={() => load(pw)}>
            Refresh
          </button>
          <button style={btn('ghost')} onClick={() => {
            sessionStorage.removeItem('clarendon:console'); setAuthed(false); setPw('')
          }}>Sign out</button>
        </div>

        {hint && <p style={{ color: C.soft, fontSize: 14, marginTop: 16 }}>{hint}</p>}
        {note && (
          <p style={{ marginTop: 16, padding: 12, borderRadius: 10, fontSize: 14,
                      background: C.card, border: `1px solid ${C.rule}` }}>{note}</p>
        )}

        {/* Health strip. Reachability of each app's admin API is a real signal:
            if this can't talk to an app, that app's admin surface is down. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
                      gap: 12, marginTop: 24 }}>
          {apps.map((a) => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${C.rule}`,
                                     borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99,
                               background: a.ok ? C.mint : C.red,
                               boxShadow: `0 0 8px ${a.ok ? C.mint : C.red}` }} />
                <b style={{ fontFamily: C.serif, fontSize: 18 }}>{a.name}</b>
              </div>
              <p style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: '.1em',
                          textTransform: 'uppercase', color: C.soft, marginTop: 8 }}>
                {a.ok ? `${a.pending.length} pending · ${a.ms}ms` : 'offline'}
              </p>
              {a.error && <p style={{ fontSize: 12.5, color: C.amber, marginTop: 6 }}>{a.error}</p>}
            </div>
          ))}
        </div>

        {apps.filter((a) => a.ok).map((app) => (
          <section key={app.id} style={{ marginTop: 44 }}>
            <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em',
                          textTransform: 'uppercase', color: C.soft,
                          display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: app.accent }}>{app.name}</span> Suggested cards
              <span style={{ flex: 1, height: 1, background: C.rule2 }} />
            </div>

            {app.pending.length === 0 && (
              <p style={{ color: C.soft, fontSize: 14, marginTop: 14 }}>Queue is clear.</p>
            )}

            <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              {app.pending.map((s) => {
                const key = `${app.id}:${s.id}`
                const d = drafts[key]
                if (!d) return null
                const set = (patch: Partial<Draft>) =>
                  setDrafts((all) => ({ ...all, [key]: { ...all[key], ...patch } }))
                const edited = d.text.trim() !== s.message.trim()
                return (
                  <div key={s.id} style={{ background: C.card, border: `1px solid ${C.rule}`,
                                           borderRadius: 14, padding: 18 }}>
                    <p style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: '.08em',
                                color: C.soft }}>
                      {s.player_name || 'anonymous'} · {s.platform ?? '?'} ·{' '}
                      {new Date(s.created_at).toLocaleDateString()}
                      {s.audience ? ` · said: ${s.audience}` : ''}
                    </p>
                    <textarea value={d.text} rows={3}
                      onChange={(e) => set({ text: e.target.value })}
                      style={{ ...input, marginTop: 10, resize: 'vertical' }} />
                    {edited && (
                      <p style={{ fontSize: 12, color: C.soft, marginTop: 6 }}>
                        Edited — original: “{s.message}”
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <select value={d.pack} onChange={(e) => set({ pack: e.target.value })}
                        style={{ ...input, flex: 1, minWidth: 130 }}>
                        {PACKS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                      <select value={d.tier} onChange={(e) => set({ tier: e.target.value })}
                        style={{ ...input, flex: 1, minWidth: 110 }}>
                        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={d.format} onChange={(e) => set({ format: e.target.value })}
                        style={{ ...input, flex: 1, minWidth: 110 }}>
                        <option value="vote">vote</option>
                        <option value="action">action</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button style={btn('ghost')}
                        onClick={() => act(app.id, { action: 'reject', feedbackId: s.id })}>
                        Reject
                      </button>
                      <button style={{ ...btn('mint'), flex: 1 }} disabled={!d.text.trim()}
                        onClick={() => act(app.id, { action: 'approve', feedbackId: s.id, ...d })}>
                        {edited ? 'Approve edited' : 'Approve as is'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {app.live.length > 0 && (
              <>
                <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.22em',
                              textTransform: 'uppercase', color: C.soft, marginTop: 30,
                              display: 'flex', alignItems: 'center', gap: 12 }}>
                  Live cards · {app.live.length}
                  <span style={{ flex: 1, height: 1, background: C.rule2 }} />
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                  {app.live.map((c) => (
                    <div key={c.id} style={{ background: C.card2, border: `1px solid ${C.rule}`,
                                             borderRadius: 12, padding: '12px 14px',
                                             display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ flex: 1, fontSize: 14.5, opacity: c.active ? 1 : 0.45 }}>
                        {c.text}
                        <span style={{ display: 'block', fontFamily: C.mono, fontSize: 11,
                                       color: C.soft, marginTop: 3 }}>
                          {c.pack_id} · {c.tier} · {c.format}{c.active ? '' : ' · retired'}
                        </span>
                      </span>
                      {c.active && (
                        <button style={btn('ghost')}
                          onClick={() => act(app.id, { action: 'retire', cardId: c.id })}>
                          Retire
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </main>
  )
}
