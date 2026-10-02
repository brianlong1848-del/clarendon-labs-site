'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { PlatformGlyph } from '@/components/post/shared'
import type { InboxItem, SourceStatus } from '@/lib/inbox/types'

// ─── /inbox — every message, comment, review and suggestion, one place ──────
//
// Views on the left, the stream in the middle, the conversation on the right.
// Reply, hide, approve, snooze or mark done without leaving the page. Same
// data and actions as the Studio iOS Inbox (both use /api/inbox). Sources
// that aren't connected yet are listed under "Sources" with the fix.
//
// Keys: j/k move · e done · r reply · ⌘↵ send

type View = 'needs' | 'open' | 'done' | 'snoozed'
type Kind = 'all' | InboxItem['kind']

const APPS: Record<string, { name: string; icon: string }> = {
  rolligan: { name: 'Rolligan', icon: '/icons/rolligan.png' },
  gagorder: { name: 'Gag Order', icon: '/icons/gagorder.png' },
  yulepick: { name: 'YulePick', icon: '/icons/yulepick.png' },
  borea: { name: 'Borea', icon: '/icons/borea.png' },
}
const SOURCE_NAME: Record<string, string> = {
  instagram_dm: 'Instagram DM', instagram_comment: 'Instagram comment', facebook_message: 'Messenger',
  facebook_comment: 'Facebook comment', appstore_review: 'App Store review', app_admin: 'In-app', app_feedback: 'In-app feedback',
  threads_reply: 'Threads', tiktok_comment: 'TikTok', support_email: 'Email',
}
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'message', label: 'Messages' }, { id: 'comment', label: 'Comments' },
  { id: 'review', label: 'Reviews' }, { id: 'suggestion', label: 'Suggestions' }, { id: 'feedback', label: 'Feedback' },
]

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SourceMark({ source, size = 16 }: { source: string; size?: number }) {
  if (source.startsWith('instagram')) return <PlatformGlyph platform="instagram" size={size} />
  if (source.startsWith('facebook')) return <PlatformGlyph platform="facebook" size={size} />
  if (source === 'threads_reply') return <PlatformGlyph platform="threads" size={size} />
  if (source === 'tiktok_comment') return <PlatformGlyph platform="tiktok" size={size} />
  const d = source === 'appstore_review'
    ? 'M12 3 9 9H3l5 4-2 7 6-4 6 4-2-7 5-4h-6z'
    : source === 'support_email' ? 'M3 6h18v12H3zM3 7l9 6 9-6' : 'M4 5h16v11H8l-4 4z'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth="2" strokeLinejoin="round"><path d={d} /></svg>
}

const Stars = ({ n }: { n: number }) => <span aria-label={`${n} stars`} style={{ color: '#D99A1E', letterSpacing: 1, fontSize: 12 }}>{'★'.repeat(n)}<span style={{ color: C.faint }}>{'★'.repeat(5 - n)}</span></span>

