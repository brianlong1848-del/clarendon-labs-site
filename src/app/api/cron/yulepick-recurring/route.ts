import { NextResponse } from 'next/server'

// Vercel Cron hits this daily (see vercel.json). It calls YulePick's
// run_recurring_clones() Supabase RPC, which auto-clones next-year instances
// of annual gift exchanges. Running it externally (rather than pg_cron) keeps
// it firing even if the Free-tier Supabase project pauses, and the request
// itself wakes the project.
export async function GET(request: Request) {
  // Vercel Cron passes a CRON_SECRET in the Authorization header.
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 })
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/run_recurring_clones`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (!response.ok) {
    const text = await response.text()
    return NextResponse.json({ error: text }, { status: response.status })
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() })
}
