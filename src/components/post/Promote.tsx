'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, btn } from '@/components/AdminNav'
import { marketPresetId, presetsFor, type AudiencePreset } from '@/lib/ads/presets'
import { isMarket, MARKETS } from '@/lib/publish/markets'
import { PlatformGlyph, Segmented, Toggle, card, label, when, type PublishApp, type QueuedPost } from './shared'
import { TikTokPromoteForm, tiktokTarget, type AccountVideo, type TikTokAdsData, type TikTokAudience, type TikTokResults } from './PromoteTikTok'

// ─── Promote a post (Meta + TikTok) ──────────────────────────────────────────
//
// The "Promote" sheet on a posted Facebook / Instagram / TikTok post: goal,
// daily budget, dates and audience, with Meta's own reach estimate. Talks to
// /api/ads/meta; the TikTok side lives in PromoteTikTok.tsx and talks to
// /api/ads/tiktok. Also exports the "Promoted" list the Queue shows (both
// networks: live spend / reach, pause / resume / stop).

export type Place = { key: string; name: string; type: 'country' | 'region' | 'city'; country?: string; region?: string; radiusMiles?: number }
export type Interest = { id: string; name: string; audience?: number }
export type Audience = { ageMin: number; ageMax: number; genders: 'all' | 'men' | 'women'; places: Place[]; interests: Interest[]; expand: boolean }
export type AdsStatus = { ready: boolean; reasons: string[]; account?: { name: string; status: string; currency: string }; limits: { maxDailyCents: number; maxTotalCents: number; minDailyCents: number; minAge: number } }
export type PromoResults = { spend_cents: number; impressions: number; reach: number; clicks: number; engagements: number; delivery?: string; review?: string }
export type PromotionRow = {
  id: string; app_id: string; post_id: string | null; network?: 'meta' | 'tiktok'; platform: 'facebook' | 'instagram' | 'tiktok'; permalink: string | null; goal: string
  daily_budget_cents: number; start_at: string; end_at: string; audience: Audience | TikTokAudience; status: string; error: string | null
  results: PromoResults | TikTokResults | null
  campaign_id?: string | null
  /** TikTok: the app's Ads Manager. */
  adsManager?: string
}
export type AdsData = { status: AdsStatus; goals: { id: string; label: string }[]; defaults: Audience; promotions: PromotionRow[]; savedPresets?: AudiencePreset[]; storeApps?: string[] }

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

