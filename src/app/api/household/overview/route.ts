import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { studioDb } from '@/lib/money/studioDb'
import { buildPicture } from '@/lib/household/portfolio'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Everything the Household Overview shows in one call: the picture (accounts,
// holdings priced, net worth + deltas, allocation vs target, cash buffer) plus
// the latest advisor brief with its open actions. Stale quotes are refreshed
// on the way (within the FMP cache rules).
export async function GET() {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const db = studioDb()
  if (!db) return NextResponse.json({ error: 'studio db not configured' }, { status: 500 })
  try {
    const picture = await buildPicture(db, { refreshQuotes: true })
    const runs = await db.select<{ id: string; kind: string; created_at: string; output_md: string; output: { summary_md?: string } | null; model: string }[]>('advisor_runs', 'select=id,kind,created_at,output_md,output,model&kind=neq.question&order=created_at.desc&limit=1')
    const latest = runs.ok ? runs.data[0] ?? null : null
    const actions = latest
      ? await db.select<unknown[]>('advisor_actions', `select=id,kind,ticker,amount_cents,title,rationale,urgency,confidence,status&run_id=eq.${latest.id}&status=eq.open&order=urgency,confidence.desc&limit=3`)
      : { ok: true as const, data: [] }
    return NextResponse.json({
      ...picture,
      brief: latest ? { id: latest.id, kind: latest.kind, created_at: latest.created_at, summary: latest.output?.summary_md ?? latest.output_md.slice(0, 1200), model: latest.model, actions: actions.ok ? actions.data : [] } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