export default function InboxPage() {
  const [pw, setPw] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [view, setView] = useState<View>('needs')
  const [kind, setKind] = useState<Kind>('all')
  const [app, setApp] = useState<string | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)

  useEffect(() => { setPw('session') }, [])

  const load = useCallback(async (force = false) => {
    if (!pw) return
    setLoading(true)
    const res = await fetch(`/api/inbox${force ? '?refresh=1' : ''}`, { headers: {} }).catch(() => null)
    setLoading(false)
    if (!res) { setError('Could not reach clarendon.dev.'); return }
    if (res.status === 401) { (window.location.href = '/login'); setPw(''); return }
    const body = await res.json()
    setItems(body.items); setSources(body.sources); setFetchedAt(body.fetchedAt); setError(null)
  }, [pw])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => load(), 60_000); return () => clearInterval(t) }, [load])

  const act = useCallback(async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch('/api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...payload }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? 'Something went wrong.')
    // Optimistic local state so the list reacts instantly.
    setItems((xs) => xs?.map((x) => x.id !== id ? x : {
      ...x, needsReply: action === 'reply' ? false : x.needsReply,
      thread: action === 'reply' ? [...x.thread, { from: 'us', text: String(payload.text), at: new Date().toISOString() }] : x.thread,
      state: { ...x.state,
        status: action === 'reopen' ? 'open' : ['done', 'reply', 'approve', 'reject'].includes(action) ? 'done' : x.state.status,
        read: true, snoozedUntil: action === 'snooze' ? String(payload.until) : x.state.snoozedUntil },
      actions: action === 'hide' ? x.actions.map((a) => a === 'hide' ? 'unhide' : a) : action === 'unhide' ? x.actions.map((a) => a === 'unhide' ? 'hide' : a) : x.actions,
    }) ?? null)
  }, [pw])

  const inView = useCallback((x: InboxItem) => {
    if (app !== 'all' && x.app !== app) return false
    if (kind !== 'all' && x.kind !== kind) return false
    const snoozed = !!x.state.snoozedUntil
    if (view === 'snoozed') return snoozed
    if (snoozed) return false
    if (view === 'done') return x.state.status === 'done'
    if (x.state.status === 'done') return false
    return view === 'needs' ? x.needsReply : true
  }, [app, kind, view])

  const list = useMemo(() => (items ?? []).filter(inView), [items, inView])
  const current = list.find((x) => x.id === selected) ?? null
  const count = (f: (x: InboxItem) => boolean) => (items ?? []).filter((x) => !x.state.snoozedUntil && x.state.status === 'open' && f(x)).length
  const missing = sources.filter((s) => !s.connected)

  useEffect(() => { if (!current && list[0]) setSelected(list[0].id) }, [current, list])
  useEffect(() => { if (current && !current.state.read) act(current.id, 'read').catch(() => {}) }, [current, act])

  // Keyboard triage.
  const replyRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT'
      if (typing) return
      const i = list.findIndex((x) => x.id === selected)
      if (e.key === 'j' && list[i + 1]) setSelected(list[i + 1].id)
      if (e.key === 'k' && i > 0) setSelected(list[i - 1].id)
      if (e.key === 'e' && current) act(current.id, current.state.status === 'done' ? 'reopen' : 'done').catch(() => {})
      if (e.key === 'r' && replyRef.current) { e.preventDefault(); replyRef.current.focus() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [list, selected, current, act])

  if (pw === null) return null
  if (!pw) {
    return (
      <main style={{ background: C.paper, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: C.sans }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h1 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 900, margin: '0 0 22px' }}>Inbox</h1>
          <input type="password" placeholder="Password" value={entry} onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && entry) { sessionStorage.setItem('clarendon:console', entry); setPw(entry) } }}
            style={{ background: C.card2, border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box' }} />
          <button style={{ ...btn('mint'), width: '100%', marginTop: 12 }} disabled={!entry} onClick={() => { sessionStorage.setItem('clarendon:console', entry); setPw(entry) }}>Sign in</button>
        </div>
      </main>
    )
  }

  const railBtn = (active: boolean, onClick: () => void, children: React.ReactNode, n?: number) => (
    <button onClick={onClick} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9,
      fontSize: 13.5, fontWeight: active ? 800 : 600, color: active ? C.ink : C.ink2, background: active ? C.mintTint : 'transparent' }}>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>{children}</span>
      {n ? <span style={{ fontSize: 11.5, fontWeight: 800, color: active ? C.mint : C.soft }}>{n}</span> : null}
    </button>
  )
  const railLabel = (t: string) => <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint, margin: '14px 10px 4px' }}>{t}</div>

  return (
    <AdminShell
      title="Inbox"
      subtitle="Messages, comments, reviews and suggestions from every app and platform."
      actions={<>
        <span style={{ fontSize: 12, color: C.soft }}>{loading ? 'Refreshing…' : fetchedAt ? `Updated ${ago(fetchedAt)} ago` : ''}</span>
        <button style={btn('ghost')} onClick={() => setShowSources(true)}>
          Sources{missing.length ? <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 800, color: C.amber }}>{missing.length} to set up</span> : null}
        </button>
        <button style={btn('ghost')} onClick={() => load(true)}>Refresh</button>
      </>}
    >
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      <div className="inbox-grid" style={{ display: 'grid', gridTemplateColumns: '200px 360px minmax(0,1fr)', gap: 16, alignItems: 'start', minHeight: 'calc(100dvh - 190px)' }}>
        {/* Rail */}
        <nav style={{ display: 'grid', gap: 2, position: 'sticky', top: 24 }}>
          {railLabel('Views')}
          {railBtn(view === 'needs', () => setView('needs'), 'Needs reply', count((x) => x.needsReply))}
          {railBtn(view === 'open', () => setView('open'), 'All open', count(() => true))}
          {railBtn(view === 'snoozed', () => setView('snoozed'), 'Snoozed', (items ?? []).filter((x) => x.state.snoozedUntil).length)}
          {railBtn(view === 'done', () => setView('done'), 'Done')}
          {railLabel('Type')}
          {KINDS.map((k) => railBtn(kind === k.id, () => setKind(k.id), k.label, k.id === 'all' ? undefined : count((x) => x.kind === k.id)))}
          {railLabel('App')}
          {railBtn(app === 'all', () => setApp('all'), 'All apps')}
          {Object.entries(APPS).map(([id, a]) => railBtn(app === id, () => setApp(id), <><img src={a.icon} alt="" width={18} height={18} style={{ borderRadius: 5 }} />{a.name}</>, count((x) => x.app === id)))}
        </nav>

        {/* List */}
        <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, overflow: 'hidden' }}>
          {!items ? <p style={{ padding: 20, color: C.soft }}>Gathering everything…</p>
            : list.length === 0 ? (
              <div style={{ padding: '40px 22px', textAlign: 'center', color: C.soft, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 30 }}>✓</div>
                <b style={{ color: C.ink }}>{view === 'needs' ? 'Nothing waiting on you.' : 'Nothing here.'}</b>
                {missing.length > 0 && <button onClick={() => setShowSources(true)} style={{ all: 'unset', cursor: 'pointer', color: C.mint, fontWeight: 700, fontSize: 13 }}>{missing.length} sources still to connect →</button>}
              </div>
            ) : list.map((x) => {
              const active = x.id === selected
              return (
                <button key={x.id} onClick={() => setSelected(x.id)}
                  style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '38px 1fr', gap: 11, padding: '13px 14px', width: '100%', boxSizing: 'border-box',
                           borderBottom: `1px solid ${C.rule}`, background: active ? C.mintTint : 'transparent', borderLeft: `3px solid ${active ? C.mint : 'transparent'}` }}>
                  <div style={{ position: 'relative', width: 38, height: 38 }}>
                    {x.author.avatar ? <img src={x.author.avatar} alt="" width={38} height={38} style={{ borderRadius: 99 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: 99, background: C.card2, display: 'grid', placeItems: 'center', fontWeight: 800, color: C.ink2 }}>{x.author.name.slice(0, 1).toUpperCase()}</div>}
                    <span style={{ position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 99, background: C.card, display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}><SourceMark source={x.source} size={12} /></span>
                  </div>
                  <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!x.state.read && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.mint, flexShrink: 0 }} />}
                      <b style={{ fontSize: 13.5, fontWeight: x.state.read ? 600 : 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.author.name}</b>
                      <span style={{ flex: 1 }} />
                      <img src={APPS[x.app]?.icon} alt={APPS[x.app]?.name} width={16} height={16} style={{ borderRadius: 4 }} />
                      <span style={{ fontSize: 11.5, color: C.soft }}>{ago(x.at)}</span>
                    </div>
                    {x.rating ? <Stars n={x.rating} /> : null}
                    <span style={{ fontSize: 13, color: C.ink2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.title && x.kind === 'review' ? <b>{x.title} · </b> : null}{x.text}</span>
                    <span style={{ fontSize: 11.5, color: C.soft }}>{SOURCE_NAME[x.source]}{x.context ? ` · ${x.context.label}` : ''}</span>
                  </div>
                </button>
              )
            })}
        </section>

        {/* Detail */}
        {current ? <Detail key={current.id} item={current} act={act} replyRef={replyRef} /> : <div />}
      </div>

      {showSources && <Sources sources={sources} onClose={() => setShowSources(false)} />}
      <style>{`@media (max-width: 1200px){ .inbox-grid{ grid-template-columns: 1fr !important } .inbox-grid nav{ position: static !important; display: flex !important; flex-wrap: wrap } }`}</style>
    </AdminShell>
  )
}