/** `post` is a Queue post; `video` is a TikTok already on the account (no Queue row). */
export function PromoteSheet({ post, video, app, ads, tt, onClose, onDone }: { post?: QueuedPost | null; video?: AccountVideo | null; app?: PublishApp; ads: AdsData; tt?: TikTokAdsData | null; onClose: () => void; onDone: () => void }) {
  const appId = post?.app_id ?? video?.appId ?? ''
  const targets = post ? promotable(post) : []
  const ttOk = !!tt && (!!video || (!!post && !!tiktokTarget(post)))
  const kid = appId === 'jinglewire'
  const [platform, setPlatform] = useState<'facebook' | 'instagram' | 'tiktok'>(video || !targets.length ? 'tiktok' : (targets[0].platform as 'facebook' | 'instagram'))
  const [goal, setGoal] = useState((ads.storeApps ?? []).includes(appId) ? 'downloads' : 'engagement')
  const [daily, setDaily] = useState('10')
  const [start, setStart] = useState(localInput(new Date()))
  const [end, setEnd] = useState(localInput(new Date(Date.now() + 7 * 864e5)))
  const [aud, setAud] = useState<Audience>({ ...ads.defaults, ageMin: Math.max(ads.defaults.ageMin, kid ? 25 : 18) })
  const [reach, setReach] = useState<{ low: number; high: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllPlaces, setShowAllPlaces] = useState(false)
  const [saved, setSaved] = useState<AudiencePreset[]>(ads.savedPresets ?? [])
  const presets = presetsFor(appId, saved)
  const [presetId, setPresetId] = useState<string>('')

  // One click fills goal, platform, budget, dates and audience.
  const applyPreset = (p: AudiencePreset) => {
    setPresetId(p.id)
    if (p.platform && targets.some((t) => t.platform === p.platform)) setPlatform(p.platform)
    if (p.goal) setGoal(p.goal === 'downloads' && !(ads.storeApps ?? []).includes(appId) ? 'engagement' : p.goal)
    if (p.dailyUsd) setDaily(String(p.dailyUsd))
    if (p.days) setEnd(localInput(new Date(Date.parse(start) + p.days * 864e5)))
    setAud({ ...p.audience, ageMin: Math.max(p.audience.ageMin, kid ? 25 : ads.status.limits.minAge) })
    setShowAllPlaces(false)
  }
  // A market edition opens aimed at its own market (UK edition → UK + Ireland,
  // Québec edition → Canada in French); otherwise the app's first preset, so
  // Gag Order opens already set up.
  const market = post && isMarket(post.market) ? MARKETS[post.market] : null
  useEffect(() => {
    const p = (market && presets.find((x) => x.id === marketPresetId(appId, market.id))) || presets[0]
    if (p) applyPreset(p)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveAsPreset = async () => {
    const name = prompt('Name this audience preset (e.g. "Queer cities · after dark"):')
    if (!name?.trim()) return
    const res = await fetch('/api/ads/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'savePreset', appId: appId, name, platform, goal, dailyUsd: Number(daily), days, audience: aud }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Couldn’t save the preset.'); return }
    const r = body.preset
    const p: AudiencePreset = { id: r.id, appId: r.app_id, name: r.name, saved: true, platform: r.platform ?? undefined, goal: r.goal ?? undefined, dailyUsd: r.daily_usd ?? undefined, days: r.days ?? undefined, audience: r.audience }
    setSaved([...saved, p]); setPresetId(p.id)
  }
  const removePreset = async (id: string) => {
    if (!confirm('Delete this saved preset?')) return
    await fetch(`/api/ads/meta?preset=${id}`, { method: 'DELETE' })
    setSaved(saved.filter((p) => p.id !== id)); setPresetId('')
  }
  const current = presets.find((p) => p.id === presetId)

  const dailyCents = Math.round(Number(daily) * 100) || 0
  const days = Math.max(0, Math.ceil((Date.parse(end) - Math.max(Date.parse(start), Date.now())) / 864e5))
  const total = dailyCents * days
  const lim = ads.status.limits

  const audKey = useMemo(() => JSON.stringify([aud, platform]), [aud, platform])
  useEffect(() => {
    setReach(null)
    if (platform === 'tiktok' || !ads.status.ready || !aud.places.length) return
    const t = setTimeout(async () => {
      const r = await fetch('/api/ads/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'estimate', audience: aud, platform: platform as 'facebook' | 'instagram' }) })
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
      body: JSON.stringify({ postId: post!.id, platform, goal, dailyBudgetCents: dailyCents, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), audience: aud }),
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
        {market && <span style={{ fontSize: 12, fontWeight: 800, color: C.ink2 }}>{market.flag} {market.name} edition · {market.langName}</span>}
        <p style={{ margin: 0, fontSize: 13.5, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(post?.caption ?? video?.caption) || 'No caption'}</p>

        {platform !== 'tiktok' && !ads.status.ready && (
          <div style={{ background: '#FBF0DD', borderRadius: 12, padding: 14, fontSize: 13.5, color: C.amber, display: 'grid', gap: 6 }}>
            <b>Promoting isn’t switched on yet</b>
            {ads.status.reasons.map((r, i) => <span key={i}>{r}</span>)}
          </div>
        )}

        {row('Audience preset', (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select style={{ ...input, width: 'auto', flex: 1, minWidth: 220 }} value={presetId}
                onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) applyPreset(p); else setPresetId('') }}>
                <option value="">Custom (no preset)</option>
                {presets.map((p) => <option key={p.id} value={p.id}>{p.saved ? '★ ' : ''}{p.name}</option>)}
              </select>
              <button style={btn('ghost')} onClick={saveAsPreset}>Save as preset</button>
              {current?.saved && <button style={{ ...btn('ghost'), color: C.red }} onClick={() => removePreset(current.id)}>Delete</button>}
            </div>
            {current?.note && <span style={{ fontSize: 12.5, color: C.ink2 }}>{current.note}</span>}
          </div>
        ))}
        {row('Promote on', (
          <Segmented value={platform} onChange={(v) => setPlatform(v)}
            options={[...targets.map((t) => ({ value: t.platform as 'facebook' | 'instagram' | 'tiktok', label: t.platform === 'instagram' ? 'Instagram' : 'Facebook' })),
                      ...(ttOk ? [{ value: 'tiktok' as const, label: 'TikTok' }] : [])]} />
        ))}
        {platform === 'tiktok' && tt && <TikTokPromoteForm appId={appId} post={post} video={video} tt={tt} onDone={onDone} />}
        {platform !== 'tiktok' && <>
        {row('Goal', (
          <div style={{ display: 'grid', gap: 6 }}>
            {ads.goals.filter((g) => g.id !== 'downloads' || (ads.storeApps ?? []).includes(appId)).map((g) => (
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
              <span style={{ fontSize: 12, color: C.soft }}>{aud.expand ? 'Meta treats the top age as a suggestion while “expand” is on' : aud.ageMax >= 65 ? '65 means 65+' : ''}</span>
              <span style={{ flex: 1 }} />
              <Segmented value={aud.genders} onChange={(v) => setAud({ ...aud, genders: v })}
                options={[{ value: 'all', label: 'Everyone' }, { value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }]} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Search<Place> kind="places" placeholder="Add a country, state or city…" render={(p) => `${p.name}${p.region ? `, ${p.region}` : ''}${p.country && p.type !== 'country' ? `, ${p.country}` : ''} · ${p.type}`}
                onPick={(p) => !aud.places.some((x) => x.key === p.key) && setAud({ ...aud, places: [...aud.places, p] })} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(showAllPlaces ? aud.places : aud.places.slice(0, 8)).map((p) => <Chip key={p.key} text={p.type === 'city' ? `${p.name} +${p.radiusMiles ?? 15}mi` : p.name} onRemove={() => { setPresetId(''); setAud({ ...aud, places: aud.places.filter((x) => x.key !== p.key) }) }} />)}
                {aud.places.length > 8 && <button onClick={() => setShowAllPlaces(!showAllPlaces)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.ink2 }}>{showAllPlaces ? 'Show fewer' : `+${aud.places.length - 8} more`}</button>}
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
        </>}
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
  const [diag, setDiag] = useState<Record<string, string[] | 'loading'>>({})
  const diagnose = async (id: string) => {
    if (diag[id] && diag[id] !== 'loading') { const n = { ...diag }; delete n[id]; setDiag(n); return }
    setDiag({ ...diag, [id]: 'loading' })
    const r = await fetch(`/api/ads/meta?diagnose=${id}`).then((x) => x.json()).catch(() => ({ lines: ['Couldn’t reach Meta.'] }))
    setDiag((d) => ({ ...d, [id]: r.lines ?? [r.error ?? 'No details.'] }))
  }
  if (!ads.promotions.length) return null
  const clear = async (p?: PromotionRow) => {
    const id = p?.id
    setBusy(id ?? 'all'); setError(null)
    const res = await fetch(id ? `${api(p!)}?id=${id}&action=clear` : '/api/ads/meta?action=clearFailed', { method: 'PATCH' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); onChange()
  }
  const failedCount = ads.promotions.filter((p) => p.status === 'failed' && p.network !== 'tiktok').length
  const api = (p: PromotionRow) => (p.network === 'tiktok' ? '/api/ads/tiktok' : '/api/ads/meta')
  const act = async (p: PromotionRow, action: 'pause' | 'resume' | 'stop') => {
    const id = p.id
    if (action === 'stop' && !confirm('Stop this promotion for good? Spend so far stays charged.')) return
    setBusy(id); setError(null)
    const res = await fetch(`${api(p)}?id=${id}&action=${action}`, { method: 'PATCH' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Something went wrong.')
    setBusy(null); onChange()
  }
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={label}>Promoted</span><span style={{ flex: 1, height: 1, background: C.rule }} />
        {failedCount > 1 && <button style={{ ...btn('ghost'), padding: '5px 11px', fontSize: 12.5 }} disabled={busy === 'all'} onClick={() => clear()}>{busy === 'all' ? 'Clearing…' : `Clear ${failedCount} failed`}</button>}
      </div>
      {error && <p style={{ color: C.red, margin: 0, fontSize: 13 }}>{error}</p>}
      {ads.promotions.map((p) => {
        const app = apps.find((a) => a.id === p.app_id)
        const tiktok = p.network === 'tiktok'
        const d = p.results?.delivery
        const s = tiktok
          ? (p.status === 'active' && d === 'in_review' ? { text: 'In TikTok review', color: C.amber }
            : p.status === 'active' && d === 'rejected' ? { text: 'Rejected by TikTok', color: C.red }
            : p.status === 'active' && d === 'scheduled' ? { text: 'Scheduled', color: C.ink2 }
            : p.status === 'active' && d === 'no_funds' ? { text: 'Needs payment', color: C.red }
            : PSTATUS[p.status] ?? PSTATUS.creating)
          : p.status === 'active' && d === 'PENDING_REVIEW' ? { text: 'In Meta review', color: C.amber }
          : p.status === 'active' && d === 'DISAPPROVED' ? { text: 'Rejected by Meta', color: C.red }
          : p.status === 'active' && d === 'WITH_ISSUES' ? { text: 'Running with issues', color: C.amber }
          : PSTATUS[p.status] ?? PSTATUS.creating
        const r = p.results
        const mr = tiktok ? null : (r as PromoResults | null), tr = tiktok ? (r as TikTokResults | null) : null
        const ma = tiktok ? null : (p.audience as Audience), ta = tiktok ? (p.audience as TikTokAudience) : null
        const ages = ta ? (ta.ageGroups ?? []).map((g) => ({ AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_54: '45–54', AGE_55_100: '55+' } as Record<string, string>)[g] ?? g).join(', ') : ''
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
                {p.campaign_id && p.status !== 'failed' && !tiktok && <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1468518541834459&selected_campaign_ids=${p.campaign_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.ink2 }}>Ads Manager ↗</a>}
                {tiktok && p.adsManager && p.status !== 'failed' && <a href={p.adsManager} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.ink2 }}>Ads Manager ↗</a>}
                {tiktok && <span style={{ fontSize: 12.5, color: C.soft }}>{p.goal === 'views' ? 'Views' : 'Downloads'} · Spark Ad</span>}
              </div>
              {ma && <span style={{ fontSize: 12.5, color: C.ink2 }}>
                {ma.ageMin}–{ma.ageMax}{ma.ageMax >= 65 ? '+' : ''} · {ma.genders === 'all' ? 'everyone' : ma.genders}
                {' · '}<span title={ma.places.map((x) => x.name).join(', ')}>{ma.places.length > 4 ? `${ma.places.slice(0, 3).map((x) => x.name).join(', ')} +${ma.places.length - 3} more places` : ma.places.map((x) => x.name).join(', ')}</span>
                {ma.interests.length > 0 && <span title={ma.interests.map((x) => x.name).join(', ')}>{' · '}{ma.interests.length > 3 ? `${ma.interests.slice(0, 2).map((x) => x.name).join(', ')} +${ma.interests.length - 2} interests` : ma.interests.map((x) => x.name).join(', ')}</span>}
              </span>}
              {ta && <span style={{ fontSize: 12.5, color: C.ink2 }}>
                {ages || 'all ages'} · {ta.gender === 'all' ? 'everyone' : ta.gender} · {(ta.locations ?? []).map((x) => x.name).join(', ') || 'no location'}
                {(ta.interests ?? []).length > 0 && ` · ${ta.interests.map((x) => x.name).join(', ')}`}
                {(ta.hashtags ?? []).length > 0 && ` · ${ta.hashtags.map((x) => `#${x.name}`).join(' ')}`}
              </span>}
              {mr && <span style={{ fontSize: 13 }}><b>{usd(mr.spend_cents)}</b> spent · {big(mr.reach)} reached · {big(mr.impressions)} views · {mr.engagements || mr.clicks} {mr.engagements ? 'engagements' : 'clicks'}{mr.delivery && mr.delivery !== 'ACTIVE' && p.status === 'active' ? ` · Meta: ${mr.delivery.toLowerCase().replace(/_/g, ' ')}` : ''}</span>}
              {tr && <span style={{ fontSize: 13 }}><b>{usd(tr.spend_cents)}</b> spent · {big(tr.impressions)} impressions · {big(tr.clicks)} clicks{tr.views_15s != null ? ` · ${big(tr.views_15s)} 15-s views` : ''}{tr.follows != null ? ` · ${big(tr.follows)} follows` : ''}{tr.status_detail ? ` · TikTok: ${tr.status_detail.toLowerCase().replace(/^ad_status_/, '').replace(/_/g, ' ')}` : ''}</span>}
              {p.error && <span style={{ fontSize: 12, color: C.red }}>{p.error}</span>}
              {r?.review && <span style={{ fontSize: 12, color: C.red }}>{tiktok ? 'TikTok' : 'Meta'}: {r.review}</span>}
              {tiktok && p.status === 'active' && d === 'in_review' && <span style={{ fontSize: 12, color: C.ink2 }}>TikTok reviews new ads before showing them, usually within a day.</span>}
              {p.campaign_id && !tiktok && <button onClick={() => diagnose(p.id)} style={{ justifySelf: 'start', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.ink2, textDecoration: 'underline' }}>{diag[p.id] && diag[p.id] !== 'loading' ? 'Hide details' : diag[p.id] === 'loading' ? 'Asking Meta…' : 'What does Meta say?'}</button>}
              {Array.isArray(diag[p.id]) && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.ink2, display: 'grid', gap: 2 }}>{(diag[p.id] as string[]).map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {!tiktok && p.status === 'active' && d === 'PENDING_REVIEW' && <span style={{ fontSize: 12, color: C.ink2 }}>Meta reviews new ads before showing them, usually within a few hours. The Download button only appears on the Sponsored copy, not the regular post.</span>}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(p.status === 'active' || p.status === 'paused') && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => act(p, p.status === 'active' ? 'pause' : 'resume')}>{p.status === 'active' ? 'Pause' : 'Resume'}</button>}
              {(p.status === 'active' || p.status === 'paused') && <button style={{ ...btn('ghost'), color: C.red }} disabled={busy === p.id} onClick={() => act(p, 'stop')}>Stop</button>}
              {(p.status === 'failed' || p.status === 'ended') && <button style={btn('ghost')} disabled={busy === p.id} onClick={() => clear(p)}>Clear</button>}
            </div>
          </article>
        )
      })}
    </section>
  )
}
