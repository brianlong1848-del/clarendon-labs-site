'use client'
import { useCallback, useEffect, useState } from 'react'
import { AppTag, C, Label, btn, labelStyle } from '@/components/AdminNav'
import { PlatformGlyph } from '@/components/post/shared'

// ─── Ad insights (FEAT-CLA-023) ──────────────────────────────────────────────
//
// "This week": 3–5 ranked actions from the rules engine, Claude's summary and
// ideas, with a button (and a confirm step) on every action that changes an
// ad. Nothing changes spend by itself. VerdictPill + WhyNext go on each
// Campaigns row. Reads /api/ads/insights; one Claude write-up a day, app and
// range — Regenerate asks for a new one.

export type Verdict = 'too_early' | 'winning' | 'ok' | 'needs_work'
export type Stage = 'hook' | 'hold' | 'click' | 'cost' | 'install' | 'fatigue'
export type Insight = {
  verdict: Verdict; reason: string; weakest?: Stage; objective_kind: 'views' | 'traffic' | 'installs'
  grades: Partial<Record<Stage, 'good' | 'ok' | 'poor'>>
  metrics: { spend_cents: number; impressions?: number; hook_rate?: number; hold_rate?: number; ctr?: number; cpc_cents?: number; cpm_cents?: number; cost_per_view15_cents?: number; follows_per_dollar?: number; frequency?: number; installs?: number; cpi_cents?: number; est_roas?: number; trend?: { ctr_change?: number; frequency_change?: number; days: number; fatigue: boolean } }
}
export type InsightAction = {
  id: string; kind: 'pause' | 'resume' | 'raise_budget' | 'lower_budget' | 'duplicate_traffic' | 'creative' | 'wait'
  platform: 'tiktok' | 'meta'; campaign_id: string; app_id: string | null; campaign_name: string; promotion_id?: string
  title: string; detail: string; button?: string; confirm?: string; amount_cents?: number; blocked?: string; score: number
}
export type InsightsPayload = {
  day: string; range: string; app: string
  campaigns: { platform: 'tiktok' | 'meta'; campaign_id: string; app_id: string | null; name: string; status?: string; insight: Insight; ads: { ad_id: string; name: string; insight: Insight }[]; narrative?: { why: string; try_next: string } }[]
  actions: InsightAction[]
  summary?: string; ideas: { app_id?: string; title: string; detail: string }[]; model?: string; generated_at?: string
  installs_visible: boolean; errors: string[]
}

export const VERDICT: Record<Verdict, { text: string; color: string; bg: string }> = {
  winning: { text: 'Winning', color: C.teal, bg: C.mintTint },
  ok: { text: 'OK', color: C.ink2, bg: C.card2 },
  needs_work: { text: 'Needs work', color: C.loss, bg: '#FBEDE6' },
  too_early: { text: 'Too early', color: C.soft, bg: C.card2 },
}
const STAGE: Record<Stage, string> = { hook: 'hook', hold: 'hold', click: 'click', cost: 'cost', install: 'install', fatigue: 'fatigue' }

