'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, btn } from '@/components/AdminNav'
import { tiktokPresetsFor, type TikTokPreset } from '@/lib/ads/presets'
import { Segmented, Toggle, card, label, type PublishApp, type QueuedPost } from './shared'

// ─── Boost on TikTok (FEAT-CLA-022) ──────────────────────────────────────────
//
// The TikTok half of the Promote sheet: goal (Downloads / Views), budget
// ($20/day floor), dates, audience (age groups, gender, locations, interests,
// hashtag interactions), per-app presets, the safe-zone reminder and the
// confirm. Talks to /api/ads/tiktok, which creates a Spark Ad campaign on the
// app's own ad account. Also: the picker for videos already on the app's
// TikTok account (posted from the phone), so they can be boosted too.

export type TTLocation = { id: string; name: string; level: string; parent?: string }
export type TTInterest = { id: string; name: string; kind: 'category' | 'keyword' }
export type TTHashtag = { id: string; name: string }
export type TikTokAudience = { ageGroups: string[]; gender: 'all' | 'men' | 'women'; locations: TTLocation[]; interests: TTInterest[]; hashtags: TTHashtag[] }
export type TikTokStatus = { ready: boolean; reasons: string[]; account?: { name: string; status: string; currency: string; timezone?: string }; identity?: { id: string; name: string }; limits: { maxDailyCents: number; maxTotalCents: number; minDailyCents: number; minAge: number } }
export type TikTokResults = { spend_cents: number; impressions: number; reach?: number; clicks: number; views15s?: number; video_views?: number; follows?: number; likes?: number; delivery?: string; status_detail?: string; review?: string }
export type TikTokAdsData = {
  status: TikTokStatus | Record<string, TikTokStatus>
  statusByApp: Record<string, TikTokStatus>
  goals: { id: string; label: string }[]
  defaults: TikTokAudience
  ageGroups: string[]
  limits: TikTokStatus['limits']
  promotions: unknown[]
}
export type TikTokVideo = { item_id: string; text?: string; cover?: string; created?: string; url?: string }
/** A video on the account, not in the Queue — boosted by item id. */
export type AccountVideo = { appId: string; itemId: string; caption?: string; cover?: string; permalink?: string }

export const AGE_LABEL: Record<string, string> = { AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_54: '45–54', AGE_55_100: '55+' }
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 ? 2 : 0 })
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const input: React.CSSProperties = { fontFamily: C.sans, fontSize: 14, padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.rule2}`, background: C.card, color: C.ink, width: '100%', boxSizing: 'border-box' }

/** A TikTok post can be boosted once it has a numeric video id (published, not a draft). */
export const tiktokTarget = (p: QueuedPost) => p.targets.find((t) => t.platform === 'tiktok' && t.status === 'published' && /^\d{6,}$/.test(t.remoteId ?? ''))

/** Which creative cut the file name says this is ("…lesbian-cut.mp4"). */
export function cutOf(p?: QueuedPost | null): 'lesbian' | 'gay' | undefined {
  const names = (p ? [...p.media, ...Object.values(p.media_overrides ?? {}).flatMap((l) => l ?? [])] : []).map((m) => m.url.toLowerCase())
  if (names.some((n) => /lesbian|sapphic|wlw/.test(n))) return 'lesbian'
  if (names.some((n) => /\bgay\b|-gay[-_.]|_gay|drag|rupaul/.test(n))) return 'gay'
  return undefined
}

function Search<T>({ app, kind, placeholder, onPick, render }: { app: string; kind: 'locations' | 'interests' | 'hashtags'; placeholder: string; onPick: (v: T) => void; render: (v: T) => string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<T[]>([])
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setHits([]); return }
    timer.current = setTimeout(async () => {
      setBusy(true)
      const r = await fetch(`/api/ads/tiktok?app=${app}&search=${kind}&q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => ({ results: [] }))
      setHits(r.results ?? []); setBusy(false)
    }, 350)
  }, [q, kind, app])
  return (
    <div style={{ position: 'relative' }}>
      <input style={input} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {busy && <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 12, color: C.soft }}>…</span>}
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

