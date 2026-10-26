import { NextResponse } from 'next/server'
import { readState } from '@/lib/publish/tokens'
import { bizConnectFromCode } from '@/lib/publish/tiktokBiz'

// TikTok (API for Business) sends the browser back here after an app's TikTok
// account authorizes Studio. The signed state says which app; the auth_code
// becomes tokens, and we return to /post with the usual ?tiktok= notice.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const back = (msg: string) => NextResponse.redirect(new URL(`/post?tiktok=${encodeURIComponent(msg)}`, req.url))
  const appId = readState(q.get('state') ?? '', process.env.TIKTOK_BIZ_SECRET ?? '')
  if (!appId) return back('That sign-in link expired — try Connect TikTok again.')
  if (q.get('error')) return back(q.get('error_description') ?? 'TikTok sign-in was canceled.')
  const code = q.get('auth_code') ?? q.get('code')
  if (!code) return back('TikTok didn’t send a sign-in code (if this account had already approved Studio, press Connect TikTok again).')
  try {
    const name = await bizConnectFromCode(appId, code)
    return back(`connected:${appId}:${name ?? ''}`)
  } catch (e) {
    console.error('[tiktok-biz] connect:', (e as Error).message)
    return back(`Couldn’t connect TikTok: ${(e as Error).message}`)
  }
}
