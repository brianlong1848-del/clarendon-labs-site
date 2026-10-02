import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin } from '@/lib/supabase/guard'

// Every studio page and every studio API route goes through here first, and
// each API route re-checks on its own (src/lib/console.ts → consoleAuthed).
// Not covered on purpose: /api/feedback (public, in-app feedback),
// /api/cron/* (CRON_SECRET), /api/publish/run (poked by pg_cron, only ever
// publishes already-due posts), /login.

export const config = {
  matcher: [
    '/admin/:path*', '/analytics/:path*', '/inbox/:path*', '/post/:path*',
    '/api/console/:path*', '/api/analytics/:path*', '/api/inbox/:path*',
    '/api/admin/:path*', '/api/money/:path*',
    '/api/publish/((?!run$).*)', '/api/publish',
  ],
}

export async function middleware(req: NextRequest) {
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

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`
  return NextResponse.redirect(url)
}
