import { NextResponse } from 'next/server'
import { readState, saveToken, threadsRedirect } from '@/lib/publish/tokens'

// Threads sends the browser back here after sign-in. The signed state says
// which app is being connected (so this needs no console password); we swap
// the code for a 60-day token, store it, and return to /post.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const back = (msg: string) => NextResponse.redirect(new URL(`/post?threads=${encodeURIComponent(msg)}`, req.url))
  const appId = readState(q.get('state') ?? '')
  if (!appId) return back('That sign-in link expired — try Connect again.')
  if (q.get('error')) return back(q.get('error_description') ?? 'Threads sign-in was canceled.')
  const code = q.get('code')
  if (!code) return back('Threads didn’t send a sign-in code.')

  try {
    const id = process.env.THREADS_APP_ID!, secret = process.env.THREADS_APP_SECRET!
    const short = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'authorization_code', redirect_uri: threadsRedirect(req), code }).toString(),
    }).then((r) => r.json())
    if (!short.access_token) throw new Error(short?.error_message ?? short?.error?.message ?? 'code exchange failed')

    const long = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${secret}&access_token=${short.access_token}`, { cache: 'no-store' }).then((r) => r.json())
    const token = long.access_token ?? short.access_token
    const me = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json())

    await saveToken({
      platform: 'threads', app_id: appId, account_id: me.id ?? String(short.user_id ?? ''), username: me.username ?? null, token,
      expires_at: new Date(Date.now() + (long.expires_in ?? 3600) * 1000).toISOString(),
    })
    return back(`connected:${appId}:${me.username ?? ''}`)
  } catch (e) {
    console.error('[threads] connect:', (e as Error).message)
    return back(`Couldn’t connect Threads: ${(e as Error).message}`)
  }
}
