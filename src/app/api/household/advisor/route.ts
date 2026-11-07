import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { supabaseServer } from '@/lib/supabase/server'
import { studioDb } from '@/lib/money/studioDb'
import { advisorConfigured, runAdvisor, ADVISOR_MODEL } from '@/lib/household/advisor'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

// Household advisor.
//   GET                       runs (newest first, without the snapshot) + every action, open first
//   GET ?run=<id>             one run in full, including the input snapshot ("What it looked at")
//   POST { kind: 'on_demand' } | { kind: 'question', question }   → a new run ("Brief me now" / Ask)
//   PATCH { id, status: 'done' | 'dismissed' | 'open' }           → decide an action
// Advice only: nothing here (or anywhere in the console) can place a trade.
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return bad('not authorised', 401)
  const sb = await supabaseServer()
  const runId = new URL(req.url).searchParams.get('run')
  if (runId) {
    const { data, error } = await sb.from('advisor_runs').select('*').eq('id', runId).maybeSingle()
    if (error) return bad(error.message, 500)
    if (!data) return bad('Not found', 404)
    const { data: actions } = await sb.from('advisor_actions').select('*').eq('run_id', runId).order('urgency')
    return NextResponse.json({ run: data, actions: actions ?? [] })
  }
  const [runs, actions] = await Promise.all([
    sb.from('advisor_runs').select('id,kind,question,output_md,output,model,input_tokens,output_tokens,created_at,requested_by').order('created_at', { ascending: false }).limit(30),
    sb.from('advisor_actions').select('*, run:advisor_runs(created_at,kind)').order('status').limit(200),
  ])
  if (runs.error) return bad(runs.error.message, 500)
  return NextResponse.json({ runs: runs.data ?? [], actions: actions.data ?? [], configured: advisorConfigured(), model: ADVISOR_MODEL() })
}

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return bad('not authorised', 401)
  const db = studioDb()
  if (!db) return bad('studio db not configured', 500)
  const b = await req.json().catch(() => ({})) as { kind?: string; question?: string }
  const kind = b.kind === 'question' ? 'question' : 'on_demand'
  const sb = await supabaseServer()
  const { data: me } = await sb.auth.getUser()
  try {
    const r = await runAdvisor(db, kind, { question: b.question, requestedBy: me.user?.id ?? null })
    return NextResponse.json(r)
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'failed', 502)
  }
}

export async function PATCH(req: Request) {
  if (!(await consoleAuthed())) return bad('not authorised', 401)
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string }
  if (!b.id || !['done', 'dismissed', 'open'].includes(b.status ?? '')) return bad('id and status (done | dismissed | open) required')
  const sb = await supabaseServer()
  const { data: me } = await sb.auth.getUser()
  const { error } = await sb.from('advisor_actions').update({ status: b.status, decided_by: b.status === 'open' ? null : me.user?.id ?? null, decided_at: b.status === 'open' ? null : new Date().toISOString() }).eq('id', b.id)
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}
