'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, btn } from '@/components/AdminNav'
import { PlatformGlyph, Segmented, Toggle, card, label, when, type PublishApp, type QueuedPost } from './shared'

// ─── Promote a post (Meta) ───────────────────────────────────────────────────
//
// The "Promote" sheet on a posted Facebook / Instagram post: goal, daily
// budget, dates and audience (age, gender, places, interests), with Meta's
// own reach estimate. Talks to /api/ads/meta. Also exports the "Promoted"
// list the Queue shows (live spend / reach, pause / resume / stop).

export type Place = { key: string; name: string; type: 'country' | 'region' | 'city'; country?: string; region?: string; radiusMiles?: number }
export type Interest = { id: string; name: string; audience?: number }
export type Audience = { ageMin: number; ageMax: number; genders: 'all' | 'men' | 'women'; places: Place[]; interests: Interest[]; expand: boolean }
export type AdsStatus = { ready: boolean; reasons: string[]; account?: { name: string; status: string; currency: string }; limits: { maxDailyCents: number; maxTotalCents: number; minDailyCents: number; minAge: number } }
export type PromoResults = { spend_cents: number; impressions: number; reach: number; clicks: number; engagements: number; delivery?: string }
export type PromotionRow = {
  id: string; app_id: string; post_id: string | null; platform: 'facebook' | 'instagram'; permalink: string | null; goal: string
  daily_budget_cents: number; start_at: string; end_at: string; audience: Audience; status: string; error: string | null; results: PromoResults | null
}
export type AdsData = { status: AdsStatus; goals: { id: string; label: string }[]; defaults: Audience; promotions: PromotionRow[] }

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 ? 2 : 0 })
const big = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const input: React.CSSProperties = { fontFamily: C.sans, fontSize: 14, padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.rule2}`, background: C.card, color: C.ink, width: '100%', boxSizing: 'border-box' }

export const promotable = (p: QueuedPost) => p.targets.filter((t) => (t.platform === 'facebook' || (t.platform === 'instagram' && t.format !== 'story')) && t.status === 'published' && t.remoteId)

function Search<T>({ kind, placeholder, onPick, render }: { kind: 'places' | 'interests'; placeholder: string; onPick: (v: T) => void; render: (v: T) => string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<T[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setHits([]); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/ads/meta?search=${kind}&q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => ({ results: [] }))
      setHits(r.results ?? [])
    }, 300)
  }, [q, kind])
  return (
    <div style={{ position: 'relative' }}>
      <input style={input} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, marginTop: 4, ...card, padding: 6, maxHeight: 220, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {hits.map((h, i) => (
            <button key={i} onClick={() => { onPick(h); setQ(''); setHits([]) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '8px 10px', borderRadius: 7, fontSize: 13.5, cursor: 'pointer', color: C.ink }}>{render(h)}</button>
          ))}
        </div>
      )}
    </div>
  )
}

const Chip = ({ text, onRemove }: { text: string; onRemove: () => void }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, background: C.card2, borderRadius: 99, padding: '4px 6px 4px 11px' }}>
    {text}<button onClick={onRemove} aria-label={`Remove ${text}`} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: C.soft, fontSize: 14, lineHeight: 1 }}>×</button>
  </span>
)

export function PromoteSheet({ post, app, ads, onClose, onDone }: { post: QueuedPost; app?: PublishApp; ads: AdsData; onClose: () => void; onDone: () => void }) {
  const targets = promotable(post)
  const kid = post.app_id === 'jinglewire'
  const [platform, setPlatform] = useState(targets[0]?.platform as 'facebook' | 'instagram')
  const [goal, setGoal] = useState(ads.goals[0]?.id ?? 'engagement')
  const [daily, setDaily] = useState('10')
  const [start, setStart] = useState(localInput(new Date()))
  const [end, setEnd] = useState(localInput(new Date(Date.now() + 7 * 864e5)))
  const [aud, setAud] = useState<Audience>({ ...ads.defaults, ageMin: Math.max(ads.defaults.ageMin, kid ? 25 : 18) })
  const [reach, setReach] = useState<{ low: number; high: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dailyCents = Math.round(Number(daily) * 100) || 0
  const days = Math.max(0, Math.ceil((Date.parse(end) - Math.max(Date.parse(start), Date.now())) / 864e5))
  const total = dailyCents * days
  const lim = ads.status.limits

  const audKey = useMemo(() => JSON.stringify([aud, platform]), [aud, platform])
  useEffect(() => {
    setReach(null)
    if (!ads.status.ready || !aud.places.length) return
    const t = setTimeout(async () => {
      const r = await fetch('/api/ads/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'estimate', audience: aud, platform }) })
        .then((x) => x.json()).catch(() => null)
      setReach(r?.reach ?? null)
    }, 500)
    return () => clearTimeout(t)
  }, [audKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const problems: string[] = []
  if (dailyCents < lim.minDailyCents) problems.push(`Daily budget must be at least ${usd(lim.minDailyCents)}.`)
  if (dailyCents > lim.maxDailyCents) problems.push(`Daily budget is capped at ${usd(lim.maxDailyCents)}.`)
  if (total > lim.maxTotalCents) problems.push(`Total would be up to ${usd(total)}; the cap per promotion is ${usd(lim.maxTotalCents)}.`)
  if (days < 1) problems.push('Run it for at least one day.')
  if (aud.ageMin < (kid ? 25 : lim.minAge)) problems.push(kid ? 'Jinglewire ads go to parents: minimum age 25.' : `Minimum age is ${lim.minAge}.`)
  if (!aud.places.length) problems.push('Pick at least one place.')

  const submit = async () => {
    if (!confirm(`Promote this ${platform === 'instagram' ? 'Instagram' : 'Facebook'} post for ${usd(dailyCents)}/day, up to ${usd(total)} in total? Meta charges the card on file.`)) return
    setBusy(true); setError(null)
    const res = await fetch('/api/ads/meta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, platform, goal, dailyBudgetCents: dailyCents, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), audience: aud }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); return }
    onDone()
  }

  const row = (title: string, children: React.ReactNode) => (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}><span style={label}>{title}</span>{children}</div>
  )

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Promote post" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.35)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(560px, 100%)', maxHeight: '92vh', overflow: 'auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {app && <img src={app.icon} alt="" width={26} height={26} style={{ borderRadius: 7 }} />}
          <b style={{ fontSize: 17, flex: 1 }}>Promote {app?.name ?? ''} post</b>
          <button onClick={onClose} style={{ ...btn('ghost'), padding: '6px 10px' }}>Close</button>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.caption || 'No caption'}</p>

        {!ads.status.ready && (
          <div style={{ background: '#FBF0DD', borderRadius: 12, padding: 14, fontSize: 13.5, color: C.amber, display: 'grid', gap: 6 }}>
            <b>Promoting isn’t switched on yet</b>
            {ads.status.reasons.map((r, i) => <span key={i}>{r}</span>)}
          </div>
        )}

        {row('Promote on', (
          <Segmented value={platform} onChange={(v) => setPlatform(v)}
            options={targets.map((t) => ({ value: t.platform as 'facebook' | 'instagram', label: t.platform === 'instagram' ? 'Instagram' : 'Facebook' }))} />
        ))}
        {row('Goal', (
          <div style={{ display: 'grid', gap: 6 }}>
            {ads.goals.map((g) => (
              <label key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" name="goal" checked={goal === g.id} onChange={() => setGoal(g.id)} />{g.label}
              </label>
            ))}
          </div>
        ))}
        {row('Daily budget (USD)', (
          <div style={{ position: 'relative', width: 160 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.soft, fontSize: 14 }}>$</span>
            <input style={{ ...input, paddingLeft: 22 }} type="number" min={1} step={1} value={daily} onChange={(e) => setDaily(e.target.value)} />
          </div>
        ))}
        {/* Date-time inputs have a wide built-in minimum, so they get their own
            row and minWidth: 0; they stack on narrow screens instead of overlapping. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {row('Starts', <input style={{ ...input, minWidth: 0 }} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />)}
          {row('Ends', <input style={{ ...input, minWidth: 0 }} type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />)}
        </div>

        {row('Who sees it', (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5 }}>Age</span>
              <input style={{ ...input, width: 70 }} type="number" min={kid ? 25 : lim.minAge} max={65} value={aud.ageMin} onChange={(e) => setAud({ ...aud, ageMin: Number(e.target.value) })} />
              <span style={{ fontSize: 13.5 }}>to</span>
              <input style={{ ...input, width: 70 }} type="number" min={aud.ageMin} max={65} value={aud.ageMax} onChange={(e) => setAud({ ...aud, ageMax: Number(e.target.value) })} />
              <span style={{ fontSize: 12, color: C.soft }}>{aud.ageMax >= 65 ? '65 means 65+' : ''}</span>
              <span style={{ flex: 1 }} />
              <Segmented value={aud.genders} onChange={(v) => setAud({ ...aud, genders: v })}
                options={[{ value: 'all', label: 'Everyone' }, { value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }]} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Search<Place> kind="places" placeholder="Add a country, state or city…" render={(p) => `${p.name}${p.region ? `, ${p.region}` : ''}${p.country && p.type !== 'country' ? `, ${p.country}` : ''} · ${p.type}`}
                onPick={(p) => !aud.places.some((x) => x.key === p.key) && setAud({ ...aud, places: [...aud.places, p] })} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {aud.places.map((p) => <Chip key={p.key} text={p.type === 'city' ? `${p.name} +15mi` : p.name} onRemove={() => setAud({ ...aud, places: aud.places.filter((x) => x.key !== p.key) })} />)}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Search<Interest> kind="interests" placeholder={kid ? 'Add an interest (e.g. Parenting, Christmas)…' : 'Add an interest (e.g. Board games, LGBTQ culture)…'}
                render={(i) => `${i.name}${i.audience ? ` · ${big(i.audience)} people` : ''}`}
                onPick={(i) => !aud.interests.some((x) => x.id === i.id) && setAud({ ...aud, interests: [...aud.interests, i] })} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {aud.interests.map((i) => <Chip key={i.id} text={i.name} onRemove={() => setAud({ ...aud, interests: aud.interests.filter((x) => x.id !== i.id) })} />)}
                {!aud.interests.length && <span style={{ fontSize: 12.5, color: C.soft }}>No interests: anyone in these places and ages.</span>}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
              <Toggle on={aud.expand} onChange={(v) => setAud({ ...aud, expand: v })} label="Let Meta expand the audience" />
              Let Meta reach people outside these interests when it expects better results
            </label>
          </div>
        ))}

        <div style={{ background: C.card2, borderRadius: 12, padding: 14, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5 }}>
          <span><span style={label}>Total, up to</span><br /><b style={{ fontSize: 18 }}>{usd(total)}</b> <span style={{ color: C.soft }}>· {days} day{days === 1 ? '' : 's'}</span></span>
          <span><span style={label}>Audience size</span><br /><b style={{ fontSize: 18 }}>{reach ? `${big(reach.low)}–${big(reach.high)}` : '—'}</b></span>
        </div>
        {kid && <p style={{ margin: 0, fontSize: 12.5, color: C.ink2 }}>Jinglewire is for kids, so its ads go to parents only (25+). Nothing is tracked back to the app.</p>}
        {problems.length > 0 && <p style={{ margin: 0, fontSize: 13, color: C.amber }}>{problems.join(' ')}</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
        <button style={btn('mint')} disabled={busy || !ads.status.ready || problems.length > 0} onClick={submit}>
          {busy ? 'Setting it up with Meta…' : `Promote · ${usd(dailyCents)}/day`}
        </button>
      </div>
    </div>
  , document.body)
}

const PSTATUS: Record<string, { text: string; color: string }> = {
  active: { text: 'Running', color: C.mint }, paused: { text: 'Paused', color: C.amber }, ended: { text: 'Ended', color: C.ink2 },
  failed: { text: 'Failed', color: C.red }, creating: { text: 'Setting up…', color: C.ink2 },
}

export function Promotions({ ads, apps, onChange }: { ads: AdsData; apps: PublishApp[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!ads.promotions.length) return null
  const act = async (id: string, action: 'pause' | 'resume' | 'stop') => {
    if (action === 'stop' && !confirm('Stop this promotion for good? Spend so far stays charged.')) return
    setBusy(id); setError(null)
    const res = await fetch(`/api/ads/meta?id=${id}&action=${action}`, { method: 'PATCH' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); onChange()
  }
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>Promoted</span><span style={{ flex: 1, height: 1, background: C.rule }} />
      </div>
      {error && <p style={{ color: C.red, margin: 0, fontSize: 13 }}>{error}</p>}
      {ads.promotions.map((p) => {
        const app = apps.find((a) => a.id === p.app_id)
        const s = PSTATUS[p.status] ?? PSTATUS.creating
        const r = p.results
        return (
          <article key={p.id} style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {app && <img src={app.icon} alt="" width={20} height={20} style={{ borderRadius: 5 }} />}
                <b style={{ fontSize: 14 }}>{app?.name ?? p.app_id}</b>
                <PlatformGlyph platform={p.platform} size={15} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color }}>{s.text}</span>
                <span style={{ fontSize: 12.5, color: C.soft }}>{usd(p.daily_budget_cents)}/day · {when(p.start_at)} → {when(p.end_at)}</span>
                {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.ink2 }}>Post ↗</a>}
              </div>
              <span style={{ fontSize: 12.5, color: C.ink2 }}>
                {p.audience.ageMin}–{p.audience.ageMax}{p.audience.ageMax >= 65 ? '+' : ''} · {p.audience.genders === 'all' ? 'everyone' : p.audience.genders}
                {' · '}{p.audience.places.map((x) => x.name).join(', ')}{p.audience.interests.length ? ` · ${p.audience.interests.map((x) => x.name).join(', ')}` : ''}
              </span>
              {r && <span style={{ fontSize: 13 }}><b>{usd(r.spend_cents)}</b> spent · {big(r.reach)} reached · {big(r.impressions)} views · {r.engagements || r.clicks} {r.engagements ? 'engagements' : 'clicks'}{r.delivery && r.delivery !== 'ACTIVE' && p.status === 'active' ? ` · Meta: ${r.delivery.toLowerCase().replace(/_/g, ' ')}` : ''}</span>}
              {p.error && <span style={{ fontSize: 12, color: C.red }}>{p.error}</span>}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(p.status === 'active' || p.status === 'paused') && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => act(p.id, p.status === 'active' ? 'pause' : 'resume')}>{p.status === 'active' ? 'Pause' : 'Resume'}</button>}
              {(p.status === 'active' || p.status === 'paused') && <button style={{ ...btn('ghost'), color: C.red }} disabled={busy === p.id} onClick={() => act(p.id, 'stop')}>Stop</button>}
            </div>
          </article>
        )
      })}
    </section>
  )
}
