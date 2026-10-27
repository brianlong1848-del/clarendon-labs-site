import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { PUBLISH_APPS } from '@/lib/publish/platforms'
import { rest } from '@/lib/publish/store'
import { campaignsFor } from '@/lib/ads/campaigns'
import { analyze, STAGE_LABEL, VERDICT_LABEL, type MoneyFacts } from '@/lib/ads/insights'
import { cachedNarrative, chicagoDay, narrativeConfigured } from '@/lib/ads/narrative'
import { adsReportForService } from '@/lib/money/adsReport'
import { DRIVE_NAME, MARKETING_FOLDER } from '@/lib/publish/marketing'
import { driveConfigured, findFile, readText, writeText } from '@/lib/drive'
import type { Promotion } from '@/lib/ads/meta'

// ─── Weekly ad write-up → Drive (FEAT-CLA-023) ──────────────────────────────
//
// Every Monday (vercel.json) — or by hand with ?app=<id> from the admin
// session — appends a dated section to Marketing/<App>-ad-insights.md for
// each app that had a campaign in the last 7 days: verdicts, the figures
// behind them, Claude's why / try next, and the week's actions. The site owns
// those files (Marketing reads them); the service account can only update a
// file Brian created, so a missing file is reported, never created.
// Auth: Vercel Cron's CRON_SECRET bearer, or the signed-in admin session.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const usd = (c?: number) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)
const pct = (v?: number) => (v == null ? '—' : `${v.toFixed(2)}%`)
const rate = (v?: number) => (v == null ? '—' : `${Math.round(v * 100)}%`)

export async function GET(req: Request) {
  const cron = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cron && !(await consoleAuthed())) return new NextResponse('Unauthorized', { status: 401 })
  if (!driveConfigured()) return NextResponse.json({ error: 'Drive isn’t connected (GOOGLE_SERVICE_ACCOUNT_JSON).' }, { status: 500 })
  const only = new URL(req.url).searchParams.get('app')
  const apps = PUBLISH_APPS.filter((a) => !only || a.id === only)
  const day = chicagoDay()
  const money = await adsReportForService(7).catch(() => null)
  const promotions = await rest<Pick<Promotion, 'campaign_id' | 'network' | 'goal' | 'audience' | 'daily_budget_cents' | 'start_at' | 'end_at'>[]>('studio_promotions?campaign_id=not.is.null&select=campaign_id,network,goal,audience,daily_budget_cents,start_at,end_at').catch(() => [])
  const results: Record<string, string> = {}

  for (const app of apps) {
    try {
      const { campaigns, errors } = await campaignsFor(app.id, '7d')
      if (!campaigns.length) { results[app.id] = 'no campaigns this week'; continue }
      const facts = new Map<string, MoneyFacts>()
      for (const c of money?.campaigns ?? []) facts.set(`${c.platform}:${c.campaign_id}`, { installs: c.installs || undefined, cpi_cents: c.cpi_cents ?? undefined, est_roas: c.est_roas ?? undefined })
      const analysis = analyze(campaigns, facts, '7d')
      const narrative = narrativeConfigured() ? await cachedNarrative({ app: app.id, range: '7d', rows: campaigns, analysis, promotions }).catch(() => null) : null
      const byId = new Map((narrative?.campaigns ?? []).map((c) => [c.campaign_id, c]))
      const lines: string[] = [
        `## Week of ${day} — written by clarendon.dev (FEAT-CLA-023)`,
        '',
        narrative?.summary ? `${narrative.summary}` : '_No Claude write-up this week (rules engine only)._',
        '',
      ]
      for (const r of campaigns) {
        const i = analysis.campaigns[`${r.platform}:${r.campaign_id}`]
        const m = i.metrics
        const n = byId.get(r.campaign_id)
        lines.push(`### ${r.name} — **${VERDICT_LABEL[i.verdict]}**${i.weakest ? ` (weakest: ${STAGE_LABEL[i.weakest]})` : ''}`)
        lines.push(`- ${r.platform === 'tiktok' ? 'TikTok' : 'Meta'} · ${r.objective ?? 'objective n/a'} · ${r.status ?? 'status n/a'}${r.budget_daily_cents ? ` · ${usd(r.budget_daily_cents)}/day` : ''} · 7 days: spend ${usd(m.spend_cents)}, impressions ${(m.impressions ?? 0).toLocaleString('en-US')}, hook ${rate(m.hook_rate)}, hold ${rate(m.hold_rate)}, CTR ${pct(m.ctr)}, CPC ${usd(m.cpc_cents)}, CPM ${usd(m.cpm_cents)}, 15-s views ${r.views15s ?? '—'} (${usd(m.cost_per_view15_cents)} each), follows ${r.follows ?? '—'}, frequency ${m.frequency?.toFixed(1) ?? '—'}×, installs ${m.installs ?? 'not visible'}${m.cpi_cents != null ? ` (CPI ${usd(m.cpi_cents)})` : ''}${m.est_roas != null ? `, est. ROAS ${m.est_roas.toFixed(2)}×` : ''}`)
        lines.push(`- Rules: ${i.reason}`)
        if (n?.why) lines.push(`- Why: ${n.why}`)
        if (n?.try_next) lines.push(`- Try next: ${n.try_next}`)
        lines.push('')
      }
      if (analysis.actions.length) {
        lines.push('**Actions this week**')
        for (const a of analysis.actions) lines.push(`- ${a.title} — ${a.detail}`)
        lines.push('')
      }
      if (narrative?.ideas?.length) {
        lines.push('**Ideas**')
        for (const i of narrative.ideas) lines.push(`- ${i.title} — ${i.detail}`)
        lines.push('')
      }
      if (errors.length) lines.push(`_Data notes: ${errors.join(' · ')}_`, '')
      const name = `${DRIVE_NAME[app.id] ?? app.name}-ad-insights.md`
      const file = await findFile(name, MARKETING_FOLDER)
      if (!file) { results[app.id] = `Marketing/${name} doesn’t exist in Drive — create it (any content) and run again.`; continue }
      const current = await readText(file.id)
      if (current.includes(`## Week of ${day} —`)) { results[app.id] = `already written for ${day}`; continue }
      await writeText(file.id, `${current.replace(/\s+$/, '')}\n\n${lines.join('\n').replace(/\s+$/, '')}\n`)
      results[app.id] = `appended to ${name}`
    } catch (e) { results[app.id] = `error: ${(e as Error).message}` }
  }
  return NextResponse.json({ ok: true, day, results })
}
