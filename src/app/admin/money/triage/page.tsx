'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import MoneyTabs from '@/components/money/MoneyTabs'
import { AdminShell, C, btn } from '@/components/AdminNav'
import { SCHEDULE_C, guessCategory } from '@/lib/money/categories'

// Triage: one unreviewed transaction at a time.
//   B → business, then 0 = shared / 1–6 = that app   ·   P = personal   ·   I = ignore   ·   Z = undo
// "Make this a rule" (R) toggles whether the same merchant is handled automatically from now on.

type Tx = {
  id: string; posted_on: string; amount_cents: number; merchant: string | null; raw_description: string | null
  plaid_category: string | null; account: { name: string | null; mask: string | null; ownership: string; institution: string | null } | null
  possible_duplicate_of: string | null; dup: { posted_on: string; merchant: string | null; amount_cents: number; source: string } | null
}
type App = { slug: string; name: string }
type Last = { id: string; label: string }

const iconFor = (slug: string) => (slug === 'studio' ? '/brand/clarendon-apple-touch-icon.png' : `/icons/${slug}.png`)
// One picker tile: icon · name (+ small note) · key badge, always on a single row.
function Tile({ icon, name, sub, k, on, check, onClick }: { icon: React.ReactNode; name: string; sub?: string; k: string; on?: boolean; check?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', textAlign: 'left', cursor: 'pointer',
      background: on ? C.mintTint : C.card, border: `1.5px solid ${on ? C.mint : C.rule2}`, borderRadius: 12, font: 'inherit', color: C.ink,
    }}>
      <span style={{ flex: 'none', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
        <span style={{ display: 'block', fontWeight: 650, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        {sub && <span style={{ display: 'block', fontSize: 11.5, color: C.soft, marginTop: 2 }}>{sub}</span>}
      </span>
      <span style={{ flex: 'none', fontFamily: C.mono, fontSize: 11, color: on ? C.mint : C.soft, border: `1px solid ${on ? C.mint : C.rule2}`, borderRadius: 5, minWidth: 20, textAlign: 'center', padding: '1px 5px' }}>
        {check && on ? '✓' : k}
      </span>
    </button>
  )
}

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function Triage() {
  const [items, setItems] = useState<Tx[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [remaining, setRemaining] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [picking, setPicking] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
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
  useEffect(() => { if (cur) { setCategory(guessCategory(cur.plaid_category)); setPicking(false); setSplitMode(false); setSelected([]) } }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const decide = useCallback(async (status: 'business' | 'personal' | 'ignored', app_slug: string | null = null, split: string[] | null = null) => {
    if (!cur || busy.current) return
    busy.current = true
    const res = await fetch('/api/money/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cur.id, status, app_slug, split_apps: split, schedule_c: status === 'business' ? category : null, makeRule }) }).catch(() => null)
    busy.current = false
    if (!res || !res.ok) { setMsg('Could not save that — try again.'); return }
    const d = await res.json()
    const nameOf = (x: string) => apps.find((a) => a.slug === x)?.name ?? x
    const appName = split ? split.map(nameOf).join(' + ') : app_slug ? nameOf(app_slug) : 'shared'
    setLast({ id: cur.id, label: `${cur.merchant ?? 'Transaction'} → ${status}${status === 'business' ? ` (${appName})` : ''}` })
    setMsg(d.alsoApplied ? `Rule saved — ${d.alsoApplied} more from this merchant handled too.` : null)
    setPicking(false); await load()
  }, [cur, apps, category, makeRule, load])

  // Plaid row that matches a manual/recurring entry: merge (keep the bank's row,
  // take the entry's app, category, splits and receipts) or say it's different.
  const resolveDup = useCallback(async (action: 'merge' | 'not_duplicate') => {
    if (!cur || busy.current) return
    busy.current = true
    const res = await fetch('/api/money/ledger', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cur.id, action }) }).catch(() => null)
    busy.current = false
    if (!res || !res.ok) { setMsg('Could not save that — try again.'); return }
    setMsg(action === 'merge' ? `Merged — ${cur.merchant ?? 'it'} counted once.` : 'Kept as a separate charge. Triage it as usual.')
    await load()
  }, [cur, load])

  const undo = useCallback(async () => {
    if (!last || busy.current) return
    busy.current = true
    await fetch('/api/money/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: last.id, status: 'unreviewed' }) }).catch(() => null)
    busy.current = false; setLast(null); setMsg('Undone.'); await load()
  }, [last, load])

  const toggle = (slug: string) => setSelected((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]))
  const confirmSplit = () => { if (selected.length >= 2) decide('business', null, selected); else if (selected.length === 1) decide('business', selected[0]) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'SELECT') return
      const k = e.key.toLowerCase()
      if (picking && /^[0-9]$/.test(k)) {
        const n = Number(k)
        if (splitMode) { if (apps[n - 1]) toggle(apps[n - 1].slug); return }
        if (n === 0) decide('business', null)
        else if (apps[n - 1]) decide('business', apps[n - 1].slug)
        return
      }
      if (picking && k === 's') { setSplitMode((v) => !v); setSelected([]); return }
      if (picking && splitMode && k === 'enter') { confirmSplit(); return }
      if (k === 'b' && cur) setPicking(true)
      else if (k === 'p') decide('personal')
      else if (k === 'i') decide('ignored')
      else if (k === 'z') undo()
      else if (k === 'r') setMakeRule((v) => !v)
      else if (k === 'escape') setPicking(false)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [picking, splitMode, selected, cur, apps, decide, undo])

  const personalAcct = cur?.account?.ownership === 'personal'
  const keycap: React.CSSProperties = { fontFamily: C.mono, fontSize: 11, border: `1px solid ${C.rule2}`, borderRadius: 5, padding: '1px 6px', marginRight: 6, color: C.ink2 }

  return (
    <AdminShell title="Money · Triage" subtitle={loaded ? `${remaining} to review` : undefined}
      actions={last ? <button style={btn('ghost')} onClick={undo}>Undo: {last.label} <span style={keycap}>Z</span></button> : undefined}>
      <MoneyTabs />
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
            {cur.possible_duplicate_of && cur.dup && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#FFF7E6', border: `1px solid ${C.amber}` }}>
                <div style={{ fontWeight: 650, marginBottom: 4 }}>Looks like this posted — merge?</div>
                <div style={{ fontSize: 13.5, color: C.ink2 }}>
                  Matches your {cur.dup.source === 'recurring' ? 'auto-posted subscription' : 'Quick Add entry'}: {cur.dup.merchant ?? '—'} · {usd(cur.dup.amount_cents)} · {cur.dup.posted_on}. Merging keeps this bank record with that entry&rsquo;s app, category and receipt, so it&rsquo;s counted once.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={btn('mint')} onClick={() => resolveDup('merge')}>Merge</button>
                  <button style={btn('ghost')} onClick={() => resolveDup('not_duplicate')}>Not the same charge</button>
                </div>
              </div>
            )}

            {!picking ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button style={{ ...btn('mint'), flex: 1 }} onClick={() => setPicking(true)}><span style={{ ...keycap, color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>B</span>Business</button>
                <button style={{ ...btn('solid'), flex: 1 }} onClick={() => decide('personal')}><span style={{ ...keycap, color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>P</span>Personal</button>
                <button style={{ ...btn('ghost'), flex: 1 }} onClick={() => decide('ignored')}><span style={keycap}>I</span>Ignore</button>
              </div>
            ) : (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.soft, marginBottom: 8 }}>{splitMode ? 'Tick the apps sharing this cost, evenly split' : 'Which app? press a number'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {!splitMode && (
                    <Tile k="0" name="Shared" sub="Split across all apps" onClick={() => decide('business', null)}
                      icon={<span style={{ width: 30, height: 30, borderRadius: 8, background: C.mintTint, color: C.mint, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700 }}>∗</span>} />
                  )}
                  {apps.map((a, i) => (
                    <Tile key={a.slug} k={String(i + 1)} name={a.name.replace(/\s*\(.*\)/, '')} sub={a.slug === 'studio' ? 'Company-level' : undefined}
                      on={splitMode && selected.includes(a.slug)} check={splitMode}
                      onClick={() => (splitMode ? toggle(a.slug) : decide('business', a.slug))}
                      icon={<img src={iconFor(a.slug)} alt="" width={30} height={30} style={{ borderRadius: 7, display: 'block' }} />} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <button style={btn(splitMode ? 'solid' : 'ghost')} onClick={() => { setSplitMode((v) => !v); setSelected([]) }}><span style={keycap}>S</span>{splitMode ? 'Splitting — pick 2 or more' : 'Split between several apps'}</button>
                  {splitMode && <button style={btn('mint')} disabled={selected.length < 1} onClick={confirmSplit}>Confirm <span style={{ ...keycap, marginLeft: 6, marginRight: 0, color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>Enter</span></button>}
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
