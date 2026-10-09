import { NextResponse } from 'next/server'
import { readState } from '@/lib/publish/tokens'
import { connectFromCode } from '@/lib/publish/tiktok'

// TikTok sends the browser back here after sign-in. The signed state says
// which app is being connected; we swap the code for tokens, store them, and
// return to /post with the same ?tiktok= notice pattern as Threads.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const back = (msg: string) => NextResponse.redirect(new URL(`/post?tiktok=${encodeURIComponent(msg)}`, req.url))
  const appId = readState(q.get('state') ?? '', process.env.TIKTOK_CLIENT_SECRET ?? '')
  if (!appId) return back('That sign-in link expired — try Connect TikTok again.')
  if (q.get('error')) return back(q.get('error_description') ?? 'TikTok sign-in was canceled.')
  const code = q.get('code')
  if (!code) return back('TikTok didn’t send a sign-in code.')
  try {
    const name = await connectFromCode(appId, code)
    return back(`connected:${appId}:${name ?? ''}`)
  } catch (e) {
    console.error('[tiktok] connect:', (e as Error).message)
    return back(`Couldn’t connect TikTok: ${(e as Error).message}`)
  }
}
