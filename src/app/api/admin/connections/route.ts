import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { analyticsRegistry, withInstagram } from '@/lib/analytics/registry'
import { fetchPlayCached, listPlayReports, playAccount, playBucket, playConfigured } from '@/lib/analytics/googleplay'
import { PLAY_PACKAGE_IDS } from '@/lib/ads/store'

// ─── /api/admin/connections ──────────────────────────────────────────────────
//
// "Is it wired up?" for the data sources the console reads, answered from the
// deployment that holds the credentials, so nobody has to copy a key anywhere
// to find out. Admin-only. Returns account names and ids, never key material.
//
//   ?what=play        the Play reports bucket: which service account, what it
//                     can list under stats/installs/ and sales/, and each
//                     package's latest report day / 30-day totals
//   ?what=instagram   each app's Instagram id, where it came from (env or the
//                     linked Facebook Page), and what Meta returns for it
//   (no ?what)        both

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function play() {
  const packages = Object.entries(PLAY_PACKAGE_IDS).filter((e): e is [string, string] => !!e[1])
  const base = { configured: playConfigured(), bucket: playBucket(), account: playAccount(), packages: Object.fromEntries(packages) }
  if (!base.configured) return { ...base, error: 'PLAY_REPORTS_BUCKET and PLAY_REPORTS_SA_JSON must both be set on this deployment.' }
  const [installs, sales, earnings] = await Promise.all([
    listPlayReports('stats/installs/').then((files) => ({ files })).catch((e) => ({ error: msg(e) })),
    listPlayReports('sales/').then((files) => ({ files })).catch((e) => ({ error: msg(e) })),
    listPlayReports('earnings/', 20).then((files) => ({ files })).catch((e) => ({ error: msg(e) })),
  ])
  const apps = await Promise.all(packages.map(async ([slug, pkg]) => {
    const m = await fetchPlayCached(pkg)
    if ('error' in m) return { app: slug, package: pkg, error: m.error }
    return {
      app: slug, package: pkg, reportDate: m.reportDate, days: m.daily.length,
      last30: m.last30, allTime: m.history.allTime, otherCurrencies: m.otherCurrencies,
      countries: m.countries.slice(0, 5),
      installFiles: 'files' in installs ? installs.files.filter((f) => f.name.includes(`_${pkg}_`)).map((f) => f.name.replace('stats/installs/', '')) : [],
    }
  }))
  return {
    ...base,
    installs: 'files' in installs ? { count: installs.files.length, files: installs.files.map((f) => `${f.name} (${f.size} B, ${f.updated.slice(0, 10)})`) } : installs,
    sales: 'files' in sales ? { count: sales.files.length, files: sales.files.map((f) => `${f.name} (${f.size} B, ${f.updated.slice(0, 10)})`) } : sales,
    earnings: 'files' in earnings ? { count: earnings.files.length, files: earnings.files.map((f) => f.name) } : earnings,
    apps,
  }
}

async function instagram() {
  const token = process.env.META_ACCESS_TOKEN
  const apps = await withInstagram(analyticsRegistry())
  return Promise.all(apps.map(async (a) => {
    const envId = process.env[`${a.id.toUpperCase()}_IG_ACCOUNT_ID`] || null
    const id = a.instagramAccountId ?? null
    const row = { app: a.id, igAccountId: id, from: envId ? 'env' : id ? 'facebook page' : 'none' }
    if (!id) return { ...row, status: 'no Instagram id — set <APP>_IG_ACCOUNT_ID or link the Instagram to the app’s Facebook Page' }
    if (!token) return { ...row, status: 'META_ACCESS_TOKEN is not set' }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=id,username,name,followers_count,media_count,ig_id&access_token=${token}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { ...row, status: `HTTP ${res.status}`, meta: body?.error ? { type: body.error.type, code: body.error.code, subcode: body.error.error_subcode, message: body.error.message } : body }
      return {
        ...row, status: 'ok', username: body.username ?? null, name: body.name ?? null,
        followers_count: body.followers_count ?? null, media_count: body.media_count ?? null,
        // Meta returns followers_count only for a professional (business/creator)
        // Instagram account that the token's system user can see; a missing key
        // (not 0) means the id is a personal account, a Page id, or not assigned.
        hasFollowersField: 'followers_count' in body,
        fields: Object.keys(body),
      }
    } catch (e) { return { ...row, status: `request failed: ${msg(e)}` } }
  }))
}

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const what = new URL(req.url).searchParams.get('what')
  const out: Record<string, unknown> = { checkedAt: new Date().toISOString() }
  if (!what || what === 'play') out.play = await play().catch((e) => ({ error: msg(e) }))
  if (!what || what === 'instagram') out.instagram = await instagram().catch((e) => ({ error: msg(e) }))
  return NextResponse.json(out)
}
