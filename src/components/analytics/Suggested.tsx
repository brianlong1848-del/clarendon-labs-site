'use client'
import { useState, type CSSProperties } from 'react'
import { AppTag, C, btn } from '@/components/AdminNav'
import type { InsightAction, InsightsPayload } from '@/components/analytics/Insights'

// ─── Suggested for you (was "Do it for me"; web parity for Studio 685d10b) ───
//
// Brian, 2026-11-25: "it looked like it was suggesting I pause it, but it
// wasn't suggesting it based on data." Two clearly different things now:
//   Suggested — only what the rules engine advises from the numbers (pause /
//               delete_campaign / reuse_angle). One row per campaign, each with
//               its reason (`say` ?? `detail`), its own button and its own
//               confirm. "Do all N suggestions" only when there are 2+, and it
//               runs only these.
//   Controls  — app page only: switch every running campaign for this app off.
//               A plain control, never a suggestion, never part of Do all.
// Runs through POST /api/ads/actions, not in TikTok Ads or Ads Manager. Same
// words as Studio/Views/DoItForMeCard.swift — change one, change the other.

const KINDS = new Set<InsightAction['kind']>(['pause', 'delete_campaign', 'reuse_angle'])
type Result = { ok: boolean; text: string }
type Ask = { kind: 'one'; a: InsightAction } | { kind: 'all' } | { kind: 'off' }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const small: CSSProperties = { padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }

async function post(a: Pick<InsightAction, 'kind' | 'platform' | 'campaign_id' | 'app_id' | 'promotion_id' | 'amount_cents' | 'advertiser_id' | 'adgroup_ids' | 'ad_ids' | 'item_id' | 'post_id'>) {
  const res = await fetch('/api/ads/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: a.kind, platform: a.platform, campaign_id: a.campaign_id, app_id: a.app_id, promotion_id: a.promotion_id, amount_cents: a.amount_cents,
      source_ids: { advertiser_id: a.advertiser_id, adgroup_ids: a.adgroup_ids, ad_ids: a.ad_ids, item_id: a.item_id, post_id: a.post_id } }) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return String(body.message ?? 'Done.')
}

/** The rules engine's advice this strip can carry out (used by /analytics to leave them out of The list). */
export function suggestedActions(actions: InsightAction[], ran: Record<string, Result> = {}) {
  return actions.filter((a) => KINDS.has(a.kind) && !a.done && !ran[a.id]?.ok && !!a.button && !a.href).sort((x, y) => y.score - x.score)
}

