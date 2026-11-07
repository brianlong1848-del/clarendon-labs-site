import { NextResponse, type NextRequest } from 'next/server'
import { APP_STORE_IDS, PLAY_PACKAGE_IDS, STORE_APPS, cleanCt, playStoreUrl } from '@/lib/ads/store'

// ─── /get/<app> — the "Download" link in ads and captions (FEAT-CLA-024/026) ──
// Everyone gets a small HTML landing page whose App Store button carries Apple's
// campaign URL, so App Store Connect attributes the install:
//   https://apps.apple.com/app/apple-store/id<APP_ID>?pt=<provider>&ct=<token>&mt=8
// Humans are moved to the App Store by JavaScript the moment the page loads;
// the button is the fallback for anyone with scripts off.
//
// WHY NOT A 302 (2026-11-06): Meta's ad-link checker follows server redirects
// and <meta http-equiv="refresh">, then classifies the ad as an "App Url", which
// only the App Installs objective accepts — every website-visitors ad built with
// this link was rejected ("App Url is only supported by App Installs objective").
// The checker does not run JavaScript, so a JS redirect keeps the link a web
// page to Meta and a one-tap App Store jump for people. TikTok ads keep using
// the Apple campaign link directly (TikTok allows it).
//
//   APPSTORE_PROVIDER_TOKEN — the team's provider token (App Store Connect →
//     App Analytics → Campaigns → Generate Campaign Link shows it). Without it
//     the link still works, but Apple counts nothing: a warning is logged.
//
// ?ct=<token> (or utm_campaign) is cleaned to [a-z0-9_-], max 40 chars; 'direct'
// when missing. Apps with no App Store ID yet (APP_STORE_IDS) answer 404.
// ?stay=1 shows the page without the automatic jump (for checking it by eye).
//
// ANDROID (2026-11-07, FEAT-CLA-025): an Android user-agent jumps to Google Play
// instead (PLAY_PACKAGE_IDS), with a `referrer` that Play's acquisition report
// attributes (utm_campaign=<ct>). The page itself shows both store badges, so a
// desktop visitor or a wrong guess still has a one-tap path to either store.
// ?store=play|ios forces one (for checking by eye).

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ app: string }> }

const CRAWLER = /facebookexternalhit|facebot|meta-externalagent|bytespider|tiktokspider|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterestbot|applebot|googlebot|bingbot/i

function appleCampaignUrl(appStoreId: string, ct: string, pt: string | undefined) {
  const u = new URL(`https://apps.apple.com/app/apple-store/id${appStoreId}`)
  if (pt) u.searchParams.set('pt', pt)
  u.searchParams.set('ct', ct)
  u.searchParams.set('mt', '8')
  return u.toString()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(req: NextRequest, { params }: Ctx) {
  const app = (await params).app.toLowerCase()
  const storeId = APP_STORE_IDS[app]
  if (!storeId) return new NextResponse('Not found', { status: 404 })

  const q = req.nextUrl.searchParams
  const ct = cleanCt(q.get('ct') ?? q.get('utm_campaign') ?? '')
  const pt = process.env.APPSTORE_PROVIDER_TOKEN?.trim() || undefined
  if (!pt) console.warn(`[get/${app}] APPSTORE_PROVIDER_TOKEN is not set — linking with ct=${ct} but App Store Connect will not attribute it`)
  const target = appleCampaignUrl(storeId, ct, pt)

  const ua = req.headers.get('user-agent') ?? ''
  const isCrawler = CRAWLER.test(ua)
  const playId = PLAY_PACKAGE_IDS[app]
  const playTarget = playId ? playStoreUrl(playId, ct) : undefined
  const forced = q.get('store')
  const isAndroid = forced === 'play' ? true : forced === 'ios' ? false : /\bAndroid\b/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)
  const jumpTo = isAndroid && playTarget ? playTarget : target
  const autoJump = !isCrawler && q.get('stay') !== '1'
  const name = STORE_APPS[app]?.name ?? app
  const tagline = STORE_APPS[app]?.tagline ?? ''
  const icon = `https://clarendon.dev/icons/${esc(app)}.png`

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Get ${esc(name)} — Clarendon Labs</title>
<meta name="robots" content="noindex"><meta property="og:type" content="website"><meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(tagline)} Free on the App Store${playTarget ? ' and Google Play' : ''}."><meta property="og:image" content="${icon}">
<meta property="og:url" content="https://clarendon.dev/get/${esc(app)}">
<style>html,body{margin:0;background:#0b0b0f;color:#fff;font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 20px;text-align:center}
img{width:96px;height:96px;border-radius:22px}h1{font-size:28px;margin:0}p{margin:0;color:#c8c8d0;max-width:28rem}
a.btn{display:inline-block;margin-top:8px;padding:14px 26px;border-radius:999px;background:#fff;color:#0b0b0f;font-weight:700;text-decoration:none;font-size:17px}
a.btn.alt{background:transparent;color:#fff;border:1.5px solid #3a3a46;margin-top:0}
.btns{display:flex;flex-direction:column;gap:10px;align-items:center}
small{color:#7a7a86}</style></head>
<body><main><img src="${icon}" alt="" width="96" height="96"><h1>${esc(name)}</h1><p>${esc(tagline)} Free on the App Store${playTarget ? ' and Google Play' : ''}.</p>
<div class="btns">
<a class="btn${isAndroid && playTarget ? ' alt' : ''}" id="go-ios" href="${esc(target)}" rel="noopener">Get it on the App Store</a>
${playTarget ? `<a class="btn${isAndroid ? '' : ' alt'}" id="go-play" href="${esc(playTarget)}" rel="noopener">Get it on Google Play</a>` : ''}
</div>
<small>Opening ${isAndroid && playTarget ? 'Google Play' : 'the App Store'}${autoJump ? '…' : ''}</small></main>
${autoJump ? `<script>try{location.replace(${JSON.stringify(jumpTo)})}catch(e){}</script>` : ''}
</body></html>`

  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
