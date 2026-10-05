'use client'
import { useCallback, useEffect, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn } from '@/components/AdminNav'

// Money → Ads: every campaign on every app, with spend, installs, cost per
// install and two ROAS figures (see /api/money/ads for the difference).
// ROAS under 1× shows red: that campaign is spending more than it's bringing in.

type Campaign = {
  platform: string; app_slug: string | null; campaign_id: string; name: string; first_day: string; last_day: string
  spend_cents: number; impressions: number; clicks: number; installs: number; ctr: number | null; cpi_cents: number | null
  platform_value_cents: number; platform_roas: number | null; est_proceeds_cents: number; est_roas: number | null
  daily_spend: { day: string; cents: number }[]
}
type AppRow = { app_slug: string; spend_cents: number; installs: number; cpi_cents: number | null; proceeds_cents: number; blended_roas: number | null }
type Data = {
  days: number; last_sync: string | null
  totals: { spend_cents: number; installs: number; proceeds_cents: number; cpi_cents: number | null; blended_roas: number | null }
  apps: AppRow[]; campaigns: Campaign[]; app_names: { slug: string; name: string }[]
}

const usd = (c: number | null) => (c == null ? '—' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 16 }
const label: React.CSSProperties = { fontSize: 11.5, fontFamily: C.mono, letterSpacing: '.08em', textTransform: 'uppercase', color: C.soft }
const th: React.CSSProperties = { ...label, textAlign: 'right', padding: '8px 10px', fontWeight: 500, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { textAlign: 'right', padding: '10px', fontSize: 14, whiteSpace: 'nowrap', borderTop: `1px solid ${C.rule}` }

function Roas({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: C.soft }}>—</span>
  return <span style={{ fontWeight: 700, color: v < 1 ? C.red : C.mint }}>{v.toFixed(2)}×</span>
}

