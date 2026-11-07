'use client'
import { useMemo, useState } from 'react'
import { AdminShell, C, Label, btn } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, usd, ago, useHousehold, post, input, Empty } from '@/components/household/shared'

// Household → Advisor: run history, the current brief, action cards with
// Mark done / Dismiss, the Ask box, and "What it looked at" (the snapshot).
// Advice only — the household places every trade themselves.

type Run = { id: string; kind: 'weekly' | 'on_demand' | 'question'; question: string | null; output_md: string; output: { summary_md?: string; answer_md?: string; risks?: string[]; questions_for_you?: string[] } | null; model: string; input_tokens: number | null; output_tokens: number | null; created_at: string }
type Action = { id: string; run_id: string; kind: string; ticker: string | null; account_id: string | null; amount_cents: number | null; title: string; rationale: string; urgency: string | null; confidence: string | null; status: 'open' | 'done' | 'dismissed'; decided_at: string | null; run: { created_at: string; kind: string } | null }
type Data = { runs: Run[]; actions: Action[]; configured: boolean; model: string }

const KIND_LABEL: Record<string, string> = { weekly: 'Weekly brief', on_demand: 'Brief', question: 'Question' }
const URGENCY: Record<string, { label: string; tone: 'loss' | 'amber' | 'neutral' | 'teal' }> = { now: { label: 'now', tone: 'loss' }, this_week: { label: 'this week', tone: 'amber' }, this_month: { label: 'this month', tone: 'neutral' }, someday: { label: 'someday', tone: 'neutral' } }

/** Tiny markdown: headings, bullets, bold, paragraphs. Enough for the brief. */
function Md({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))
  return (
    <div style={{ fontSize: 14.5, lineHeight: 1.6, color: C.ink }}>
      {blocks.map((b, i) => {
        if (/^#{1,3}\s/.test(b)) return <h3 key={i} style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 4px', letterSpacing: '-.01em' }}>{b.replace(/^#+\s*/, '')}</h3>
        if (/^(-|\d+\.)\s/m.test(b)) return <ul key={i} style={{ margin: '4px 0', paddingLeft: 20 }}>{b.split('\n').filter(Boolean).map((l, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(l.replace(/^(-|\d+\.)\s*/, ''))}</li>)}</ul>
        return <p key={i} style={{ margin: '6px 0' }}>{inline(b)}</p>
      })}
    </div>
  )
}