/** The TikTok form body — rendered inside the Promote sheet when "TikTok" is
 *  chosen on the platform switch, or for a video picked off the account. */
export function TikTokPromoteForm({ appId, post, video, tt, onDone }: { appId: string; post?: QueuedPost | null; video?: AccountVideo | null; tt: TikTokAdsData; onDone: () => void }) {
  const status = tt.statusByApp[appId] ?? (tt.status as TikTokStatus)
  const lim = status?.limits ?? tt.limits
  const kid = appId === 'jinglewire'
  const presets = tiktokPresetsFor(appId)
  const [goal, setGoal] = useState<'downloads' | 'views'>(presets[0]?.goal ?? 'downloads')
  const [daily, setDaily] = useState(String((presets[0]?.dailyUsd ?? 20)))
  const [start, setStart] = useState(localInput(new Date(Date.now() + 10 * 60_000)))
  const [end, setEnd] = useState(localInput(new Date(Date.now() + 7 * 864e5)))
  const [aud, setAud] = useState<TikTokAudience>({ ...tt.defaults, ageGroups: kid ? tt.defaults.ageGroups.filter((g) => g !== 'AGE_18_24') : tt.defaults.ageGroups })
  const [presetId, setPresetId] = useState('')
  const [resolving, setResolving] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [audienceName, setAudienceName] = useState('')
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cut = cutOf(post)

  // A preset names its interests and hashtags; TikTok's ids come from its
  // own search, one exact match each. Anything it can't find is listed.
  const applyPreset = async (p: TikTokPreset) => {
    setPresetId(p.id); setSkipped([])
    if (p.goal) setGoal(p.goal)
    if (p.dailyUsd) setDaily(String(p.dailyUsd))
    if (p.days) setEnd(localInput(new Date(Date.parse(start) + p.days * 864e5)))
    setAudienceName(p.name.replace(/\s*·\s*/g, ' '))
    setResolving(p.name)
    const miss: string[] = []
    const find = async <T extends { name: string }>(kind: 'interests' | 'hashtags', name: string): Promise<T | undefined> => {
      const r = await fetch(`/api/ads/tiktok?app=${appId}&search=${kind}&q=${encodeURIComponent(name)}`).then((x) => x.json()).catch(() => ({ results: [] }))
      const list: T[] = r.results ?? []
      const clean = (s: string) => s.toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}]/gu, '')
      return list.find((x) => clean(x.name) === clean(name)) ?? (kind === 'interests' ? list.find((x) => clean(x.name).includes(clean(name))) : undefined)
    }
    const interests: TTInterest[] = [], hashtags: TTHashtag[] = []
    for (const n of p.audience.interestNames) { const h = await find<TTInterest>('interests', n); if (h) interests.push(h); else miss.push(`interest “${n}”`) }
    for (const n of p.audience.hashtagNames) { const h = await find<TTHashtag>('hashtags', n); if (h) hashtags.push(h); else miss.push(`#${n}`) }
    setAud({ ageGroups: p.audience.ageGroups, gender: p.audience.gender, locations: p.audience.locations, interests, hashtags })
    setSkipped(miss); setResolving(null)
  }
  useEffect(() => { if (presets[0]) applyPreset(presets[0]) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = presets.find((p) => p.id === presetId)
  const dailyCents = Math.round(Number(daily) * 100) || 0
  const days = Math.max(0, Math.ceil((Date.parse(end) - Math.max(Date.parse(start), Date.now())) / 864e5))
  const total = dailyCents * days
  const minAge = useMemo(() => Math.min(...aud.ageGroups.map((g) => Number(g.split('_')[1]) || 99), 99), [aud.ageGroups])

  const problems: string[] = []
  if (dailyCents < lim.minDailyCents) problems.push(`TikTok needs at least ${usd(lim.minDailyCents)} a day.`)
  if (dailyCents > lim.maxDailyCents) problems.push(`Daily budget is capped at ${usd(lim.maxDailyCents)}.`)
  if (total > lim.maxTotalCents) problems.push(`Total would be up to ${usd(total)}; the cap per promotion is ${usd(lim.maxTotalCents)}.`)
  if (days < 1) problems.push('Run it for at least one day.')
  if (!aud.ageGroups.length) problems.push('Pick at least one age group.')
  if (kid && minAge < 25) problems.push('Jinglewire ads go to parents: 25 and older.')
  if (kid && (aud.interests.length || aud.hashtags.length)) problems.push('Jinglewire ads use no interest or hashtag targeting.')
  if (!aud.locations.length) problems.push('Pick at least one location.')
  if (goal === 'downloads' && !['rolligan', 'gagorder', 'borea'].includes(appId)) problems.push('This app isn’t on the App Store yet — pick Views.')
  const wrongCut = current?.cut && cut && current.cut !== cut

  const submit = async () => {
    const what = goal === 'downloads' ? 'Downloads (Download now button)' : 'Views (15-second views)'
    if (!confirm(`Boost this TikTok post for ${usd(dailyCents)}/day, up to ${usd(total)} in total — ${what}${paused ? ', created PAUSED' : ''}? TikTok charges the card on file.`)) return
    setBusy(true); setError(null)
    const res = await fetch('/api/ads/tiktok', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(post ? { postId: post.id } : { appId, itemId: video?.itemId, permalink: video?.permalink }),
        goal, dailyBudgetCents: dailyCents, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), audience: aud, audienceName, paused,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); return }
    onDone()
  }

  const row = (title: string, children: React.ReactNode) => (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}><span style={label}>{title}</span>{children}</div>
  )

  return (
    <>
      {!status?.ready && (
        <div style={{ background: '#FBF0DD', borderRadius: 12, padding: 14, fontSize: 13.5, color: C.amber, display: 'grid', gap: 6 }}>
          <b>TikTok boosting isn’t switched on yet</b>
          {(status?.reasons ?? ['TikTok isn’t connected.']).map((r, i) => <span key={i}>{r}</span>)}
        </div>
      )}
      {status?.identity && <span style={{ fontSize: 12.5, color: C.ink2 }}>Runs as <b>@{status.identity.name.replace(/^@/, '')}</b> on the {status.account?.name ?? appId} ad account · Spark Ad, so the post keeps its likes and comments.</span>}

      {row('Audience preset', (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ ...input, width: 'auto', flex: 1, minWidth: 220 }} value={presetId}
              onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) applyPreset(p); else setPresetId('') }}>
              <option value="">Custom (no preset)</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {resolving && <span style={{ fontSize: 12.5, color: C.soft }}>Looking up hashtags and interests on TikTok…</span>}
          </div>
          {current?.note && <span style={{ fontSize: 12.5, color: C.ink2 }}>{current.note}</span>}
          {skipped.length > 0 && <span style={{ fontSize: 12.5, color: C.amber }}>TikTok has no targeting match for {skipped.join(', ')} — left out.</span>}
          {wrongCut && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.red }}>This file name says it’s the {cut} cut, but the preset is for the {current?.cut} cut. One audience per cut — pick the other preset.</span>}
        </div>
      ))}
      {row('Goal', (
        <div style={{ display: 'grid', gap: 6 }}>
          {tt.goals.map((g) => (
            <label key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" name="tt-goal" checked={goal === g.id} onChange={() => setGoal(g.id as 'downloads' | 'views')} />{g.label}
            </label>
          ))}
          {goal === 'downloads' && <span style={{ fontSize: 12.5, color: C.ink2 }}>Download now → clarendon.dev/get/{appId}?ct=tt-… (Apple campaign token), straight to the App Store.</span>}
        </div>
      ))}
      {row('Daily budget (USD)', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 160 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.soft, fontSize: 14 }}>$</span>
            <input style={{ ...input, paddingLeft: 22 }} type="number" min={lim.minDailyCents / 100} step={1} value={daily} onChange={(e) => setDaily(e.target.value)} />
          </div>
          <span style={{ fontSize: 12.5, color: C.soft }}>TikTok’s floor is {usd(lim.minDailyCents)}/day</span>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {row('Starts', <input style={{ ...input, minWidth: 0 }} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />)}
        {row('Ends', <input style={{ ...input, minWidth: 0 }} type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />)}
      </div>

      {row('Who sees it', (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5 }}>Ages</span>
            {tt.ageGroups.map((g) => {
              const on = aud.ageGroups.includes(g), locked = kid && g === 'AGE_18_24'
              return (
                <button key={g} disabled={locked} aria-pressed={on} onClick={() => { setPresetId(''); setAud({ ...aud, ageGroups: on ? aud.ageGroups.filter((x) => x !== g) : [...aud.ageGroups, g].sort() }) }}
                  style={{ borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: locked ? 'not-allowed' : 'pointer', fontFamily: C.sans,
                           border: `1px solid ${on ? C.ink : C.rule2}`, background: on ? C.ink : C.card, color: on ? '#fff' : locked ? C.faint : C.ink }}>{AGE_LABEL[g] ?? g}</button>
              )
            })}
            <span style={{ flex: 1 }} />
            <Segmented value={aud.gender} onChange={(v) => setAud({ ...aud, gender: v })}
              options={[{ value: 'all', label: 'Everyone' }, { value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }]} />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Search<TTLocation> app={appId} kind="locations" placeholder="Add a country, state or city…" render={(l) => `${l.name}${l.parent ? `, ${l.parent}` : ''} · ${l.level.toLowerCase()}`}
              onPick={(l) => !aud.locations.some((x) => x.id === l.id) && setAud({ ...aud, locations: [...aud.locations, l] })} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {aud.locations.map((l) => <Chip key={l.id} text={l.name} onRemove={() => { setPresetId(''); setAud({ ...aud, locations: aud.locations.filter((x) => x.id !== l.id) }) }} />)}
            </div>
          </div>
          {!kid && (
            <>
              <div style={{ display: 'grid', gap: 8 }}>
                <Search<TTInterest> app={appId} kind="interests" placeholder="Add an interest (e.g. Board games, Pride)…" render={(i) => `${i.name} · ${i.kind}`}
                  onPick={(i) => !aud.interests.some((x) => x.id === i.id) && setAud({ ...aud, interests: [...aud.interests, i] })} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {aud.interests.map((i) => <Chip key={i.id} text={i.name} onRemove={() => setAud({ ...aud, interests: aud.interests.filter((x) => x.id !== i.id) })} />)}
                  {!aud.interests.length && <span style={{ fontSize: 12.5, color: C.soft }}>No interests: anyone in these places and ages.</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Search<TTHashtag> app={appId} kind="hashtags" placeholder="Add hashtag interactions (e.g. sapphic, rupaulsdragrace)…" render={(h) => `#${h.name}`}
                  onPick={(h) => !aud.hashtags.some((x) => x.id === h.id) && setAud({ ...aud, hashtags: [...aud.hashtags, h] })} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {aud.hashtags.map((h) => <Chip key={h.id} text={`#${h.name}`} onRemove={() => setAud({ ...aud, hashtags: aud.hashtags.filter((x) => x.id !== h.id) })} />)}
                  {!aud.hashtags.length && <span style={{ fontSize: 12.5, color: C.soft }}>Hashtags reach people who watched, liked, commented on or shared videos with them.</span>}
                </div>
              </div>
            </>
          )}
          <span style={{ fontSize: 12, color: C.soft }}>Smart interests & behaviours stay off, so TikTok doesn’t widen this audience. TikTok gives no audience-size estimate through the API; Ads Manager shows one.</span>
        </div>
      ))}
      {row('Audience name (for the campaign title)', <input style={input} value={audienceName} onChange={(e) => setAudienceName(e.target.value)} placeholder="e.g. US 18-44 sapphic" maxLength={60} />)}

      <div style={{ background: '#FBF0DD', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: C.amber, lineHeight: 1.5 }}>
        <b>Safe zone (FEAT-CLA-020):</b> a promoted TikTok gets “Sponsored” and a full-width button over the bottom third. On 1080×1920, keep every word inside x 120–780, y 240–1260 — nothing under the right-hand action column. Check it in the Preview with the overlay on.
      </div>

      <div style={{ background: C.card2, borderRadius: 12, padding: 14, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5, alignItems: 'center' }}>
        <span><span style={label}>Total, up to</span><br /><b style={{ fontSize: 18 }}>{usd(total)}</b> <span style={{ color: C.soft }}>· {days} day{days === 1 ? '' : 's'}</span></span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <Toggle on={paused} onChange={setPaused} label="Create paused" />
          Create paused — check it in Ads Manager, then Resume
        </label>
      </div>
      {kid && <p style={{ margin: 0, fontSize: 12.5, color: C.ink2 }}>Jinglewire is for kids, so its ads go to parents only (25+) with no interest or behaviour targeting. Nothing is tracked back to the app.</p>}
      {problems.length > 0 && <p style={{ margin: 0, fontSize: 13, color: C.amber }}>{problems.join(' ')}</p>}
      {error && <p style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
      <button style={btn('mint')} disabled={busy || !status?.ready || problems.length > 0 || !!resolving} onClick={submit}>
        {busy ? 'Setting it up with TikTok…' : `Boost on TikTok · ${usd(dailyCents)}/day${paused ? ' · paused' : ''}`}
      </button>
    </>
  )
}

