// ─── Household advisor (Claude) ──────────────────────────────────────────────
//
// SERVER ONLY. Reads the household picture, asks Claude for a brief, stores
// the run (input snapshot + output, so every piece of advice is reproducible)
// and one row per recommendation (advisor_actions) so "Mark done" / "Dismiss"
// survive the next run. ADVICE ONLY: no endpoint in this console calls a
// brokerage or bank write API — Plaid is read-only here and stays so.
//
// Env: ANTHROPIC_API_KEY (shared with the Honest Review and /post captions),
// HOUSEHOLD_ADVISOR_MODEL (optional; default: the current Sonnet-class model).
// Usage is tagged metadata.user_id = 'household' so the LLC can split the bill.

import type { StudioDb } from '@/lib/money/studioDb'
import { tickerContext, type TickerContext } from './marketData'
import { buildPicture, cashflowByCategory, BUCKET_LABEL, type Picture } from './portfolio'

export const ADVISOR_MODEL = () => process.env.HOUSEHOLD_ADVISOR_MODEL || 'claude-sonnet-5-5'
export const advisorConfigured = () => !!process.env.ANTHROPIC_API_KEY

export const ACTION_KINDS = ['move_cash', 'rebalance', 'buy', 'sell', 'trim', 'harvest', 'hold', 'pay_down', 'review'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]
export type Action = {
  kind: ActionKind; ticker: string | null; account_id: string | null; amount_cents: number | null
  title: string; rationale: string; urgency: 'now' | 'this_week' | 'this_month' | 'someday'; confidence: 'low' | 'medium' | 'high'
}
export type AdvisorOutput = { summary_md: string; actions: Action[]; risks: string[]; questions_for_you: string[]; answer_md?: string }
export type RunKind = 'weekly' | 'on_demand' | 'question'

