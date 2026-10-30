import { NextResponse, type NextRequest } from 'next/server'
import { APP_STORE_IDS, STORE_APPS, cleanCt } from '@/lib/ads/store'

// ─── /get/<app> — the "Download" link in ads and captions (FEAT-CLA-024) ─────
// 302 to Apple's campaign URL so App Store Connect attributes the install:
//   https://apps.apple.com/app/apple-store/id<APP_ID>?pt=<provider>&ct=<token>&mt=8
//
//   APPSTORE_PROVIDER_TOKEN — the team's provider token (App Store Connect →
//     App Analytics → Campaigns → Generate Campaign Link shows it). Without it
//     the redirect still works, but Apple counts nothing: a warning is logged.
//
// ?ct=<token> (or utm_campaign) is cleaned to [a-z0-9_-], max 40 chars; 'direct'
// when missing. Apps with no App Store ID yet (APP_STORE_IDS) answer 404.
//
// Link crawlers (Meta's ad-link check, Threads/TikTok/Slack previews) get a tiny
// HTML page with the same link instead of the redirect: Meta refuses a website
// link that lands on apps.apple.com, and previews should show the app's name.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ app: string }> }

const CRAWLER = /facebookexternalhit|facebot|meta-externalagent|bytespider|tiktokspider|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterestbot|applebot/i

function appleCampaignUrl(appStoreId: string, ct: string, pt: string | undefined) {
  const u = new URL(`https://apps.apple.com/app/apple-store/id${appStoreId}`)
  if (pt) u.searchParams.set('pt', pt)
  u.searchParams.set('ct', ct)
  u.searchParams.set('mt', '8')
  return u.toString()
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const app = (await params).app.toLowerCase()
  const storeId = APP_STORE_IDS[app]
  if (!storeId) return new NextResponse('Not found', { status: 404 })

  const q = req.nextUrl.searchParams
  const ct = cleanCt(q.get('ct') ?? q.get('utm_campaign') ?? '')
  const pt = process.env.APPSTORE_PROVIDER_TOKEN?.trim() || undefined
  if (!pt) console.warn(`[get/${app}] APPSTORE_PROVIDER_TOKEN is not set — redirecting with ct=${ct} but App Store Connect will not attribute it`)
  const target = appleCampaignUrl(storeId, ct, pt)

  if (CRAWLER.test(req.headers.get('user-agent') ?? '')) {
    const name = STORE_APPS[app]?.name ?? app
    const tagline = STORE_APPS[app]?.tagline ?? ''
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Get ${esc(name)} — Clarendon Labs</title>
<meta name="robots" content="noindex"><meta property="og:title" content="${esc(name)}"><meta property="og:description" content="${esc(tagline)} Free on the App Store.">
<meta property="og:image" content="https://clarendon.dev/icons/${esc(app)}.png"><meta http-equiv="refresh" content="0;url=${esc(target)}"></head>
<body><p><a href="${esc(target)}">Download ${esc(name)} on the App Store</a></p></body></html>`
    return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  }

  return NextResponse.redirect(target, { status: 302, headers: { 'cache-control': 'no-store' } })
}
