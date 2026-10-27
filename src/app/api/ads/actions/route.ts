import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { runAction, type ActionRequest } from '@/lib/ads/actions'

// ─── POST /api/ads/actions ───────────────────────────────────────────────────
//
// Runs one Ad insights action (FEAT-CLA-023): { kind, platform, campaign_id,
// app_id?, promotion_id?, amount_cents?, options?: { budget_cents,
// pause_original, dry_run }, source_ids? }. Answers { ok, message,
// result_ids, dry_run?, payloads?, notes? }; a failure is { error } in plain
// words (TikTok 40001 says the scope is still under review). Every run is
// logged in studio_ad_actions.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Partial<ActionRequest>
  if (!body.kind || (body.platform !== 'tiktok' && body.platform !== 'meta') || !body.campaign_id) return NextResponse.json({ error: 'kind, platform and campaign_id are required.' }, { status: 400 })
  try {
    const out = await runAction({ ...body, kind: body.kind, platform: body.platform, campaign_id: body.campaign_id, source: req.headers.get('x-studio-client') === 'ios' ? 'ios' : 'web' })
    return NextResponse.json({ ok: true, ...out })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
}