function Detail({ item, act, replyRef }: { item: InboxItem; act: (id: string, action: string, payload?: Record<string, unknown>) => Promise<void>; replyRef: React.RefObject<HTMLTextAreaElement> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [card, setCard] = useState({ text: String(item.meta?.cardText ?? item.title ?? item.text), pack: 'base', tier: 'free', format: 'vote' })
  const threadEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }) }, [item.thread.length])

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action); setError(null)
    try { await act(item.id, action, payload); if (action === 'reply') setText('') } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }
  const canReply = item.actions.includes('reply')
  const over = item.replyLimit ? text.length > item.replyLimit : false
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString() }
  const nextWeek = () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.toISOString() }
  const app = APPS[item.app]

  return (
    <article style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 16, display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 520, position: 'sticky', top: 24, maxHeight: 'calc(100dvh - 60px)' }}>
      <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SourceMark source={item.source} size={20} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{item.author.name}{item.author.handle && item.author.handle !== item.author.name ? <span style={{ color: C.soft, fontWeight: 500 }}> @{item.author.handle}</span> : null}</div>
          <div style={{ fontSize: 12.5, color: C.soft, display: 'flex', gap: 6, alignItems: 'center' }}>
            {app && <img src={app.icon} alt="" width={14} height={14} style={{ borderRadius: 3 }} />}{app?.name} · {SOURCE_NAME[item.source]} · {new Date(item.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none', fontSize: 13 }}>Open ↗</a>}
        {item.actions.includes('hide') && <button style={btn('ghost')} disabled={!!busy} onClick={() => run('hide')}>Hide</button>}
        {item.actions.includes('unhide') && <button style={btn('ghost')} disabled={!!busy} onClick={() => run('unhide')}>Unhide</button>}
        <button style={btn('ghost')} disabled={!!busy} onClick={() => run('snooze', { until: tomorrow() })} title="Snooze until tomorrow 9am">Tomorrow</button>
        <button style={btn('ghost')} disabled={!!busy} onClick={() => run('snooze', { until: nextWeek() })} title="Snooze a week">Next week</button>
        <button style={btn(item.state.status === 'done' ? 'ghost' : 'solid')} disabled={!!busy} onClick={() => run(item.state.status === 'done' ? 'reopen' : 'done')}>
          {item.state.status === 'done' ? 'Reopen' : 'Done  e'}
        </button>
      </header>

      <div style={{ overflowY: 'auto', padding: 20, display: 'grid', gap: 12, alignContent: 'start', background: C.paper }}>
        {item.context && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, background: C.card, borderRadius: 12, border: `1px solid ${C.rule}` }}>
            {item.context.thumb && <img src={item.context.thumb} alt="" width={48} height={48} style={{ borderRadius: 8, objectFit: 'cover' }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.soft }}>{item.context.label}</div>
              {item.context.text && <div style={{ fontSize: 13, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.context.text}</div>}
            </div>
          </div>
        )}
        {item.rating ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Stars n={item.rating} />{item.title && <b>{item.title}</b>}</div> : null}
        {item.thread.map((t, i) => (
          <div key={i} style={{ justifySelf: t.from === 'us' ? 'end' : 'start', maxWidth: '78%' }}>
            <div style={{ padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                          background: t.from === 'us' ? C.mint : C.card, color: t.from === 'us' ? '#fff' : C.ink,
                          border: t.from === 'us' ? 'none' : `1px solid ${C.rule}`,
                          borderBottomRightRadius: t.from === 'us' ? 4 : 16, borderBottomLeftRadius: t.from === 'us' ? 16 : 4 }}>{t.text}</div>
            <div style={{ fontSize: 11, color: C.soft, marginTop: 3, textAlign: t.from === 'us' ? 'right' : 'left' }}>{t.from === 'us' ? 'You' : t.name ?? item.author.name} · {ago(t.at)}</div>
          </div>
        ))}
        <div ref={threadEnd} />
      </div>

      <footer style={{ padding: 16, borderTop: `1px solid ${C.rule}`, display: 'grid', gap: 10 }}>
        {error && <span style={{ color: C.red, fontSize: 13 }}>{error}</span>}
        {item.actions.includes('approve') ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <textarea value={card.text} onChange={(e) => setCard({ ...card, text: e.target.value })} rows={2} aria-label="Card text"
              style={{ border: `1px solid ${C.rule2}`, borderRadius: 10, padding: '10px 12px', fontFamily: C.sans, fontSize: 14.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={card.format} onChange={(e) => setCard({ ...card, format: e.target.value })} style={{ padding: 8, borderRadius: 8, border: `1px solid ${C.rule2}` }}><option value="vote">Vote card</option><option value="action">Action card</option></select>
              <select value={card.tier} onChange={(e) => setCard({ ...card, tier: e.target.value })} style={{ padding: 8, borderRadius: 8, border: `1px solid ${C.rule2}` }}><option value="free">Free</option><option value="core">Core</option><option value="afterdark">After Dark</option></select>
              <input value={card.pack} onChange={(e) => setCard({ ...card, pack: e.target.value })} aria-label="Pack" placeholder="pack" style={{ padding: 8, borderRadius: 8, border: `1px solid ${C.rule2}`, width: 110 }} />
              <span style={{ flex: 1 }} />
              <button style={btn('ghost')} disabled={!!busy} onClick={() => run('reject')}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>
              <button style={btn('mint')} disabled={!!busy || !card.text.trim()} onClick={() => run('approve', card)}>{busy === 'approve' ? 'Publishing…' : 'Approve & publish'}</button>
            </div>
          </div>
        ) : canReply ? (
          <>
            <textarea ref={replyRef} value={text} onChange={(e) => setText(e.target.value)} rows={3}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim() && !over) run('reply', { text }) }}
              placeholder={item.kind === 'review' ? 'Write a public response…' : `Reply to ${item.author.name}…`}
              style={{ border: `1px solid ${C.rule2}`, borderRadius: 12, padding: '11px 13px', fontFamily: C.sans, fontSize: 14.5, resize: 'vertical', outline: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: C.soft, flex: 1 }}>{item.replyNote ?? (item.kind === 'comment' ? 'Replies publicly under their comment.' : '')}</span>
              {item.replyLimit && <span style={{ fontSize: 12, color: over ? C.red : C.soft }}>{text.length}/{item.replyLimit}</span>}
              <button style={btn('mint')} disabled={!text.trim() || over || !!busy} onClick={() => run('reply', { text })}>{busy === 'reply' ? 'Sending…' : 'Send  ⌘↵'}</button>
            </div>
          </>
        ) : <span style={{ fontSize: 13, color: C.soft }}>{item.replyNote ?? 'Replying isn’t available for this one.'}{item.url ? ' Use Open ↗ to answer on the platform.' : ''}</span>}
      </footer>
    </article>
  )
}

