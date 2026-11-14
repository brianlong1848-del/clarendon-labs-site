'use client'
import { useCallback, useEffect, useState } from 'react'
import { AppTag, C, Label, btn, labelStyle } from '@/components/AdminNav'
import { PlatformGlyph } from '@/components/post/shared'
import { AdThumb, type AdThumbMedia } from './AdThumb'
import { appName } from '@/lib/ads/labels'

// ─── Ad insights (FEAT-CLA-023) ──────────────────────────────────────────────
//
// "This week": 3–5 ranked actions from the rules engine, Claude's summary and
// ideas, with a button (and a confirm step) on every action that changes an
// ad. Nothing changes spend by itself. VerdictPill + WhyNext go on each
// Campaigns row. Reads /api/ads/insights; one Claude write-up a day, app and
// range — Regenerate asks for a new one.

export type Verdict = 'too_early' | 'not_delivering' | 'winning' | 'ok' | 'needs_work'
export type Stage = 'hook' | 'hold' | 'click' | 'cost' | 'install' | 'fatigue'
export type Insight = {
  verdict: Verdict; reason: string; weakest?: Stage; objective_kind: 'views' | 'traffic' | 'installs'
  grades: Partial<Record<Stage, 'good' | 'ok' | 'poor'>>
  metrics: { spend_cents: number; impressions?: number; hook_rate?: number; hold_rate?: number; ctr?: number; cpc_cents?: number; cpm_cents?: number; cost_per_view15_cents?: number; follows_per_dollar?: number; frequency?: number; installs?: number; cpi_cents?: number; est_roas?: number; trend?: { ctr_change?: number; frequency_change?: number; days: number; fatigue: boolean } }
}
export type InsightAction = {
  id: string; kind: 'pause' | 'resume' | 'raise_budget' | 'lower_budget' | 'duplicate_as_traffic' | 'reuse_angle' | 'widen_audience' | 'open_in_manager' | 'creative' | 'wait' | 'leave_off' | 'delete_campaign'
  platform: 'tiktok' | 'meta'; campaign_id: string; app_id: string | null; campaign_name: string; promotion_id?: string
  /** Readable label for auto-named campaigns; campaign_name is the raw platform name. */
  campaign_label?: string; ads_state?: 'paused' | 'gated' | 'live'
  advertiser_id?: string; adgroup_ids?: string[]; ad_ids?: string[]; item_id?: string; post_id?: string; manager_url?: string
  title: string; detail: string; button?: string; confirm?: string; confirm_fields?: { budget_cents?: number; pause_original?: boolean }
  amount_cents?: number; href?: string; note?: string; blocked?: string; done?: { at?: string; note: string; label?: string; result_ids?: Record<string, unknown> }; score: number
  /** Claude's plain-words "do this, because" (FEAT-CLA-023 round 2). Absent until the day's write-up lands. */
  say?: string
}
export type InsightsAd = AdThumbMedia & { ad_id: string; name: string; status?: string; spend_cents?: number; impressions?: number; clicks?: number; ctr?: number; insight: Insight }
export type InsightsPayload = {
  day: string; range: string; app: string
  campaigns: { platform: 'tiktok' | 'meta'; campaign_id: string; app_id: string | null; name: string; label?: string; objective?: string; ads_state?: 'paused' | 'gated' | 'live'; status?: string; insight: Insight; media?: AdThumbMedia; ads: InsightsAd[]; narrative?: { why: string; try_next: string } }[]
  /** Chicago day the write-up was written (it can be older than `day`). */
  narrative_day?: string
  actions: InsightAction[]
  headline?: string
  summary?: string; ideas: { app_id?: string; title: string; detail: string }[]; model?: string; generated_at?: string
  installs_visible: boolean; errors: string[]
}

export const VERDICT: Record<Verdict, { text: string; color: string; bg: string }> = {
  winning: { text: 'Winning', color: C.teal, bg: C.mintTint },
  ok: { text: 'OK', color: C.ink2, bg: C.card2 },
  needs_work: { text: 'Needs work', color: C.loss, bg: '#FBEDE6' },
  too_early: { text: 'Too early', color: C.soft, bg: C.card2 },
  not_delivering: { text: 'Not delivering', color: C.amber, bg: '#FBF0DD' },
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
          {!narrative && <p style={{ margin: 0, color: C.soft }}>No write-up for this one yet — press Regenerate on the analyst note.</p>}
        </div>
      )}
    </div>
  )
}

/** One action: title, app, detail, the button (confirm step, duplicate
 *  sheet, link), result / Done. Used by This week and the Console cards. */
