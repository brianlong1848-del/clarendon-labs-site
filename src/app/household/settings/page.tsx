'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AdminShell, C, Label, btn } from '@/components/AdminNav'
import { HouseholdTabs, Pill, card, usd, ago, useHousehold, post, input } from '@/components/household/shared'
import type { Bucket } from '@/lib/household/portfolio'

// Household → Settings: connect an account (by type), target allocation, cash
// buffer, goals, notes, FMP status, advisor schedule, members.

type Settings = { target_allocation: Record<Bucket, number>; cash_buffer_months: number; goals: { name: string; target_cents: number; by: string | null }[]; risk_note: string; tax_bracket_note: string; advisor_schedule: { weekday: number; hour_ct: number }; watchlist: string[]; asset_class_overrides: Record<string, Bucket> }
type Data = { settings: Settings; fmp: { configured: boolean; callsToday: number; cap: number; lastError: string | null; lastCallAt: string | null; marketOpen: boolean } | null; members: { email: string; display_name: string | null }[]; advisorModel: string; plaidSandbox: boolean }
type Item = { id: string; institution: string | null; status: string; last_synced_at: string | null; last_error: string | null; products: string[]; accounts: { id: string; name: string | null; mask: string | null; account_type: string | null }[] }

const BUCKETS: { key: Bucket; label: string }[] = [{ key: 'equity_us', label: 'US stocks' }, { key: 'equity_intl', label: 'International stocks' }, { key: 'bonds', label: 'Bonds' }, { key: 'cash', label: 'Cash' }, { key: 'other', label: 'Other' }]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

declare global { interface Window { Plaid?: { create: (cfg: unknown) => { open: () => void } } } }
function loadPlaid(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve()
    const s = document.createElement('script')
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load Plaid Link'))
    document.head.appendChild(s)
  })
}