/** Pick a video already on the app's TikTok account (posted from anywhere). */
export function TikTokVideoPicker({ app, onPick, onClose }: { app: PublishApp; onPick: (v: AccountVideo) => void; onClose: () => void }) {
  const [videos, setVideos] = useState<TikTokVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/ads/tiktok?app=${app.id}&videos=1`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`); setVideos(b.videos ?? []) })
      .catch((e) => setError(e.message))
  }, [app.id])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Boost a TikTok video" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.35)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(560px, 100%)', maxHeight: '92vh', overflow: 'auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={app.icon} alt="" width={26} height={26} style={{ borderRadius: 7 }} />
          <b style={{ fontSize: 17, flex: 1 }}>Boost a video on {app.name}’s TikTok</b>
          <button onClick={onClose} style={{ ...btn('ghost'), padding: '6px 10px' }}>Close</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: C.ink2 }}>Videos the account has already published, including ones posted from the phone. Pick one to boost it as a Spark Ad.</p>
        {error && <p style={{ margin: 0, fontSize: 13, color: C.red }}>{error}</p>}
        {!videos && !error && <p style={{ margin: 0, fontSize: 13, color: C.soft }}>Asking TikTok…</p>}
        {videos && videos.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.soft }}>TikTok returned no videos for this account’s Spark Ad identity.</p>}
        {videos && videos.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {videos.map((v) => (
              <button key={v.item_id} onClick={() => onPick({ appId: app.id, itemId: v.item_id, caption: v.text, cover: v.cover, permalink: v.url })}
                style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', gap: 12, alignItems: 'center', textAlign: 'left', border: `1px solid ${C.rule}`, borderRadius: 12, padding: 8, background: C.card, cursor: 'pointer', fontFamily: C.sans }}>
                <span style={{ width: 56, height: 72, borderRadius: 8, overflow: 'hidden', background: C.card2, display: 'block' }}>{v.cover && <img src={v.cover} alt="" width={56} height={72} style={{ objectFit: 'cover', display: 'block' }} />}</span>
                <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text || 'No caption'}</span>
                  <span style={{ fontSize: 12, color: C.soft }}>video {v.item_id}{v.created ? ` · ${v.created}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>, document.body)
}