/** The first sentence of a paragraph (rail cards say one sentence). */
const firstSentence = (t: string) => (t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t).trim()

export function ActionItem({ a, n, insight, media, compact = false, rail = false, onDone }: { a: InsightAction; n?: number; insight?: Insight; media?: AdThumbMedia; compact?: boolean; rail?: boolean; onDone?: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [sheet, setSheet] = useState<{ budget: string; pause: boolean }>({ budget: String(Math.round((a.confirm_fields?.budget_cents ?? 2000) / 100)), pause: a.confirm_fields?.pause_original !== false })
  const run = async () => {
    setBusy(true); setConfirming(false)
    try {
      const options = a.kind === 'duplicate_as_traffic' ? { budget_cents: Math.round(Number(sheet.budget) * 100) || 2000, pause_original: sheet.pause } : undefined
      const res = await fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id, promotion_id: a.promotion_id, amount_cents: a.amount_cents, options,
          source_ids: { advertiser_id: a.advertiser_id, adgroup_ids: a.adgroup_ids, ad_ids: a.ad_ids, item_id: a.item_id, post_id: a.post_id } }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setResult({ ok: true, text: `${body.message ?? 'Done.'} · Done ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` })
      onDone?.()
    } catch (e) { setResult({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  // The ad itself, big enough to recognise and play (9:16 like the cuts we run).
  // Compact rows (Console, Studio app) keep the small square.
  // No picture to show (TikTok without the Creative scope, a deleted post): no tile and no empty gutter.
  const hasMedia = !!(media && (media.thumbnail_url || media.video_url))
  const tile = !hasMedia || !media ? null
    : rail ? <AdThumb platform={a.platform} campaignId={a.campaign_id} appId={a.app_id} media={media} width={56} height={100} radius={8} />
    : !compact ? <AdThumb platform={a.platform} campaignId={a.campaign_id} appId={a.app_id} media={media} width={92} height={164} radius={12} />
    : <AdThumb platform={a.platform} campaignId={a.campaign_id} appId={a.app_id} media={media} size={44} />
  const label = a.campaign_label ?? a.campaign_name
  const cols = [n != null ? '28px' : null, tile ? 'auto' : null, 'minmax(0,1fr)', 'auto'].filter(Boolean).join(' ')
  const [showNumbers, setShowNumbers] = useState(false)
  return (
    <div onClick={stop} className="adm-action" style={{ display: 'grid', gridTemplateColumns: cols, gap: compact || rail ? 12 : 16, alignItems: 'start', padding: compact ? '8px 10px' : rail ? '12px 12px' : '14px 16px', borderRadius: 14, background: C.card2 }}>
      {n != null && <span style={{ ...labelStyle, fontSize: 12, paddingTop: 3 }}>{n}</span>}
      {tile}
      <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b title={a.campaign_label && a.campaign_label !== a.campaign_name ? `Platform name: ${a.campaign_name}` : undefined} style={{ fontSize: compact ? 13 : 13.5, ...(a.done ? { color: C.soft } : {}) }}>{a.title}</b>
          {insight && <VerdictPill insight={insight} size={11} />}
          {a.done && <span style={{ fontSize: 11.5, fontWeight: 800, color: C.teal, background: C.mintTint, borderRadius: 99, padding: '2px 9px' }}>{a.done.label ?? (a.done.at ? `Done ${new Date(a.done.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ✓` : 'Done ✓')}</span>}
        </div>
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.soft, flexWrap: 'wrap' }}>
            {a.app_id && <AppTag id={a.app_id} name={appName(a.app_id)} size={14} />}
            <PlatformGlyph platform={a.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={13} />
            {!rail && <span title={a.campaign_name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{label}</span>}
          </div>
        )}
        {rail
          ? (
            <>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.ink }}>
                {firstSentence(a.say || a.detail)}{' '}
                <button onClick={() => setShowNumbers((v) => !v)} aria-expanded={showNumbers} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, color: C.teal }}>
                  {showNumbers ? 'Hide the numbers' : 'Show the numbers'}
                </button>
              </p>
              {showNumbers && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.ink2, fontFamily: C.mono }}>{a.say ? `${a.say} ` : ''}{a.detail}</p>}
            </>
          )
          : a.say && !compact
          ? (
            <>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.ink }}>{a.say}</p>
              <button onClick={() => setShowNumbers((v) => !v)} aria-expanded={showNumbers} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, color: C.teal, justifySelf: 'start' }}>
                {showNumbers ? 'Hide the numbers' : 'Show the numbers'}
              </button>
              {showNumbers && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.ink2, fontFamily: C.mono }}>{a.detail}</p>}
            </>
          )
          : <p style={{ margin: 0, fontSize: compact ? 12.5 : 13.5, lineHeight: 1.5, color: C.ink2, ...(compact ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}) }}>{a.detail}</p>}
        {a.done && <p style={{ margin: 0, fontSize: 12.5, color: C.teal }}>{a.done.note}</p>}
        {a.note && <p style={{ margin: 0, fontSize: 12, color: C.soft }}>{a.note}</p>}
        {a.blocked && a.button && !a.href && !result && <p style={{ margin: 0, fontSize: 12, color: C.amber }}>{a.blocked}</p>}
        {confirming && (
          <div role="alertdialog" aria-label="Confirm" style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: C.card, border: `1px solid ${C.rule2}`, display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13 }}>{a.confirm}</p>
            {a.kind === 'duplicate_as_traffic' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ ...labelStyle, fontSize: 11 }}>Daily budget</span>
                  <span style={{ color: C.soft }}>$</span>
                  <input type="number" min={20} step={1} value={sheet.budget} onChange={(e) => setSheet((s) => ({ ...s, budget: e.target.value }))}
                    style={{ width: 72, padding: '5px 8px', borderRadius: 8, border: `1px solid ${C.rule2}`, fontFamily: C.mono, fontSize: 13 }} />
                  <span style={{ color: C.soft, fontSize: 12 }}>/day (TikTok minimum $20)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={sheet.pause} onChange={(e) => setSheet((s) => ({ ...s, pause: e.target.checked }))} />
                  Also pause the original views campaign
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn(a.kind === 'pause' ? 'ghost' : 'mint'), padding: '6px 12px', fontSize: 12.5, ...(a.kind === 'pause' ? { color: C.red, borderColor: C.red } : {}) }} onClick={run}>{a.button}</button>
              <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5 }} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
        {result && <p style={{ margin: 0, fontSize: 12.5, color: result.ok ? C.teal : C.red }}>{result.text}</p>}
      </div>
      {a.href && a.button && (
        <a href={a.href} target={a.href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap', textDecoration: 'none' }}>{a.button} ↗</a>
      )}
      {!a.href && a.button && !result?.ok && !a.done && (
        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }} disabled={busy || confirming} onClick={() => setConfirming(true)}>
          {busy ? 'Working…' : a.button}
        </button>
      )}
    </div>
  )
}

