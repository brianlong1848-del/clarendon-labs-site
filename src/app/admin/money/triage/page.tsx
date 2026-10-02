'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { SCHEDULE_C, guessCategory } from '@/lib/money/categories'

// Triage: one unreviewed transaction at a time.
//   B → business, then 0 = shared / 1–6 = that app   ·   P = personal   ·   I = ignore   ·   Z = undo
// "Make this a rule" (R) toggles whether the same merchant is handled automatically from now on.

type Tx = {
  id: string; posted_on: string; amount_cents: number; merchant: string | null; raw_description: string | null
  plaid_category: string | null; account: { name: string | null; mask: string | null; ownership: string; institution: string | null } | null
}
type App = { slug: string; name: string }
type Last = { id: string; label: string }

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function Triage() {
  const [items, setItems] = useState<Tx[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [remaining, setRemaining] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [picking, setPicking] = useState(false)
  const [category, setCategory] = useState('software')
  const [makeRule, setMakeRule] = useState(true)
  const [last, setLast] = useState<Last | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/money/triage').catch(() => null)
    if (!res || !res.ok) { setLoaded(true); return }
    const d = await res.json(); setItems(d.items); setApps(d.apps); setRemaining(d.remaining); setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const cur = items[0]
  useEffect(() => { if (cur) { setCategory(guessCategory(cur.plaid_category)); setPicking(false) } }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const decide = useCallback(async (status: 'business' | 'personal' | 'ignored', app_slug: string | null = null) => {
    if (!cur || busy.current) return
    busy.current = true
    const res = await fetch('/api/money/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cur.id, status, app_slug, schedule_c: status === 'business' ? category : null, makeRule }) }).catch(() => null)
    busy.current = false
    if (!res || !res.ok) { setMsg('Could not save that — try again.'); return }
    const d = await res.json()
    const appName = app_slug ? apps.find((a) => a.slug === app_slug)?.name : 'shared'
    setLast({ id: cur.id, label: `${cur.merchant ?? 'Transaction'} → ${status}${status === 'business' ? ` (${appName})` : ''}` })
    setMsg(d.alsoApplied ? `Rule saved — ${d.alsoApplied} more from this merchant handled too.` : null)
    setPicking(false); await load()
  }, [cur, apps, category, makeRule, load])

  const undo = useCallback(async () => {
    if (!last || busy.current) return
    busy.current = true
    await fetch('/api/money/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: last.id, status: 'unreviewed' }) }).catch(() => null)
    busy.current = false; setLast(null); setMsg('Undone.'); await load()
  }, [last, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'SELECT') return
      const k = e.key.toLowerCase()
      if (picking && /^[0-9]$/.test(k)) {
        const n = Number(k)
        if (n === 0) decide('business', null)
        else if (apps[n - 1]) decide('business', apps[n - 1].slug)
        return
      }
      if (k === 'b' && cur) setPicking(true)
      else if (k === 'p') decide('personal')
      else if (k === 'i') decide('ignored')
      else if (k === 'z') undo()
      else if (k === 'r') setMakeRule((v) => !v)
      else if (k === 'escape') setPicking(false)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [picking, cur, apps, decide, undo])

  const personalAcct = cur?.account?.ownership === 'personal'
  const keycap: React.CSSProperties = { fontFamily: C.mono, fontSize: 11, border: `1px solid ${C.rule2}`, borderRadius: 5, padding: '1px 6px', marginRight: 6, color: C.ink2 }

  return (
    <AdminShell title="Money · Triage" subtitle={loaded ? `${remaining} to review` : undefined}
      actions={last ? <button style={btn('ghost')} onClick={undo}>Undo: {last.label} <span style={keycap}>Z</span></button> : undefined}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        {!loaded && <p style={{ color: C.soft }}>Loading…</p>}
        {loaded && !cur && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h2 style={{ fontFamily: C.serif, fontSize: 28, margin: 0 }}>All caught up</h2>
            <p style={{ color: C.ink2 }}>Nothing waiting. New transactions show up here after the next bank sync.</p>
          </div>
        )}
        {cur && (
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, padding: 28, boxShadow: '0 8px 30px rgba(20,20,19,.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: C.soft, fontFamily: C.mono, fontSize: 12 }}>
              <span>{new Date(cur.posted_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span style={{ color: personalAcct ? C.amber : C.mint }}>
                {cur.account?.institution ?? 'Account'} {cur.account?.mask ? `···${cur.account.mask}` : ''} · {cur.account?.ownership ?? '—'}
              </span>
            </div>
            <div style={{ fontFamily: C.serif, fontSize: 34, fontWeight: 800, margin: '14px 0 4px' }}>{cur.merchant ?? 'Unknown merchant'}</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: cur.amount_cents < 0 ? C.mint : C.ink }}>
              {cur.amount_cents < 0 ? '+' : ''}{usd(Math.abs(cur.amount_cents))}
              <span style={{ fontSize: 13, color: C.soft, fontWeight: 500, marginLeft: 8 }}>{cur.amount_cents < 0 ? 'money in' : 'money out'}</span>
            </div>
            {cur.raw_description && cur.raw_description !== cur.merchant && (
              <div style={{ color: C.soft, fontFamily: C.mono, fontSize: 12, marginTop: 6 }}>{cur.raw_description}</div>
            )}
            {personalAcct && <p style={{ color: C.amber, fontSize: 13, marginTop: 12 }}>Paid from a personal account — marking it business adds it to “LLC owes Brian”.</p>}

            {!picking ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button style={{ ...btn('mint'), flex: 1 }} onClick={() => setPicking(true)}><span style={{ ...keycap, color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>B</span>Business</button>
                <button style={{ ...btn('solid'), flex: 1 }} onClick={() => decide('personal')}><span style={{ ...keycap, color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>P</span>Personal</button>
                <button style={{ ...btn('ghost'), flex: 1 }} onClick={() => decide('ignored')}><span style={keycap}>I</span>Ignore</button>
              </div>
            ) : (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft, marginBottom: 8 }}>Which app? press a number</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button style={btn('ghost')} onClick={() => decide('business', null)}><span style={keycap}>0</span>Shared</button>
                  {apps.map((a, i) => (
                    <button key={a.slug} style={btn('ghost')} onClick={() => decide('business', a.slug)}><span style={keycap}>{i + 1}</span>{a.name}</button>
                  ))}
                </div>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.rule2}`, fontSize: 14, width: '100%' }}>
                  {SCHEDULE_C.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button style={{ ...btn('ghost'), marginTop: 10 }} onClick={() => setPicking(false)}>Back <span style={{ ...keycap, marginLeft: 6, marginRight: 0 }}>Esc</span></button>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, color: C.ink2, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={makeRule} onChange={(e) => setMakeRule(e.target.checked)} />
              Make this a rule — handle “{cur.merchant ?? 'this merchant'}” automatically next time <span style={{ ...keycap, marginLeft: 4 }}>R</span>
            </label>
          </div>
        )}
        {msg && <p style={{ color: C.mint, fontSize: 13.5, textAlign: 'center', marginTop: 14 }}>{msg}</p>}
      </div>
    </AdminShell>
  )
}