const usd = (c: number | null | undefined) => (c == null ? 'n/a' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
const pct = (n: number | null | undefined, d = 1) => (n == null ? 'n/a' : `${n.toFixed(d)}%`)

// ── Snapshot ─────────────────────────────────────────────────────────────────
export type Snapshot = {
  as_of: string
  net_worth: Picture['netWorth']; deltas: Picture['deltas']
  accounts: { id: string; institution: string | null; name: string | null; type: string | null; subtype: string | null; value_cents: number; is_liability: boolean }[]
  holdings: { ticker: string | null; name: string | null; account: string; quantity: number; cost_basis_cents: number | null; price: number | null; price_source: string; value_cents: number; gain_cents: number | null; gain_pct: number | null; weight: number; bucket: string; sector: string | null }[]
  allocation: Picture['allocation']; cash: Picture['cash']; concentration: Picture['concentration']
  cashflow: Awaited<ReturnType<typeof cashflowByCategory>>
  investment_transactions_90d: { posted_on: string; type: string; subtype: string | null; ticker: string | null; quantity: number | null; price: number | null; amount_cents: number }[]
  realised_ytd: { gains_cents: number; losses_cents: number; sales: { posted_on: string; ticker: string | null; amount_cents: number }[] }
  tickers: TickerContext[]
  settings: { target_allocation: unknown; cash_buffer_months: unknown; goals: unknown; risk_note: unknown; tax_bracket_note: unknown }
  done_recently: { title: string; kind: string; decided_at: string | null; status: string }[]
  open_actions: { id: string; title: string; kind: string; ticker: string | null; created: string }[]
}

export async function buildSnapshot(db: StudioDb): Promise<Snapshot> {
  const picture = await buildPicture(db, { refreshQuotes: true })
  const since90 = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`
  const [cashflow, invTx, sales, decided, openActs] = await Promise.all([
    cashflowByCategory(db, 90),
    db.select<{ posted_on: string; type: string; subtype: string | null; quantity: number | null; price: number | null; amount_cents: number; security: { ticker: string | null } | null }[]>('investment_transactions', `select=posted_on,type,subtype,quantity,price,amount_cents,security:securities(ticker)&posted_on=gte.${since90}&order=posted_on.desc&limit=200`),
    db.select<{ posted_on: string; amount_cents: number; quantity: number | null; price: number | null; security: { ticker: string | null } | null; security_id: string | null }[]>('investment_transactions', `select=posted_on,amount_cents,quantity,price,security_id,security:securities(ticker)&type=eq.sell&posted_on=gte.${yearStart}&order=posted_on.desc&limit=200`),
    db.select<{ title: string; kind: string; decided_at: string | null; status: string }[]>('advisor_actions', `select=title,kind,decided_at,status&status=in.(done,dismissed)&decided_at=gte.${since90}&order=decided_at.desc&limit=30`),
    db.select<{ id: string; title: string; kind: string; ticker: string | null; run: { created_at: string } | null }[]>('advisor_actions', 'select=id,title,kind,ticker,run:advisor_runs(created_at)&status=eq.open&order=run(created_at).desc&limit=20'),
  ])
  // Realised gains this year: proceeds of each sale vs the position's average cost at the time is not available from Plaid,
  // so we approximate with the current average cost basis per share for the same security (labelled as such in the prompt).
  const costPerShare = new Map<string, number>()
  for (const h of picture.holdings) if (h.ticker && h.cost_basis_cents != null && h.quantity > 0) costPerShare.set(h.ticker, h.cost_basis_cents / h.quantity)
  let gains = 0, losses = 0
  const saleRows = (sales.ok ? sales.data : []).map((s) => {
    const t = s.security?.ticker ?? null
    const proceeds = -Number(s.amount_cents) // plaid: sells are negative (money in)
    const cps = t ? costPerShare.get(t) : undefined
    const basis = cps != null && s.quantity != null ? cps * Math.abs(s.quantity) : null
    const gl = basis != null ? proceeds - basis : null
    if (gl != null) { if (gl >= 0) gains += gl; else losses += -gl }
    return { posted_on: s.posted_on, ticker: t, amount_cents: proceeds }
  })
  const tickers = Array.from(new Set(picture.holdings.map((h) => h.ticker).filter((t): t is string => !!t))).slice(0, 25)
  const ctx = await Promise.all(tickers.map((t) => tickerContext(db, t).catch(() => ({ ticker: t, profile: null, ratios: null, grades: null, target: null, dividends: null, news: null }))))
  const s = picture.settings
  return {
    as_of: picture.asOf, net_worth: picture.netWorth, deltas: picture.deltas,
    accounts: picture.accounts.map((a) => ({ id: a.id, institution: a.institution, name: a.name, type: a.account_type, subtype: a.account_subtype, value_cents: a.value_cents, is_liability: a.is_liability })),
    holdings: picture.holdings.map((h) => ({ ticker: h.ticker, name: h.name, account: `${h.institution ?? ''} ${h.account_name}`.trim(), quantity: h.quantity, cost_basis_cents: h.cost_basis_cents, price: h.price, price_source: h.price_source, value_cents: h.value_cents, gain_cents: h.gain_cents, gain_pct: h.gain_pct, weight: Math.round(h.weight * 10) / 10, bucket: h.bucket, sector: h.sector })),
    allocation: picture.allocation, cash: picture.cash, concentration: picture.concentration, cashflow,
    investment_transactions_90d: (invTx.ok ? invTx.data : []).map((t) => ({ posted_on: t.posted_on, type: t.type, subtype: t.subtype, ticker: t.security?.ticker ?? null, quantity: t.quantity, price: t.price, amount_cents: Number(t.amount_cents) })),
    realised_ytd: { gains_cents: Math.round(gains), losses_cents: Math.round(losses), sales: saleRows.slice(0, 40) },
    tickers: ctx,
    settings: { target_allocation: s.target_allocation ?? null, cash_buffer_months: s.cash_buffer_months ?? 6, goals: s.goals ?? [], risk_note: s.risk_note ?? '', tax_bracket_note: s.tax_bracket_note ?? '' },
    done_recently: decided.ok ? decided.data : [],
    open_actions: (openActs.ok ? openActs.data : []).map((a) => ({ id: a.id, title: a.title, kind: a.kind, ticker: a.ticker, created: a.run?.created_at ?? '' })),
  }
}

// ── Prompt ───────────────────────────────────────────────────────────────────
const SYSTEM = `You are a careful, fiduciary-minded financial analyst working for ONE household (two married adults in Illinois, USA). You read their full picture and say, plainly, what to do with their money. You are not a licensed adviser and you say so once, briefly, in the summary.

Rules, in priority order:
1. Boring, low-cost, tax-aware moves first: fill the cash buffer to the target months; pay down any debt above 8% APR; use tax-advantaged space (401k/IRA/HSA) before taxable; rebalance when a bucket drifts more than 5 points from target; harvest losses when a position is down more than $500 and no wash-sale conflict exists (a buy of the same or substantially identical security within 30 days either side). Only after those does a single-stock call belong.
2. Show the maths. Every recommendation names the dollar amount, the account it concerns, and the position size as % of the portfolio where relevant.
3. For every buy, sell or trim: the thesis, what would change your mind, and the size as % of the portfolio. Never promise returns.
4. Flag concentration: any one name over 10% of the portfolio, any one sector over 25%.
5. Prices marked price_source "plaid" or "institution" are last close, not live. Realised-gain figures are approximations from current average cost; say so if they matter.
6. Respect the household's own notes (risk, goals, tax). Do not repeat an action the household already did or dismissed recently; build on it.
7. Advice only. The household places every trade themselves. Never instruct an automated action.
8. Write the summary in plain, direct English for two smart non-professionals: short paragraphs, no jargon without a gloss, numbers in dollars.

Return ONLY the structured output through the tool: summary_md (markdown, ≤ 350 words), actions (each one concrete and checkable), risks (what could hurt them this quarter), questions_for_you (facts you lacked that would change the advice). When a specific question is asked, answer it in answer_md first (≤ 250 words), then still give the actions that follow from it.`

const TOOL = {
  name: 'household_brief',
  description: 'The household brief: summary, concrete actions, risks, questions. Always call this exactly once.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['summary_md', 'actions', 'risks', 'questions_for_you'],
    properties: {
      summary_md: { type: 'string' },
      answer_md: { type: 'string', description: 'Only when a question was asked: the direct answer.' },
      actions: {
        type: 'array', maxItems: 10,
        items: {
          type: 'object', additionalProperties: false,
          required: ['kind', 'title', 'rationale', 'urgency', 'confidence'],
          properties: {
            kind: { type: 'string', enum: [...ACTION_KINDS] },
            ticker: { type: 'string', description: 'Ticker when the action is about one security.' },
            account_id: { type: 'string', description: 'The account id from the snapshot the action concerns.' },
            amount_cents: { type: 'integer', description: 'Dollar amount in cents, when there is one.' },
            title: { type: 'string', description: 'One line, imperative, ≤ 90 characters.' },
            rationale: { type: 'string', description: 'The maths and the thesis; what would change your mind.' },
            urgency: { type: 'string', enum: ['now', 'this_week', 'this_month', 'someday'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
      risks: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      questions_for_you: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    },
  },
}

function describe(s: Snapshot, kind: RunKind, question?: string) {
  const a = s.allocation
  const lines: string[] = [
    `As of ${s.as_of}. Run kind: ${kind}.`,
    question ? `QUESTION FROM THE HOUSEHOLD: ${question}` : '',
    `<household_notes>\nrisk: ${s.settings.risk_note || '(none)'}\ntax: ${s.settings.tax_bracket_note || '(none)'}\ngoals: ${JSON.stringify(s.settings.goals)}\ntarget allocation (%): ${JSON.stringify(s.settings.target_allocation)}\ncash buffer target: ${String(s.settings.cash_buffer_months)} months\n</household_notes>`,
    `<net_worth>total ${usd(s.net_worth.total_cents)} · assets ${usd(s.net_worth.assets_cents)} · liabilities ${usd(s.net_worth.liabilities_cents)} · invested ${usd(s.net_worth.investments_cents)} · 1d ${usd(s.deltas.d1_cents)} · 30d ${usd(s.deltas.d30_cents)} · ytd ${usd(s.deltas.ytd_cents)}</net_worth>`,
    `<accounts>\n${s.accounts.map((x) => `${x.id} | ${x.institution ?? ''} ${x.name ?? ''} | ${x.type ?? ''}/${x.subtype ?? ''} | ${x.is_liability ? 'LIABILITY ' : ''}${usd(x.value_cents)}`).join('\n') || '(none)'}\n</accounts>`,
    `<allocation>\n${(Object.keys(a.actual_pct) as (keyof typeof a.actual_pct)[]).map((b) => `${BUCKET_LABEL[b]}: now ${pct(a.actual_pct[b])} (${usd(a.actual_cents[b])}) · target ${pct(a.target_pct[b], 0)} · drift ${a.drift_pts[b] >= 0 ? '+' : ''}${a.drift_pts[b].toFixed(1)} pts`).join('\n')}\n</allocation>`,
    `<cash_buffer>cash ${usd(s.cash.cents)} · avg monthly outflow ${usd(s.cash.avg_monthly_outflow_cents)} · months covered ${s.cash.months?.toFixed(1) ?? 'unknown'} · target ${s.cash.target_months}</cash_buffer>`,
    `<concentration>names: ${s.concentration.names.map((n) => `${n.ticker} ${pct(n.weight)}`).join(', ') || 'n/a'} · sectors: ${s.concentration.sectors.map((n) => `${n.sector} ${pct(n.weight)}`).join(', ') || 'n/a'}</concentration>`,
    `<holdings>\n${s.holdings.map((h) => `${h.ticker ?? '(no ticker)'} | ${h.name ?? ''} | ${h.account} | qty ${h.quantity} | price ${h.price ?? 'n/a'} (${h.price_source}) | value ${usd(h.value_cents)} | cost ${usd(h.cost_basis_cents)} | gain ${usd(h.gain_cents)} (${pct(h.gain_pct)}) | weight ${pct(h.weight)} | ${h.bucket}${h.sector ? ` · ${h.sector}` : ''}`).join('\n') || '(none)'}\n</holdings>`,
    `<cash_flow_90d>income ${usd(s.cashflow.income_cents)} · outflow ${usd(s.cashflow.outflow_cents)}\nby category: ${s.cashflow.categories.slice(0, 12).map((c) => `${c.category} ${usd(c.out_cents)}`).join(', ') || 'n/a'}\nrecurring bills: ${s.cashflow.recurring.slice(0, 12).map((r) => `${r.merchant} ${usd(r.last_amount_cents)}/mo`).join(', ') || 'n/a'}</cash_flow_90d>`,
    `<investment_transactions_90d>\n${s.investment_transactions_90d.slice(0, 60).map((t) => `${t.posted_on} ${t.subtype ?? t.type} ${t.ticker ?? ''} qty ${t.quantity ?? ''} @ ${t.price ?? ''} amount ${usd(t.amount_cents)}`).join('\n') || '(none)'}\n</investment_transactions_90d>`,
    `<tax_context>realised YTD (approx., current avg cost): gains ${usd(s.realised_ytd.gains_cents)} · losses ${usd(s.realised_ytd.losses_cents)}\nsales YTD: ${s.realised_ytd.sales.slice(0, 20).map((x) => `${x.posted_on} ${x.ticker ?? ''} ${usd(x.amount_cents)}`).join('; ') || 'none'}\nwash-sale window: 30 days either side of any sale.</tax_context>`,
    `<market_context>\n${s.tickers.map((t) => [
      `${t.ticker}: ${t.profile?.companyName ?? ''}${t.profile?.sector ? ` · ${t.profile.sector}/${t.profile.industry ?? ''}` : ''}${t.profile?.isEtf ? ' · ETF' : t.profile?.isFund ? ' · fund' : ''}${t.profile?.beta != null ? ` · beta ${t.profile.beta}` : ''}`,
      t.ratios ? `  ratios: ${Object.entries(t.ratios).map(([k, v]) => `${k.replace('TTM', '')}=${v}`).join(' ')}` : '',
      t.grades ? `  analysts: ${t.grades.consensus ?? ''} (buy ${t.grades.buy ?? 0}/hold ${t.grades.hold ?? 0}/sell ${t.grades.sell ?? 0})${t.target?.targetConsensus ? ` target ${t.target.targetConsensus}` : ''}` : '',
      t.dividends?.length ? `  dividends: ${t.dividends.map((d) => `${d.date} ${d.dividend}`).join(', ')}` : '',
      t.news?.length ? `  news: ${t.news.map((n) => `"${n.title}" (${n.site}, ${n.publishedDate?.slice(0, 10)})`).join('; ')}` : '  news: not available on this data plan',
    ].filter(Boolean).join('\n')).join('\n') || '(no tickers)'}\n</market_context>`,
    `<already_decided_90d>\n${s.done_recently.map((d) => `${d.status.toUpperCase()} ${d.decided_at?.slice(0, 10) ?? ''}: ${d.title} [${d.kind}]`).join('\n') || '(nothing yet)'}\n</already_decided_90d>`,
    `<still_open_from_earlier_runs>\n${s.open_actions.map((o) => `${o.created.slice(0, 10)}: ${o.title} [${o.kind}${o.ticker ? ` ${o.ticker}` : ''}]`).join('\n') || '(none)'}\n</still_open_from_earlier_runs>`,
    question ? 'Answer the question first (answer_md), then give the brief. Call the household_brief tool.' : 'Write the brief. Call the household_brief tool.',
  ]
  return lines.filter(Boolean).join('\n\n')
}

// ── Run ──────────────────────────────────────────────────────────────────────
export type RunResult = { id: string; output: AdvisorOutput; model: string; input_tokens: number | null; output_tokens: number | null }

export async function runAdvisor(db: StudioDb, kind: RunKind, opts: { question?: string; requestedBy?: string | null } = {}): Promise<RunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('The advisor isn’t set up yet (ANTHROPIC_API_KEY is not set).')
  const question = opts.question?.trim().slice(0, 1000) || undefined
  if (kind === 'question' && !question) throw new Error('Ask a question first.')
  const snapshot = await buildSnapshot(db)
  if (!snapshot.accounts.length) throw new Error('Nothing to look at yet — connect an account first.')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(120_000),
    // Same shape as the ad-insights narrative: raw Messages API (no SDK in this
    // project). Forced tool_choice is rejected on the current Sonnet, so the
    // prompt names the tool and strict: true keeps the arguments schema-valid;
    // a safety decline is re-run on Anthropic's default fallback model.
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ADVISOR_MODEL(), max_tokens: 8000, system: SYSTEM,
      metadata: { user_id: 'household' },
      fallbacks: 'default',
      tools: [TOOL], tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [{ type: 'text', text: describe(snapshot, kind, question) }] }],
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Claude couldn’t write the brief: ${body?.error?.message ?? `HTTP ${res.status}`}`)
  if (body.stop_reason === 'refusal') throw new Error('Claude declined to write the brief.')
  const blocks = (body.content ?? []) as { type: string; input?: Record<string, unknown>; text?: string }[]
  let raw: unknown = blocks.find((c) => c.type === 'tool_use')?.input
  if (!raw) {
    // Rarely the model answers in text; take the JSON object if there is one.
    const plain = blocks.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    const json = plain.match(/\{[\s\S]*\}/)?.[0]
    try { raw = json ? JSON.parse(json) : undefined } catch { raw = undefined }
  }
  const output = validate(raw, snapshot)
  if (!output) throw new Error('Claude didn’t return a usable brief.')
  const fellBack = Array.isArray(body.usage?.iterations) && body.usage.iterations.some((e: { type?: string }) => e?.type === 'fallback_message')

  const md = [output.answer_md ? `## Answer\n\n${output.answer_md}` : '', output.summary_md,
    output.actions.length ? `## Actions\n\n${output.actions.map((a) => `- **${a.title}** (${a.kind}, ${a.urgency}, ${a.confidence} confidence)${a.amount_cents != null ? ` — ${usd(a.amount_cents)}` : ''}\n  ${a.rationale}`).join('\n')}` : '',
    output.risks.length ? `## Risks\n\n${output.risks.map((r) => `- ${r}`).join('\n')}` : '',
    output.questions_for_you.length ? `## Questions for you\n\n${output.questions_for_you.map((q) => `- ${q}`).join('\n')}` : ''].filter(Boolean).join('\n\n')

  const model = String(body.model ?? ADVISOR_MODEL())
  const input_tokens = body.usage?.input_tokens ?? null, output_tokens = body.usage?.output_tokens ?? null
  const ins = await db.insert<{ id: string }[]>('advisor_runs', [{ owner_id: db.owner, requested_by: opts.requestedBy ?? null, kind, question: question ?? null, input_snapshot: snapshot, output, output_md: md, model, input_tokens, output_tokens }])
  if (!ins.ok || !ins.data?.[0]?.id) throw new Error(`Brief written but couldn’t be saved: ${ins.ok ? 'no id returned' : ins.error}`)
  const runId = ins.data[0].id
  if (output.actions.length) {
    const rows = output.actions.map((a) => ({ run_id: runId, kind: a.kind, ticker: a.ticker, account_id: a.account_id, amount_cents: a.amount_cents, title: a.title, rationale: a.rationale, urgency: a.urgency, confidence: a.confidence, status: 'open' }))
    const r = await db.insertIgnore('advisor_actions', rows, 'id')
    if (!r.ok) console.error(`[advisor] actions: ${r.error}`)
  }
  console.log(`[advisor] ${kind} run ${runId} by ${model}${fellBack ? ' (FALLBACK model)' : ''}: ${output.actions.length} actions, ${input_tokens ?? '?'} in / ${output_tokens ?? '?'} out`)
  return { id: runId, output, model, input_tokens, output_tokens }
}