export function Suggested({ app, appName, data, appNames = {}, onChanged, onRan }: {
  /** 'all' (every app) or an app id. */
  app: string
  appName?: string
  data: InsightsPayload | null
  appNames?: Record<string, string>
  /** After a run: re-read the platforms (the cached list still shows a just-paused campaign as running). */
  onChanged: () => void
  onRan?: (id: string, r: Result) => void
}) {
  const [ran, setRan] = useState<Record<string, Result>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [asking, setAsking] = useState<Ask | null>(null)
  const [said, setSaid] = useState<Result | null>(null)
  const name = appName ?? 'this app'

  const list = suggestedActions(data?.actions ?? [], ran)
  const running: InsightAction[] = app === 'all' ? [] : (data?.campaigns ?? []).filter((c) => c.status === 'running').map((c) => ({
    id: `pause:${c.platform}:${c.campaign_id}`, kind: 'pause' as const, platform: c.platform, campaign_id: c.campaign_id, app_id: c.app_id ?? app,
    campaign_name: c.name, campaign_label: c.label, title: `Pause ${c.label ?? c.name}`, detail: '', button: 'Pause', score: 0,
  })).filter((a) => !ran[a.id]?.ok)

  const run = async (ask: Ask) => {
    const jobs = ask.kind === 'one' ? [ask.a] : ask.kind === 'all' ? list : running
    if (!jobs.length) return
    setAsking(null); setSaid(null); setBusy(ask.kind === 'one' ? ask.a.id : ask.kind)
    let ok = 0; let first: string | null = null
    for (const a of jobs) {   // one by one: the platforms rate-limit bursts
      try { const text = await post(a); ok++; setRan((m) => ({ ...m, [a.id]: { ok: true, text } })); onRan?.(a.id, { ok: true, text }) }
      catch (e) {
        const text = (e as Error).message
        setRan((m) => ({ ...m, [a.id]: { ok: false, text } })); onRan?.(a.id, { ok: false, text })
        first ??= `${a.campaign_label ?? a.campaign_name}: ${text}`
      }
    }
    const n = jobs.length
    if (n > 1) setSaid({ ok: ok === n, text: (ok === n ? `Done: all ${n}.` : `${ok} of ${n} done.`) + (first ? ` ${first}` : '') })
    setBusy(null)
    setTimeout(onChanged, 1500)
  }

  const summary = (xs: InsightAction[]) => {
    const n = (k: InsightAction['kind']) => xs.filter((a) => a.kind === k).length
    return [n('pause') && `${n('pause')} to pause`, n('delete_campaign') && `${n('delete_campaign')} to delete`, n('reuse_angle') && `${n('reuse_angle')} to repost`].filter(Boolean).join(' · ')
  }
  const confirmText = (ask: Ask) => ask.kind === 'one'
    ? ask.a.confirm ?? (ask.a.kind === 'reuse_angle' ? 'Same video, fresh caption, Instagram + Facebook at the next best hour. Nothing goes out now; it waits in Post → Queue.'
      : ask.a.kind === 'delete_campaign' ? 'It never delivered. This can’t be undone.' : 'Spend to date stays; resume any time.')
    : ask.kind === 'off' ? `This pauses all ${plural(running.length, 'running campaign')} for ${name} on TikTok and Meta. It isn’t based on the numbers — it’s your call. Resume any time:`
    : null
  const confirmButton = (ask: Ask) => ask.kind === 'one' ? (ask.a.kind === 'pause' ? 'Pause' : ask.a.kind === 'delete_campaign' ? 'Delete' : 'Schedule')
    : ask.kind === 'all' ? `Do all ${list.length}` : `Pause ${running.length}`
  const confirmTitle = (ask: Ask) => ask.kind === 'one' ? `${ask.a.title}?` : ask.kind === 'all' ? `Do all ${list.length} suggestions?` : `Turn off ${name}’s ads?`
  const gentle = (ask: Ask) => ask.kind === 'one' && ask.a.kind === 'reuse_angle'

  const confirmBox = (ask: Ask, items?: InsightAction[]) => (
    <div role="alertdialog" aria-label={confirmTitle(ask)} style={{ display: 'grid', gap: 8, marginTop: 8, padding: 12, borderRadius: 12, background: C.card2 }}>
      <b style={{ fontSize: 13 }}>{confirmTitle(ask)}</b>
      {confirmText(ask) && <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{confirmText(ask)}</span>}
      {items && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>{items.map((a) => <li key={a.id}>{ask.kind === 'off' ? a.campaign_label ?? a.campaign_name : a.title}</li>)}</ul>}
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={{ ...(gentle(ask) ? btn('mint') : { ...btn('ghost'), color: C.red, borderColor: C.red }), ...small }} onClick={() => run(ask)}>{confirmButton(ask)}</button>
        <button style={{ ...btn('ghost'), ...small }} onClick={() => setAsking(null)}>Cancel</button>
      </span>
    </div>
  )
  const isAsking = (k: string) => asking && (asking.kind === 'one' ? asking.a.id === k : asking.kind === k)
  const working = (k: string) => busy === k ? 'Working…' : null

  return (
    <section aria-label="Suggested for you" style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 20, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Suggested for you</h2>
        <span style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.45 }}>Only what the numbers back, each with the reason. Runs here, not in TikTok Ads or Ads Manager. Nothing changes until you confirm.</span>
      </div>
      {said && <span style={{ fontSize: 12.5, fontWeight: 600, color: said.ok ? C.teal : C.red }}>{said.text}</span>}

      {!data ? <div style={{ display: 'grid', gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 44, borderRadius: 12, background: C.card2 }} />)}</div>
        : !list.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: C.card2, fontSize: 13.5, color: C.ink2 }}>
            <span aria-hidden="true" style={{ color: C.teal, fontWeight: 800 }}>✓</span>
            {app === 'all' ? 'No suggestions. Nothing in the numbers needs a change.' : `No suggestions for ${name}. Nothing in the numbers needs a change.`}
          </div>
        ) : <>
          {list.length > 1 && (
            <div style={{ padding: 12, borderRadius: 14, background: C.card2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 17, color: '#fff', background: C.grad }}>✦</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>Do all {list.length} suggestions</b>
                  <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>{summary(list)}</div>
                </div>
                <button style={{ ...btn('mint'), ...small }} disabled={!!busy} onClick={() => setAsking({ kind: 'all' })}>{working('all') ?? 'Do all'}</button>
              </div>
              {isAsking('all') && confirmBox({ kind: 'all' }, list)}
            </div>
          )}
          <div style={{ display: 'grid' }}>
            {list.map((a, i) => {
              const danger = a.kind !== 'reuse_angle', r = ran[a.id]
              const verb = a.kind === 'pause' ? 'Pause' : a.kind === 'delete_campaign' ? 'Delete' : 'Schedule repost'
              return (
                <div key={a.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.rule}` : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span aria-hidden="true" style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 15, background: danger ? '#FBEDE6' : C.mintTint }}>{a.kind === 'pause' ? '⏸' : a.kind === 'delete_campaign' ? '🗑' : '★'}</span>
                    <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {app === 'all' && a.app_id && <AppTag id={a.app_id} name="" size={16} />}
                        <b style={{ fontSize: 13.5 }}>{a.title}</b>
                        {app === 'all' && a.app_id && <span style={{ fontSize: 12, color: C.soft }}>{appNames[a.app_id] ?? a.app_id}</span>}
                      </span>
                      {/* The reason, from the numbers (Claude's plain-words "say" when there is one). */}
                      <span style={{ fontSize: 12, color: C.ink2, lineHeight: 1.45 }}><span aria-hidden="true" style={{ color: C.soft, marginRight: 5 }}>▤</span>{a.say ?? a.detail}</span>
                      {a.blocked && <span style={{ fontSize: 11.5, color: C.amber }}>{a.blocked}</span>}
                      {r && <span style={{ fontSize: 12, fontWeight: 600, color: r.ok ? C.teal : C.red }}>{r.text}</span>}
                    </div>
                    <button style={{ ...btn('ghost'), ...small, color: danger ? C.red : C.teal, ...(danger ? { borderColor: 'rgba(194,74,74,.5)' } : {}) }} disabled={!!busy}
                      onClick={() => setAsking({ kind: 'one', a })}>{working(a.id) ?? verb}</button>
                  </div>
                  {isAsking(a.id) && confirmBox({ kind: 'one', a })}
                </div>
              )
            })}
          </div>
        </>}

      {/* Not a suggestion: Brian's own switch for this app. */}
      {data && app !== 'all' && running.length > 0 && (
        <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${C.rule2}`, display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.soft }}>Controls</span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name} has {plural(running.length, 'campaign')} running</div>
              <div style={{ fontSize: 12, color: C.soft, marginTop: 2 }}>Not a suggestion. Use this only if you decide to stop spending on {name}.</div>
            </div>
            <button style={{ ...btn('ghost'), ...small }} disabled={!!busy} onClick={() => setAsking({ kind: 'off' })}>{working('off') ?? 'Turn off ads…'}</button>
          </div>
          {isAsking('off') && confirmBox({ kind: 'off' }, running)}
        </div>
      )}
    </section>
  )
}