export function VerdictPill({ insight, size = 11.5 }: { insight?: Insight; size?: number }) {
  if (!insight) return null
  const v = VERDICT[insight.verdict]
  const showStage = !!insight.weakest && (insight.verdict === 'needs_work' || insight.verdict === 'ok')
  const tip = `${v.text}${showStage ? ` · weakest: ${STAGE[insight.weakest!]}` : ''} — ${insight.reason}`
  return <span title={tip} aria-label={tip} style={{ fontSize: size, fontWeight: 800, color: v.color, background: v.bg, borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap', cursor: 'help' }}>{v.text}{showStage ? <span style={{ fontWeight: 600, opacity: 0.8 }}> · {STAGE[insight.weakest!]}</span> : null}</span>
}

/** The expandable "Why / Try next" under a campaign row. */
export function WhyNext({ insight, narrative }: { insight?: Insight; narrative?: { why: string; try_next: string } }) {
  const [open, setOpen] = useState(false)
  if (!insight) return null
  const m = insight.metrics
  const usd = (c?: number) => c == null ? '—' : `$${(c / 100).toFixed(2)}`
  const rate = (v?: number) => v == null ? '—' : `${Math.round(v * 100)}%`
  const stages: [string, string | undefined, string | undefined][] = [
    ['Hook', rate(m.hook_rate), insight.grades.hook], ['Hold', rate(m.hold_rate), insight.grades.hold], ['CTR', m.ctr == null ? '—' : `${m.ctr.toFixed(2)}%`, insight.grades.click],
    [insight.objective_kind === 'views' ? 'Per 15-s view' : 'CPC', insight.objective_kind === 'views' ? usd(m.cost_per_view15_cents ?? m.cpm_cents) : usd(m.cpc_cents), insight.grades.cost],
    ['Frequency', m.frequency == null ? '—' : `${m.frequency.toFixed(1)}×`, insight.grades.fatigue],
    ['CPI', m.cpi_cents == null ? (m.installs ? String(m.installs) : 'not visible') : usd(m.cpi_cents), insight.grades.install],
  ]
  const gcolor = (g?: string) => g === 'good' ? C.teal : g === 'poor' ? C.loss : C.ink2
  return (
    <div style={{ margin: '0 10px 8px 33px', fontSize: 12.5 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, color: C.teal }}>
        {open ? 'Hide why' : 'Why / Try next'}
      </button>
      {open && (
        <div style={{ marginTop: 6, background: C.card2, borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {stages.map(([k, v, g]) => <span key={k} style={{ color: C.soft }}>{k} <b style={{ color: gcolor(g), fontVariantNumeric: 'tabular-nums' }}>{v}</b></span>)}
          </div>
          <p style={{ margin: 0, color: C.ink }}><b>Why.</b> {narrative?.why || insight.reason}</p>
          {narrative?.try_next && <p style={{ margin: 0, color: C.ink }}><b>Try next.</b> {narrative.try_next}</p>}
          {!narrative && <p style={{ margin: 0, color: C.soft }}>Claude’s write-up arrives with the day’s first load of the This week card.</p>}
        </div>
      )}
    </div>
  )
}

/** The card at the top of /analytics and Money → Ads. */
export function ThisWeek({ app = 'all', range = '30d' }: { app?: string; range?: '7d' | '30d' | '90d' }) {
  const [data, setData] = useState<InsightsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, { ok: boolean; text: string }>>({})
  const key = `insights:${app}:${range}`

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/ads/insights?app=${encodeURIComponent(app)}&range=${range}${fresh ? '&fresh=1' : ''}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setData(body)
      try { localStorage.setItem(key, JSON.stringify(body)) } catch { /* private mode */ }
    } catch (e) { setError((e as Error).message) }
    setLoading(false)
  }, [app, range, key])
  useEffect(() => {
    try { const c = localStorage.getItem(key); if (c) setData(JSON.parse(c)) } catch { /* ignore */ }
    load()
  }, [load, key])

  const run = async (a: InsightAction) => {
    setBusy(a.id); setConfirming(null)
    try {
      const res = await fetch('/api/ads/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id, promotion_id: a.promotion_id, amount_cents: a.amount_cents }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setDone((d) => ({ ...d, [a.id]: { ok: true, text: body.message ?? 'Done.' } }))
    } catch (e) { setDone((d) => ({ ...d, [a.id]: { ok: false, text: (e as Error).message } })) }
    setBusy(null)
  }

  const actions = data?.actions ?? []
  const when = data?.generated_at ? new Date(data.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
  return (
    <section aria-label="This week" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: C.serif, fontSize: 17, fontWeight: 800, margin: 0 }}>This week</h2>
        <span style={{ fontSize: 12.5, color: C.soft }}>{when ? `Write-up ${when}${data?.model ? ` · ${data.model}` : ''}` : ''}{loading && data ? ' · Updating…' : ''}</span>
        <span style={{ flex: 1 }} />
        <button style={{ ...btn('ghost'), padding: '5px 11px', fontSize: 12.5 }} disabled={loading} onClick={() => load(true)} title="Ask Claude for a new write-up and re-read the campaigns">{loading ? 'Working…' : 'Regenerate'}</button>
      </div>
      {error && <p style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
      {data?.errors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: 12.5, color: C.amber }}>{e}</p>)}
      {!data && loading && <div style={{ display: 'grid', gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 44, borderRadius: 12, background: C.card2 }} />)}</div>}
      {data && (
        <>
          {data.summary && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: C.ink }}>{data.summary}</p>}
          {!data.campaigns.length && <p style={{ margin: 0, fontSize: 13.5, color: C.soft }}>No campaigns in this window, so nothing to judge. Boost a post from Post → Queue to start one.</p>}
          {actions.length > 0 && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {actions.map((a, i) => {
                const campaign = data.campaigns.find((c) => c.platform === a.platform && c.campaign_id === a.campaign_id)
                const result = done[a.id]
                return (
                  <li key={a.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 12, alignItems: 'start', padding: '10px 12px', borderRadius: 12, background: C.card2 }}>
                    <span style={{ ...labelStyle, fontSize: 12, paddingTop: 3 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13.5 }}>{a.title}</b>
                        {campaign && <VerdictPill insight={campaign.insight} size={11} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.soft, flexWrap: 'wrap' }}>
                        {a.app_id && <AppTag id={a.app_id} name={a.app_id} size={14} />}
                        <PlatformGlyph platform={a.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={13} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{a.campaign_name}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.ink2 }}>{a.detail}</p>
                      {a.blocked && a.button && !result && <p style={{ margin: 0, fontSize: 12, color: C.amber }}>{a.blocked}</p>}
                      {confirming === a.id && (
                        <div role="alertdialog" aria-label="Confirm" style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: C.card, border: `1px solid ${C.rule2}`, display: 'grid', gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 13 }}>{a.confirm}</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...btn(a.kind === 'pause' ? 'ghost' : 'mint'), padding: '6px 12px', fontSize: 12.5, ...(a.kind === 'pause' ? { color: C.red, borderColor: C.red } : {}) }} onClick={() => run(a)}>{a.button}</button>
                            <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5 }} onClick={() => setConfirming(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {result && <p style={{ margin: 0, fontSize: 12.5, color: result.ok ? C.teal : C.red }}>{result.text}</p>}
                    </div>
                    {a.button && !result?.ok && (
                      <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }} disabled={busy === a.id || confirming === a.id} onClick={() => setConfirming(a.id)}>
                        {busy === a.id ? 'Working…' : a.button}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {data.ideas.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <Label as="span">Ideas</Label>
              {data.ideas.map((i, k) => <p key={k} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}><b>{i.title}.</b> {i.detail}{i.app_id ? <span style={{ color: C.soft }}> · {i.app_id}</span> : null}</p>)}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>
            Verdicts come from the rules engine (objective, our own medians, platform ranges); Claude writes the words and never changes a verdict or invents a number.
            {data.installs_visible ? '' : ' Installs aren’t visible in this view.'} Nothing changes spend without the button and the confirm.
          </p>
        </>
      )}
    </section>
  )
}