/** Strict validation of Claude's JSON against advisor_actions' constraints; unknown account ids and odd tickers are dropped, not trusted. */
function validate(raw: unknown, s: Snapshot): AdvisorOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.summary_md !== 'string' || !o.summary_md.trim()) return null
  const accountIds = new Set(s.accounts.map((a) => a.id))
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 500)).slice(0, max) : [])
  const actions: Action[] = []
  for (const a of Array.isArray(o.actions) ? o.actions : []) {
    if (!a || typeof a !== 'object') continue
    const x = a as Record<string, unknown>
    if (!ACTION_KINDS.includes(x.kind as ActionKind) || typeof x.title !== 'string' || typeof x.rationale !== 'string') continue
    const urgency = ['now', 'this_week', 'this_month', 'someday'].includes(x.urgency as string) ? (x.urgency as Action['urgency']) : 'this_month'
    const confidence = ['low', 'medium', 'high'].includes(x.confidence as string) ? (x.confidence as Action['confidence']) : 'medium'
    const ticker = typeof x.ticker === 'string' && /^[A-Z.\-]{1,10}$/.test(x.ticker.toUpperCase().trim()) ? x.ticker.toUpperCase().trim() : null
    const account_id = typeof x.account_id === 'string' && accountIds.has(x.account_id) ? x.account_id : null
    const amount_cents = typeof x.amount_cents === 'number' && Number.isFinite(x.amount_cents) ? Math.round(x.amount_cents) : null
    actions.push({ kind: x.kind as ActionKind, ticker, account_id, amount_cents, title: x.title.trim().slice(0, 140), rationale: x.rationale.trim().slice(0, 2000), urgency, confidence })
    if (actions.length >= 10) break
  }
  return { summary_md: o.summary_md.trim().slice(0, 6000), answer_md: typeof o.answer_md === 'string' ? o.answer_md.trim().slice(0, 4000) : undefined, actions, risks: strs(o.risks, 8), questions_for_you: strs(o.questions_for_you, 6) }
}

/** Is it time for the weekly run? Compares the schedule (Central) with now and the last weekly run. */
export async function weeklyDue(db: StudioDb, now = new Date()): Promise<boolean> {
  const schedRes = await db.select<{ value: { weekday?: number; hour_ct?: number } }[]>('household_settings', 'select=value&key=eq.advisor_schedule')
  const sched = (schedRes.ok ? schedRes.data[0]?.value : undefined) ?? { weekday: 1, hour_ct: 7 }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '')
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1) % 24
  if (wd !== (sched.weekday ?? 1) || hour !== (sched.hour_ct ?? 7)) return false
  const last = await db.select<{ created_at: string }[]>('advisor_runs', 'select=created_at&kind=eq.weekly&order=created_at.desc&limit=1')
  const lastAt = last.ok && last.data[0] ? Date.parse(last.data[0].created_at) : 0
  return now.getTime() - lastAt > 6 * 86400_000
}