export default function HouseholdAdvisor() {
  const { data: d, updating, error, reload } = useHousehold<Data>('/api/household/advisor')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{ id: string; data: unknown } | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const run = useMemo(() => d?.runs.find((r) => r.id === (selected ?? d.runs[0]?.id)) ?? null, [d, selected])
  const actions = useMemo(() => (d?.actions ?? []).filter((a) => a.run_id === run?.id), [d, run])
  const openElsewhere = useMemo(() => (d?.actions ?? []).filter((a) => a.status === 'open' && a.run_id !== run?.id), [d, run])

  async function brief(kind: 'on_demand' | 'question') {
    setBusy(kind); setMsg(null)
    try {
      const r = await post('/api/household/advisor', kind === 'question' ? { kind, question } : { kind })
      setMsg({ text: `Brief ready · ${r.output?.actions?.length ?? 0} actions.` }); setQuestion(''); setSelected(r.id); await reload()
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(null)
  }
  async function decide(a: Action, status: 'done' | 'dismissed' | 'open') {
    setBusy(a.id)
    try { await post('/api/household/advisor', { id: a.id, status }, 'PATCH'); await reload() } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(null)
  }
  async function lookedAt() {
    if (!run) return
    if (snapshot?.id === run.id) { setSnapshot(null); return }
    const r = await fetch(`/api/household/advisor?run=${run.id}`).then((r) => r.json()).catch(() => null)
    if (r?.run) setSnapshot({ id: run.id, data: r.run.input_snapshot })
  }

  const ActionCard = ({ a, dim }: { a: Action; dim?: boolean }) => (
    <div data-card style={{ ...card, padding: '14px 16px', borderRadius: 12, opacity: dim ? 0.7 : 1, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill tone={a.status === 'done' ? 'teal' : a.status === 'dismissed' ? 'neutral' : URGENCY[a.urgency ?? 'this_month']?.tone ?? 'neutral'}>{a.status === 'open' ? URGENCY[a.urgency ?? 'this_month']?.label ?? a.urgency : a.status}</Pill>
        <Pill>{a.kind.replace('_', ' ')}</Pill>
        {a.ticker && <a href={`/household/holdings`} style={{ fontFamily: C.mono, fontSize: 12.5, color: C.teal, textDecoration: 'none' }}>{a.ticker}</a>}
        {a.amount_cents != null && <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{usd(a.amount_cents)}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.soft }}>{a.confidence} confidence{a.run && a.run_id !== run?.id ? ` · from ${ago(a.run.created_at)}` : ''}</span>
      </div>
      <div style={{ fontWeight: 650, fontSize: 15 }}>{a.title}</div>
      <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.55 }}>{a.rationale}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {a.status === 'open' ? (<>
          <button style={{ ...btn('ghost'), padding: '7px 12px' }} disabled={busy === a.id} onClick={() => decide(a, 'done')}>Mark done</button>
          <button style={{ ...btn('ghost'), padding: '7px 12px', color: C.soft }} disabled={busy === a.id} onClick={() => decide(a, 'dismissed')}>Dismiss</button>
        </>) : (
          <button style={{ ...btn('ghost'), padding: '7px 12px', color: C.soft }} disabled={busy === a.id} onClick={() => decide(a, 'open')}>Reopen</button>
        )}
      </div>
    </div>
  )

  return (
    <AdminShell title="Household · Advisor" subtitle="Claude reads the whole picture and says what to do. You decide, and you place every trade yourselves."
      actions={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{updating && <Pill>Updating…</Pill>}<button style={btn('mint')} disabled={!!busy || d?.configured === false} onClick={() => brief('on_demand')}>{busy === 'on_demand' ? 'Thinking…' : 'Brief me now'}</button></span>}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {msg && <p style={{ color: msg.bad ? C.red : C.mint, margin: 0, fontSize: 13.5 }}>{msg.text}</p>}
      {d && !d.configured && <div style={{ ...card, borderColor: '#F3C9A8', background: '#FFF7F0', fontSize: 14 }}>The advisor needs <code style={{ fontFamily: C.mono }}>ANTHROPIC_API_KEY</code> on Vercel before it can write a brief.</div>}

      {/* Ask */}
      <div data-card style={{ ...card, display: 'grid', gap: 10 }}>
        <Label>Ask about your money</Label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: 1, minWidth: 240 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Should we sell NVDA to fund the kitchen?" onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) brief('question') }} />
          <button style={btn('ghost')} disabled={!!busy || !question.trim() || d?.configured === false} onClick={() => brief('question')}>{busy === 'question' ? 'Thinking…' : 'Ask'}</button>
        </div>
        <div style={{ fontSize: 12.5, color: C.soft }}>Answers use the same snapshot as a brief — balances, holdings, prices, cash flow, taxes and your notes. Takes 20–60 seconds.</div>
      </div>

      {d && d.runs.length === 0 && (
        <Empty title="No brief yet">Press &ldquo;Brief me now&rdquo; for the first one. The weekly brief then runs on the schedule in Settings (Monday 07:00 Central by default).</Empty>
      )}

      {run && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <div data-card style={card}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
                <Label>{KIND_LABEL[run.kind]}</Label>
                <span style={{ fontSize: 12.5, color: C.soft }}>{ago(run.created_at)} · {run.model}{run.input_tokens ? ` · ${((run.input_tokens + (run.output_tokens ?? 0)) / 1000).toFixed(0)}k tokens` : ''}</span>
                <button style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 12.5, marginLeft: 'auto' }} onClick={lookedAt}>{snapshot?.id === run.id ? 'Hide what it looked at' : 'What it looked at'}</button>
              </div>
              {run.question && <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 650 }}>“{run.question}”</p>}
              <Md text={run.output_md} />
            </div>
            {snapshot?.id === run.id && (
              <div data-card style={card}>
                <Label>Input snapshot (stored with the run, so the advice is reproducible)</Label>
                <pre style={{ fontFamily: C.mono, fontSize: 11.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0 0', color: C.ink2, maxHeight: 520, overflow: 'auto' }}>{JSON.stringify(snapshot.data, null, 2)}</pre>
              </div>
            )}

            <Label>Actions from this brief</Label>
            {actions.filter((a) => a.status === 'open').map((a) => <ActionCard key={a.id} a={a} />)}
            {actions.filter((a) => a.status === 'open').length === 0 && <div style={{ fontSize: 13.5, color: C.soft }}>Nothing open from this brief.</div>}
            {actions.some((a) => a.status !== 'open') && (
              <button style={{ ...btn('ghost'), justifySelf: 'start' }} onClick={() => setShowDecided((v) => !v)}>{showDecided ? 'Hide' : 'Show'} {actions.filter((a) => a.status !== 'open').length} decided</button>
            )}
            {showDecided && actions.filter((a) => a.status !== 'open').map((a) => <ActionCard key={a.id} a={a} dim />)}

            {openElsewhere.length > 0 && (<>
              <Label>Still open from earlier briefs</Label>
              {openElsewhere.map((a) => <ActionCard key={a.id} a={a} />)}
            </>)}
          </div>

          <div data-card style={{ ...card, padding: '12px 8px' }}>
            <div style={{ padding: '0 10px 6px' }}><Label>History</Label></div>
            {d!.runs.map((r) => {
              const on = r.id === run.id
              const n = d!.actions.filter((a) => a.run_id === r.id && a.status === 'open').length
              return (
                <button key={r.id} onClick={() => { setSelected(r.id); setSnapshot(null) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: on ? C.card2 : 'transparent', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', fontFamily: C.sans }}>
                  <div style={{ fontSize: 13.5, fontWeight: on ? 700 : 600, color: C.ink }}>{KIND_LABEL[r.kind]}{n ? <span style={{ color: C.teal, fontWeight: 600 }}> · {n} open</span> : null}</div>
                  <div style={{ fontSize: 12, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ago(r.created_at)}{r.question ? ` · ${r.question}` : ''}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <p style={{ color: C.soft, fontSize: 12.5, margin: 0 }}>Not a licensed adviser. Every brief stores the exact inputs it saw. Nothing here can move money or place a trade; Plaid access is read-only.</p>
    </AdminShell>
  )
}