function Sources({ sources, onClose }: { sources: SourceStatus[]; onClose: () => void }) {
  const groups = new Map<string, SourceStatus[]>()
  for (const s of sources) groups.set(s.label, [...(groups.get(s.label) ?? []), s])
  return (
    <div role="dialog" aria-label="Sources" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.35)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '85dvh', overflowY: 'auto', padding: 24, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 900, margin: 0, flex: 1 }}>Sources</h2>
          <button style={btn('ghost')} onClick={onClose}>Close</button>
        </div>
        <p style={{ margin: 0, color: C.ink2, fontSize: 14 }}>Everything the inbox can pull from, per app. Anything not connected says exactly what it needs.</p>
        {Array.from(groups.entries()).map(([label, rows]) => (
          <section key={label} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SourceMark source={rows[0].source} /><b>{label}</b></div>
            {rows.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, fontSize: 13, padding: '8px 12px', borderRadius: 10, background: C.card2 }}>
                <span style={{ display: 'flex', gap: 7, alignItems: 'center', fontWeight: 700 }}>
                  {s.app && APPS[s.app] ? <><img src={APPS[s.app].icon} alt="" width={16} height={16} style={{ borderRadius: 4 }} />{APPS[s.app].name}</> : 'All apps'}
                </span>
                <span style={{ color: s.connected ? C.mint : C.ink2 }}>{s.connected ? `Connected · ${s.count} recent` : s.reason}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
