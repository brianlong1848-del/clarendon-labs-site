import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { adSpendByCountry } from '@/lib/ads/countries'
import { ADS_RANGES, rangeWindow, type AdsRange } from '@/lib/money/adsReport'

// ─── /api/money/ads/countries?range=30d&app= — the World strip ──────────────
//
// Ad spend + platform-attributed installs per country, live from Meta
// (breakdowns=country) and TikTok (dimensions country_code); see
// src/lib/ads/countries.ts. Cached 30 minutes. Never 500s on a platform
// failure: `countries` is then empty or partial and `errors` says why.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const r = q.get('range') as AdsRange | null
  const range: AdsRange = r && ADS_RANGES.includes(r) ? r : '30d'
  const app = q.get('app') || undefined
  const { since } = rangeWindow(range)
  const to = new Date().toISOString().slice(0, 10)
  const out = await adSpendByCountry({ from: since, to, app: app === 'all' ? undefined : app })
  return NextResponse.json({ ...out, range })
}