// ── Loading the write-up: cached first, Claude only on the button ───────────
//
// The page shows the last payload from localStorage at once, then refreshes in
// the background with narrative=cached (the newest write-up on file, never a
// Claude call). Regenerate sends fresh=1. Both time out with a plain message.

const BACKGROUND_TIMEOUT = 45_000
const REGENERATE_TIMEOUT = 115_000

export type InsightsState = {
  data: InsightsPayload | null
  /** A background refresh is running (data, if any, is still shown). */
  updating: boolean
  /** Regenerate is running. */
  regenerating: boolean
  error: string | null
  regenerate: () => void
}

export function useInsights(app: string, range: '7d' | '30d' | '90d'): InsightsState {
  const [data, setData] = useState<InsightsPayload | null>(null)
  const [updating, setUpdating] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = `insights:${app}:${range}`

  const load = useCallback(async (fresh: boolean) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), fresh ? REGENERATE_TIMEOUT : BACKGROUND_TIMEOUT)
    if (fresh) setRegenerating(true); else setUpdating(true)
    setError(null)
    try {
      const res = await fetch(`/api/ads/insights?app=${encodeURIComponent(app)}&range=${range}${fresh ? '&fresh=1' : '&narrative=cached'}`, { signal: ctl.signal })
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setData(body)
      try { localStorage.setItem(key, JSON.stringify(body)) } catch { /* private mode */ }
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError'
      setError(aborted
        ? (fresh ? 'The new write-up took too long, so it stopped. The last one is still shown — try Regenerate again in a minute.' : 'Couldn’t refresh the campaigns in time. Showing the last saved write-up.')
        : (e as Error).message)
    } finally {
      clearTimeout(t)
      if (fresh) setRegenerating(false); else setUpdating(false)
    }
  }, [app, range, key])

  useEffect(() => {
    try { const c = localStorage.getItem(key); setData(c ? JSON.parse(c) : null) } catch { /* ignore */ }
    load(false)
  }, [load, key])

  return { data, updating, regenerating, error, regenerate: () => load(true) }
}