export default function HouseholdSettings() {
  const { data: d, updating, error, reload } = useHousehold<Data>('/api/household/settings')
  const [items, setItems] = useState<Item[] | null>(null)
  const [kind, setKind] = useState<'bank' | 'brokerage'>('brokerage')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  useEffect(() => { if (d && !draft) setDraft(d.settings) }, [d, draft])
  const loadItems = async () => { const r = await fetch('/api/household/sync').then((r) => r.json()).catch(() => ({})); if (Array.isArray(r.items)) setItems(r.items) }
  useEffect(() => { loadItems() }, [])

  async function save(key: keyof Settings, value: unknown) {
    setBusy(true); setMsg(null)
    try { await post('/api/household/settings', { key, value }, 'PATCH'); setMsg({ text: 'Saved.' }); await reload() }
    catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  // Plaid Link, household scope. OAuth banks come back with ?oauth_state_id=; the token is parked in sessionStorage.
  const PENDING = 'clarendon:household-plaid-link'
  function openLink(token: string, opts: { itemId?: string; kind: 'bank' | 'brokerage'; resume?: boolean }) {
    window.Plaid!.create({
      token, ...(opts.resume ? { receivedRedirectUri: window.location.href } : {}),
      onSuccess: async (public_token: string) => {
        try { sessionStorage.removeItem(PENDING) } catch { /* ignore */ }
        try {
          if (!opts.itemId) {
            const r = await post('/api/money/plaid/exchange', { public_token, scope: 'household', kind: opts.kind })
            setMsg({ text: `Connected ${r.institution ?? 'the institution'} — ${r.accounts} account(s). ${r.investments?.holdings != null ? `${r.investments.holdings} positions.` : ''} ${r.sync?.added != null ? `${r.sync.added} transactions so far; more arrive on their own.` : ''}` })
          } else setMsg({ text: 'Reconnected.' })
          await loadItems(); await reload()
        } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
        setBusy(false)
        if (opts.resume) window.history.replaceState(null, '', window.location.pathname)
      },
      onExit: () => { setBusy(false); try { sessionStorage.removeItem(PENDING) } catch { /* ignore */ } },
    }).open()
  }
  async function connect(itemId?: string) {
    setBusy(true); setMsg(null)
    try {
      const { link_token } = await post('/api/money/plaid/link-token', itemId ? { itemId } : { kind })
      try { sessionStorage.setItem(PENDING, JSON.stringify({ token: link_token, itemId, kind })) } catch { /* ignore */ }
      await loadPlaid(); openLink(link_token, { itemId, kind })
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }); setBusy(false) }
  }
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('oauth_state_id')) return
    let saved: { token: string; itemId?: string; kind: 'bank' | 'brokerage' } | null = null
    try { saved = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') } catch { saved = null }
    if (!saved?.token) { setMsg({ text: 'The bank sign-in came back, but the Link session expired. Press Connect again.', bad: true }); return }
    setBusy(true)
    loadPlaid().then(() => openLink(saved!.token, { itemId: saved!.itemId, kind: saved!.kind, resume: true })).catch((e) => { setMsg({ text: (e as Error).message, bad: true }); setBusy(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function run(path: string, body: object, ok: (d: any) => string) {
    setBusy(true); setMsg(null)
    try { const r = await post(path, body); setMsg({ text: ok(r) }); await loadItems(); await reload() } catch (e) { setMsg({ text: (e as Error).message, bad: true }) }
    setBusy(false)
  }

  const sum = draft ? BUCKETS.reduce((n, b) => n + (draft.target_allocation[b.key] ?? 0), 0) : 100
  const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em' }
  const p: React.CSSProperties = { color: C.ink2, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }

  return (
    <AdminShell title="Household · Settings" subtitle="Accounts, targets, goals and how the advisor runs" actions={updating ? <Pill>Updating…</Pill> : undefined}>
      <HouseholdTabs />
      {error && <p style={{ color: C.red, margin: 0 }}>{error}</p>}
      {msg && <p style={{ color: msg.bad ? C.red : C.mint, margin: 0, fontSize: 13.5 }}>{msg.text}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
        {/* Connect */}
        <div data-card style={card}>
          <h2 style={h2}>Connect an account</h2>
          <p style={p}>Say what it is first. Banks and cards share transactions; brokerages, retirement and HSA accounts share holdings and trades. Everything here is personal and never touches the Clarendon books.</p>
          <p style={{ ...p, fontSize: 13, padding: '10px 12px', background: C.card2, borderRadius: 10 }}>
            Plaid shares the account&rsquo;s name, type, last four digits, balances, positions and transactions, never your login. Used only to show the two of you your own picture and to generate planning suggestions; stored encrypted; revoked when you disconnect. <a href="/admin/privacy" target="_blank" rel="noreferrer" style={{ color: C.mint }}>Privacy policy</a>.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'bank' | 'brokerage')} style={{ ...input, width: 'auto' }}>
              <option value="brokerage">Brokerage / retirement / HSA</option>
              <option value="bank">Bank or card</option>
            </select>
            <button style={btn('mint')} disabled={busy} onClick={() => connect()}>Connect with Plaid</button>
            {d?.plaidSandbox && <button style={btn('ghost')} disabled={busy} title="Plaid sandbox: a fake institution with investment accounts, for testing until Plaid approves Investments"
              onClick={() => run('/api/money/plaid/sandbox-link', { scope: 'household', kind }, (r) => `Test ${kind} added — ${r.accounts} account(s)${r.investments?.holdings != null ? `, ${r.investments.holdings} positions` : ''}.`)}>Add test {kind} (sandbox)</button>}
          </div>
          {kind === 'brokerage' && <p style={{ ...p, margin: '12px 0 0', fontSize: 12.5 }}>Until Plaid approves the Investments product for this account, a real brokerage link may be refused; the sandbox button exercises the same pipeline with fake positions.</p>}

          <div style={{ marginTop: 18 }}>
            <Label>Connected</Label>
            {items === null && <div style={{ color: C.soft, fontSize: 13.5, marginTop: 6 }}>Loading…</div>}
            {items?.length === 0 && <div style={{ color: C.soft, fontSize: 13.5, marginTop: 6 }}>Nothing connected yet.</div>}
            {items?.map((it) => (
              <div key={it.id} style={{ padding: '10px 0', borderTop: `1px solid ${C.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span><b>{it.institution ?? 'Institution'}</b> <span style={{ color: C.soft, fontSize: 12.5 }}>· {it.products.join(' + ')} · synced {ago(it.last_synced_at)}</span></span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {it.status === 'ok' ? <Pill tone="teal">Healthy</Pill> : <button style={btn('solid')} disabled={busy} onClick={() => connect(it.id)}>Needs re-login — reconnect</button>}
                    <button style={{ ...btn('ghost'), padding: '6px 10px' }} disabled={busy} onClick={() => {
                      if (window.confirm(`Disconnect ${it.institution ?? 'this institution'}? The connection is revoked at Plaid and its token erased. Imported history stays.`))
                        run('/api/money/plaid/disconnect', { itemId: it.id }, () => `${it.institution ?? 'Institution'} disconnected.`)
                    }}>Disconnect</button>
                  </span>
                </div>
                {it.last_error && <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4 }}>{it.last_error}</div>}
                {it.accounts.map((a) => <div key={a.id} style={{ color: C.ink2, fontSize: 13, marginTop: 3 }}>{a.name ?? 'Account'}{a.mask ? ` ···${a.mask}` : ''} · {a.account_type ?? 'account'}</div>)}
              </div>
            ))}
          </div>
        </div>

        {/* Target allocation */}
        {draft && (
          <div data-card style={card}>
            <h2 style={h2}>Target allocation</h2>
            <p style={p}>Where you want the investable money to sit. The Overview shows drift against this; the advisor suggests rebalancing past 5 points.</p>
            {BUCKETS.map((b) => (
              <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 48px', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 14 }}>
                <span>{b.label}</span>
                <input type="range" min={0} max={100} value={draft.target_allocation[b.key] ?? 0} onChange={(e) => setDraft({ ...draft, target_allocation: { ...draft.target_allocation, [b.key]: Number(e.target.value) } })} aria-label={b.label} />
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{draft.target_allocation[b.key] ?? 0}%</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 13, color: Math.abs(sum - 100) > 1 ? C.amber : C.soft }}>Total {sum}%{Math.abs(sum - 100) > 1 ? ' — needs to be 100%' : ''}</span>
              <button style={btn('ghost')} disabled={busy || Math.abs(sum - 100) > 1} onClick={() => save('target_allocation', draft.target_allocation)}>Save target</button>
            </div>

            <h2 style={{ ...h2, marginTop: 22 }}>Cash buffer</h2>
            <p style={p}>Months of spending to keep in cash before investing more.</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="number" min={1} max={24} step={0.5} style={{ ...input, width: 100 }} value={draft.cash_buffer_months} onChange={(e) => setDraft({ ...draft, cash_buffer_months: Number(e.target.value) })} />
              <span style={{ fontSize: 14, color: C.ink2 }}>months</span>
              <button style={btn('ghost')} disabled={busy} onClick={() => save('cash_buffer_months', draft.cash_buffer_months)}>Save</button>
            </div>

            <h2 style={{ ...h2, marginTop: 22 }}>Watchlist</h2>
            <p style={p}>Tickers to quote even if you don&apos;t hold them (comma-separated).</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input style={input} value={draft.watchlist.join(', ')} onChange={(e) => setDraft({ ...draft, watchlist: e.target.value.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) })} placeholder="VTI, BND" />
              <button style={btn('ghost')} disabled={busy} onClick={() => save('watchlist', draft.watchlist)}>Save</button>
            </div>
          </div>
        )}

        {/* Goals + notes */}
        {draft && (
          <div data-card style={card}>
            <h2 style={h2}>Goals</h2>
            <p style={p}>What the money is for. The advisor plans around these.</p>
            {draft.goals.map((g, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px auto', gap: 8, marginBottom: 8 }}>
                <input style={input} placeholder="Kitchen" value={g.name} onChange={(e) => { const goals = [...draft.goals]; goals[i] = { ...g, name: e.target.value }; setDraft({ ...draft, goals }) }} />
                <input style={input} type="number" placeholder="$" value={g.target_cents ? g.target_cents / 100 : ''} onChange={(e) => { const goals = [...draft.goals]; goals[i] = { ...g, target_cents: Math.round(Number(e.target.value) * 100) }; setDraft({ ...draft, goals }) }} />
                <input style={input} type="month" value={g.by ?? ''} onChange={(e) => { const goals = [...draft.goals]; goals[i] = { ...g, by: e.target.value || null }; setDraft({ ...draft, goals }) }} />
                <button style={{ ...btn('ghost'), padding: '8px 10px' }} onClick={() => setDraft({ ...draft, goals: draft.goals.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn('ghost')} onClick={() => setDraft({ ...draft, goals: [...draft.goals, { name: '', target_cents: 0, by: null }] })}>Add a goal</button>
              <button style={btn('ghost')} disabled={busy} onClick={() => save('goals', draft.goals)}>Save goals</button>
            </div>

            <h2 style={{ ...h2, marginTop: 22 }}>Notes for the advisor</h2>
            <Label>Risk and preferences</Label>
            <textarea style={{ ...input, minHeight: 80, marginTop: 6, marginBottom: 10 }} value={draft.risk_note} onChange={(e) => setDraft({ ...draft, risk_note: e.target.value })} placeholder="e.g. We're fine with volatility in the retirement accounts; the brokerage is for the house down payment in ~3 years." />
            <Label>Tax situation</Label>
            <textarea style={{ ...input, minHeight: 60, marginTop: 6 }} value={draft.tax_bracket_note} onChange={(e) => setDraft({ ...draft, tax_bracket_note: e.target.value })} placeholder="e.g. Married filing jointly, 24% bracket, Illinois. Brian is self-employed (Clarendon Labs LLC)." />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={btn('ghost')} disabled={busy} onClick={async () => { await save('risk_note', draft.risk_note); await save('tax_bracket_note', draft.tax_bracket_note) }}>Save notes</button>
            </div>
          </div>
        )}

        {/* Advisor + market data + members */}
        {draft && d && (
          <div data-card style={card}>
            <h2 style={h2}>Advisor schedule</h2>
            <p style={p}>The weekly brief runs on this day and hour (Central). Model: <code style={{ fontFamily: C.mono, fontSize: 12.5 }}>{d.advisorModel}</code>.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...input, width: 'auto' }} value={draft.advisor_schedule.weekday} onChange={(e) => setDraft({ ...draft, advisor_schedule: { ...draft.advisor_schedule, weekday: Number(e.target.value) } })}>
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
              <select style={{ ...input, width: 'auto' }} value={draft.advisor_schedule.hour_ct} onChange={(e) => setDraft({ ...draft, advisor_schedule: { ...draft.advisor_schedule, hour_ct: Number(e.target.value) } })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
              </select>
              <button style={btn('ghost')} disabled={busy} onClick={() => save('advisor_schedule', draft.advisor_schedule)}>Save</button>
            </div>

            <h2 style={{ ...h2, marginTop: 22 }}>Market data</h2>
            {d.fmp ? (
              <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.6 }}>
                Financial Modeling Prep {d.fmp.configured ? <Pill tone="teal">connected</Pill> : <Pill tone="loss">FMP_API_KEY missing</Pill>}<br />
                <b style={{ color: d.fmp.callsToday > d.fmp.cap * 0.8 ? C.amber : C.ink }}>{d.fmp.callsToday}</b> of {d.fmp.cap} calls used today{d.fmp.lastCallAt ? ` · last ${ago(d.fmp.lastCallAt)}` : ''}{d.fmp.lastError ? <span style={{ color: C.amber }}> · {d.fmp.lastError}</span> : ''}<br />
                <span style={{ fontSize: 12.5, color: C.soft }}>Free tier: one stock quote per call; ETF and fund quotes, news and CUSIP lookups need the Starter plan. Those positions show Plaid&apos;s close instead.</span>
                <div style={{ marginTop: 10 }}><button style={btn('ghost')} disabled={busy} onClick={() => run('/api/household/quotes', { force: true }, (r) => `Refreshed ${r.refresh.refreshed.length} quotes, skipped ${r.refresh.skipped.length}.`)}>Refresh prices now</button></div>
              </div>
            ) : <p style={p}>Server database not configured.</p>}

            <h2 style={{ ...h2, marginTop: 22 }}>Members</h2>
            <p style={{ ...p, margin: 0 }}>
              {d.members.map((m) => m.display_name ?? m.email).join(' and ')} see everything here. Manage sign-in and authenticators on <Link href="/admin/security" style={{ color: C.mint }}>Security</Link>.
            </p>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