function Spark({ points }: { points: { day: string; cents: number }[] }) {
  if (points.length < 2) return null
  const max = Math.max(...points.map((p) => p.cents), 1)
  const w = 70, h = 20
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * w},${h - (p.cents / max) * h}`).join(' ')
  return <svg width={w} height={h} aria-hidden style={{ display: 'block' }}><path d={d} fill="none" stroke={C.mint} strokeWidth={1.6} /></svg>
}

export default function Ads() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/money/ads?days=${days}`).catch(() => null)
    if (r?.status === 401) { window.location.href = '/login'; return }
    if (r?.ok) setD(await r.json()); else setMsg({ text: 'Could not load ad data.', bad: true })
  }, [days])
  useEffect(() => { load() }, [load])

  async function sync() {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/cron/ad-spend?days=${Math.max(days, 30)}`).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (!r?.ok || !j) setMsg({ text: 'Sync failed.', bad: true })
    else {
      const parts = Object.entries(j.results as Record<string, { rows?: number; error?: string; skipped?: string }>)
        .map(([app, v]) => `${app}: ${v.error ? `error — ${v.error}` : v.skipped ? v.skipped : `${v.rows} campaign-days`}`)
      setMsg({ text: `Synced ${j.window.start} → ${j.window.end}. ${parts.join(' · ')}`, bad: parts.some((p) => p.includes('error')) })
      await load()
    }
    setBusy(false)
  }

  const name = (slug: string | null) => d?.app_names.find((a) => a.slug === slug)?.name ?? slug ?? 'Shared'

  return (
    <AdminShell title="Money · Ads" subtitle="Every campaign, what it cost, and what it brought back"
      actions={<button style={btn('ghost')} disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync now'}</button>}>
      <MoneyTabs />
      <div style={{ padding: '24px 0', maxWidth: 1180 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[7, 30, 90, 365].map((n) => (
            <button key={n} onClick={() => setDays(n)} style={{ ...btn(n === days ? 'solid' : 'ghost'), padding: '7px 12px' }}>{n === 365 ? '1 year' : `${n} days`}</button>
          ))}
        </div>
        {msg && <p style={{ color: msg.bad ? C.red : C.mint, fontSize: 13.5, margin: '0 0 14px' }}>{msg.text}</p>}
        {!d && <p style={{ color: C.soft }}>Loading…</p>}
        {d && (
          <>
            <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                ['Ad spend', usd(d.totals.spend_cents)],
                ['Installs from ads', d.totals.installs.toLocaleString()],
                ['Cost per install', usd(d.totals.cpi_cents)],
                ['App Store proceeds', usd(d.totals.proceeds_cents)],
              ].map(([l, v]) => <div key={l}><div style={label}>{l}</div><div style={{ fontFamily: C.serif, fontSize: 28, fontWeight: 900, marginTop: 4 }}>{v}</div></div>)}
              <div><div style={label}>Blended ROAS</div><div style={{ fontFamily: C.serif, fontSize: 28, marginTop: 4 }}><Roas v={d.totals.blended_roas} /></div></div>
            </div>

            <div style={{ ...card, overflowX: 'auto' }}>
              <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 8px' }}>By app</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>App</th><th style={th}>Spend</th><th style={th}>Installs</th><th style={th}>CPI</th><th style={th}>Proceeds</th><th style={th}>Blended ROAS</th></tr></thead>
                <tbody>
                  {d.apps.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'left', color: C.soft }}>No ad spend in this window yet. Press “Sync now”.</td></tr>}
                  {d.apps.map((a) => (
                    <tr key={a.app_slug}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 650 }}>{name(a.app_slug)}</td>
                      <td style={td}>{usd(a.spend_cents)}</td><td style={td}>{a.installs}</td><td style={td}>{usd(a.cpi_cents)}</td>
                      <td style={td}>{usd(a.proceeds_cents)}</td><td style={td}><Roas v={a.blended_roas} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...card, overflowX: 'auto' }}>
              <h2 style={{ fontFamily: C.serif, fontSize: 20, margin: '0 0 8px' }}>Campaigns</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>Campaign</th><th style={th}>Spend</th><th style={th}></th><th style={th}>Impr.</th><th style={th}>CTR</th>
                  <th style={th}>Installs</th><th style={th}>CPI</th><th style={th} title="Purchase value TikTok attributes to this campaign">TikTok ROAS</th>
                  <th style={th} title="App Store proceeds credited by this campaign's share of the app's ad installs">Est. ROAS</th>
                </tr></thead>
                <tbody>
                  {d.campaigns.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'left', color: C.soft }}>No campaigns in this window.</td></tr>}
                  {d.campaigns.map((c) => (
                    <tr key={c.platform + c.campaign_id}>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 220 }}>
                        <b>{c.name}</b>
                        <div style={{ color: C.soft, fontSize: 12 }}>{name(c.app_slug)} · {c.platform === 'tiktok' ? 'TikTok' : 'Meta'} · {c.first_day} → {c.last_day}</div>
                      </td>
                      <td style={td}>{usd(c.spend_cents)}</td><td style={td}><Spark points={c.daily_spend} /></td>
                      <td style={td}>{c.impressions.toLocaleString()}</td><td style={td}>{c.ctr == null ? '—' : `${c.ctr}%`}</td>
                      <td style={td}>{c.installs}</td><td style={td}>{usd(c.cpi_cents)}</td>
                      <td style={td}><Roas v={c.platform_roas} /></td><td style={td}><Roas v={c.est_roas} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: C.soft, fontSize: 12.5, margin: '12px 0 0' }}>
                TikTok ROAS is the in-app purchase value TikTok attributes to the campaign. Est. ROAS credits the app&rsquo;s real App Store proceeds to each campaign by its share of that app&rsquo;s ad installs, so it&rsquo;s an estimate; the app-level blended ROAS is exact.
                {d.last_sync ? ` Last synced ${new Date(d.last_sync).toLocaleString()}.` : ''}
              </p>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}