/** "today 9:14 AM" / "yesterday" / "3 days ago" */
export function writeupAge(iso?: string): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d)
  const days = Math.round((Date.parse(day(new Date())) - Date.parse(day(new Date(t)))) / 86400000)
  if (days <= 0) return `today ${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** The analyst's note: headline + summary, its age, Regenerate. */
export function AnalystNote({ s, compact = false }: { s: InsightsState; compact?: boolean }) {
  const { data, updating, regenerating, error, regenerate } = s
  const age = writeupAge(data?.generated_at)
  const stale = !!data?.narrative_day && !!data?.day && data.narrative_day < data.day
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Label as="span">Your analyst{data?.model ? ` · ${data.model.replace(/-\d{8}$/, '')}` : ''}</Label>
        <span style={{ fontSize: 12, color: stale ? C.amber : C.soft }}>{age ? `Written ${age}` : data ? 'No write-up yet' : ''}</span>
        {updating && !regenerating && <span style={{ fontSize: 11.5, color: C.soft, background: C.card2, borderRadius: 99, padding: '2px 8px' }}>Updating…</span>}
        <span style={{ flex: 1 }} />
        <button style={{ ...btn('ghost'), padding: '5px 11px', fontSize: 12.5 }} disabled={regenerating} onClick={regenerate} title="Ask Claude for a new write-up from today’s numbers (up to a minute or two)">
          {regenerating ? 'Writing…' : 'Regenerate'}
        </button>
      </div>
      {error && <p role="status" style={{ margin: 0, fontSize: 12.5, color: C.amber }}>{error}</p>}
      {data?.errors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: 12, color: C.amber }}>{e}</p>)}
      {!data && updating && <div style={{ display: 'grid', gap: 8 }}>{[0, 1].map((i) => <div key={i} style={{ height: 40, borderRadius: 12, background: C.card2 }} />)}</div>}
      {data && (data.headline || data.summary) && (
        <div style={{ display: 'grid', gap: 8, padding: compact ? '14px 16px' : '16px 18px', borderRadius: 14, background: C.indigoTint, border: `1px solid ${C.rule}` }}>
          {data.headline && <p style={{ margin: 0, fontSize: compact ? 18 : 20, lineHeight: 1.3, fontWeight: 700, letterSpacing: '-.01em', color: C.ink }}>{data.headline}</p>}
          {data.summary && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.ink }}>{data.summary}</p>}
        </div>
      )}
      {data && !data.headline && !data.summary && data.campaigns.length > 0 && !regenerating && (
        <p style={{ margin: 0, fontSize: 13.5, color: C.ink2 }}>No write-up on file for this range yet. Press Regenerate for one; the actions below are the rules engine’s and stand on their own.</p>
      )}
    </div>
  )
}

/** The card at the top of /analytics and each app page. */
export function ThisWeek({ app = 'all', range = '30d' }: { app?: string; range?: '7d' | '30d' | '90d' }) {
  const s = useInsights(app, range)
  const { data } = s
  const actions = data?.actions ?? []
  return (
    <section aria-label="This week" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
      <h2 style={{ fontFamily: C.serif, fontSize: 17, fontWeight: 700, margin: 0 }}>This week</h2>
      <AnalystNote s={s} />
      {data && (
        <>
          {!data.campaigns.length && <p style={{ margin: 0, fontSize: 13.5, color: C.soft }}>No campaigns in this window, so nothing to judge.</p>}
          {actions.length > 0 && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {actions.map((a, i) => (
                <li key={a.id}>{(() => { const c = data.campaigns.find((c) => c.platform === a.platform && c.campaign_id === a.campaign_id); return <ActionItem a={a} n={i + 1} insight={c?.insight} media={c?.media} /> })()}</li>
              ))}
            </ol>
          )}
          <Ideas data={data} />
          <Footnote data={data} />
        </>
      )}
    </section>
  )
}

export function Ideas({ data }: { data: InsightsPayload }) {
  if (!data.ideas.length) return null
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Label as="span">Ideas</Label>
      {data.ideas.map((i, k) => <p key={k} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}><b>{i.title}.</b> {i.detail}{i.app_id ? <span style={{ color: C.soft }}> · {appName(i.app_id)}</span> : null}</p>)}
    </div>
  )
}

export function Footnote({ data }: { data: InsightsPayload }) {
  return (
    <p style={{ margin: 0, fontSize: 11.5, color: C.soft, lineHeight: 1.5 }}>
      Verdicts come from the rules engine (objective, our own medians, platform ranges) and follow the revenue strategy: while an app’s ads are paused it only suggests leaving them off, deleting dead campaigns or reusing creative organically. Claude writes the words and never changes a verdict or invents a number.
      {data.installs_visible ? '' : ' Installs aren’t visible in this view.'} Nothing changes spend without the button and the confirm.
    </p>
  )
}
