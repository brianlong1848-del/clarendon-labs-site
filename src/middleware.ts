import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { bearerToken, isAdmin, isAdminToken } from '@/lib/supabase/guard'

// Every studio page and every studio API route goes through here first, and
// each API route re-checks on its own (src/lib/console.ts → consoleAuthed).
// Not covered on purpose: /api/feedback (public, in-app feedback),
// /api/cron/* (CRON_SECRET), /api/publish/run (pg_cron bearer secret or an
// admin session, checked inside the route), /login.

export const config = {
  matcher: [
    '/admin/:path*', '/analytics/:path*', '/inbox/:path*', '/post/:path*',
    '/api/console/:path*', '/api/analytics/:path*', '/api/inbox/:path*',
    '/api/admin/:path*', '/api/money/:path*',
    '/api/publish/((?!run$).*)', '/api/publish',
  ],
}

export async function middleware(req: NextRequest) {
  // The admin privacy policy is public (Plaid reads it); it shows no data.
  if (req.nextUrl.pathname === '/admin/privacy') return NextResponse.next()

  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_STUDIO_SUPABASE_KEY ?? '',
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  if (await isAdmin(supabase).catch(() => false)) return res

  // Native Studio app: a Supabase access token with the second factor completed.
  const token = bearerToken(req.headers.get('authorization'))
  if (token && req.nextUrl.pathname.startsWith('/api/') && (await isAdminToken(token).catch(() => false))) return res

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`
  return NextResponse.redirect(url)
}
