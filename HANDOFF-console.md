# Handoff → Claude Code: Console page (clarendon.dev/admin + Studio Apps tab) — 2026-10-27 (Cowork)

One card per app (Rolligan, Gag Order, YulePick, Borea, Jinglewire), 3 across on desktop, 1 on a phone, app accent; every card shows downloads 7d (+ change vs prior 7d), proceeds 7d, ad spend 7d, active campaigns, rating / new reviews and the app's top Ad insights action (with its button); tap → that app's Analytics. Server stats are an extra row only when the app's admin API is connected; otherwise a one-line "Server stats: not connected · Connect" (Rolligan: "No server — store & ads only"). Header: "5 apps · N servers connected · last sync h:mm". YulePick + Borea admin connections finished if missing; Jinglewire: propose before building. Same on Studio iOS.

## Result (Claude Code, 2026-10-27 late)
- **Built:** `src/lib/consoleSummary.ts` (`consoleCards()` — per app: App Store 7d vs prior 7d from the daily series, rating + new reviews via ASC `customerReviews` (`fetchReviews`, 10-min cache; `fetchAppStoreCached`), ad spend 7d + active campaigns from the Campaigns rows, the top Ad insights action through the shared rules + `enrichActions`, and the app's server pull), `/api/console` now also returns `cards` + `summary` (old `apps`/`missing` kept for the suggestion review and older Studio builds), `/admin` rebuilt around the cards (grid `minmax(340px)` → 3 across at 1180px, 1 on a phone; whole card is a link to `/analytics/<app>`; buttons inside stop the click), header line "5 apps · N servers connected · last sync h:mm". `ActionItem` extracted from the This week card (`src/components/analytics/Insights.tsx`) so the Console shows the same Do-it button.
- **Admin connections found:** Gag Order ✓ (env set). **YulePick and Borea both already have a `studio-admin` edge function deployed** (YulePick: users, exchanges, active, members, wishlist items, names drawn, waitlist; Borea: active users 7d/30d, AI requests 7d, AI cost 30d, subscribers, paywall hits 7d) — but neither answers: YulePick returns 401 for the token in `secrets/yulepick-admin.env` (the function's `ADMIN_TOKEN` secret isn't set to it), Borea has no token on disk. **Setting edge-function secrets and Vercel env vars was refused by the auto-mode classifier ("Secret-Store Writes")** — Brian runs (from `~/code/clarendon-labs`):
  ```
  # YulePick (token already in secrets/yulepick-admin.env)
  supabase secrets set "ADMIN_TOKEN=$(cut -d= -f2 secrets/yulepick-admin.env | tr -d '"')" --project-ref dffpelfiqsxtlgvmnzgv
  printf 'https://dffpelfiqsxtlgvmnzgv.supabase.co/functions/v1/studio-admin' | vercel env add YULEPICK_ADMIN_URL production --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd clarendon-dev-site
  cut -d= -f2 secrets/yulepick-admin.env | tr -d '"\n' | vercel env add YULEPICK_ADMIN_TOKEN production --sensitive --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd clarendon-dev-site
  # Borea (make a token first)
  echo "BOREA_ADMIN_TOKEN=$(openssl rand -hex 24)" > secrets/borea-admin.env && chmod 600 secrets/borea-admin.env
  supabase secrets set "ADMIN_TOKEN=$(cut -d= -f2 secrets/borea-admin.env)" --project-ref lexhmdbwopgbcagmhwyi
  printf 'https://lexhmdbwopgbcagmhwyi.supabase.co/functions/v1/studio-admin' | vercel env add BOREA_ADMIN_URL production --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd clarendon-dev-site
  cut -d= -f2 secrets/borea-admin.env | tr -d '\n' | vercel env add BOREA_ADMIN_TOKEN production --sensitive --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd clarendon-dev-site
  vercel redeploy --prod --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd clarendon-dev-site   # or push any commit
  ```
  Then both cards grow a Server row automatically (the console reads the generic `stats` / `recent` arrays).
- **Jinglewire — proposal (not built):** its Supabase project (sleighline, `yxdkuxbdvmfcdylsfxhw`) has **no public tables** — the three functions (anam-session-token, heygen-session-token, call-report) mint session tokens and report calls without storing rows. A `/api/admin`-style `studio-admin` function would have nothing to count until `call-report` writes a `call_reports` row (family id hash, started_at, duration, vendor, cost). Proposal: (1) a `call_reports` table written by `call-report` (no child data, no transcripts), (2) a `studio-admin` edge function like YulePick's returning calls 7d / 30d, average minutes, vendor cost 30d, families with a completed call; token-protected, ~60 lines. Say yes and it's an hour.
- **Rolligan:** "No server — store & ads only", no Connect link. Jinglewire shows "Server stats: not connected · Connect" with the proposal note.
- **Studio iPhone:** Apps tab shows the same cards (store 7d + change, proceeds, ad spend, campaigns, rating, top action with its button); App detail's "Inside <app>" keeps the server stats or the one-line not-connected note. No new Swift files → no xcodegen. **Brian: `./build-to-phone.sh`.**

### Update (Claude Code, 2026-10-27 late) — YulePick + Borea connected
- Brian pasted the commands back; they ran: `ADMIN_TOKEN` set on both `studio-admin` functions, `YULEPICK_ADMIN_URL/_TOKEN` and `BOREA_ADMIN_URL/_TOKEN` added to Vercel production, site redeployed. Both functions answer: YulePick → Users 6, Exchanges 4, Active 4, Members 7, Wishlist items 7, Names drawn 4, Waitlist 1. Borea → Active users 7d 0 / 30d 0, AI requests 7d 101, AI cost 30d $6.11, Subscribers 0, Paywall hits 7d 12. (Borea counts 101 AI requests but 0 active users — its function keys users off a column the requests may not carry; worth a look in `borea-ios/supabase/functions/studio-admin`.)
- Tokens live in `secrets/yulepick-admin.env` and `secrets/borea-admin.env` (600) only.

### Update 2 (Claude Code, 2026-10-27 late) — Jinglewire built, Borea active-users fixed; deploys need Brian
- **Jinglewire (yes from Brian):** `call_reports` table applied on sleighline (`yxdkuxbdvmfcdylsfxhw`) — kind (call_start | report), vendor, lines, duration_seconds, status, safety_flag; no child data, no transcript, no account or device id. `supabase/functions/_shared/calls.ts` (`logCallEvent`), `studio-admin` function (Calls started 7d/30d, Reports 7d, Avg call min, Flagged 30d; recent list), one-line inserts in `anam-session-token`, `heygen-session-token` (call_start) and `call-report` (report row; also reads an optional `durationSeconds` from the app). **Deploying edge functions was refused in auto mode** — Brian runs from `~/code/clarendon-labs/jinglewire-ios`:
  ```
  supabase functions deploy studio-admin --no-verify-jwt --project-ref yxdkuxbdvmfcdylsfxhw
  supabase functions deploy anam-session-token --project-ref yxdkuxbdvmfcdylsfxhw
  supabase functions deploy heygen-session-token --project-ref yxdkuxbdvmfcdylsfxhw
  supabase functions deploy call-report --project-ref yxdkuxbdvmfcdylsfxhw
  supabase secrets set "ADMIN_TOKEN=$(cut -d= -f2 ../secrets/jinglewire-admin.env)" --project-ref yxdkuxbdvmfcdylsfxhw
  printf 'https://yxdkuxbdvmfcdylsfxhw.supabase.co/functions/v1/studio-admin' | vercel env add JINGLEWIRE_ADMIN_URL production --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd ../clarendon-dev-site
  cut -d= -f2 ../secrets/jinglewire-admin.env | tr -d '\n' | vercel env add JINGLEWIRE_ADMIN_TOKEN production --sensitive --scope team_y14GgYoCBbkm7GfiXQmlwoHb --cwd ../clarendon-dev-site
  ```
  (`secrets/jinglewire-admin.env` was generated, mode 600.) The jinglewire-ios repo has no commits yet, so the function files sit in the working tree — commit them with the rest when that repo gets its first commit.
- **Borea active users:** the query wasn't reading the wrong table — the ledger has no identity. `resolveOwner` only knew Apple's `originalTransactionId` from a verified entitlement, and every request in 30 days arrived with no entitlement (47/47 checks "missing"; 0 subscribers), so all 688 `macro_usage` rows have a null owner. Fix (borea-ios `<hash>`): the app sends a random per-install UUID (`InstallID`, UserDefaults — not the device id) as `installId`; all 10 `guard.ts` copies fall back to `install:<uuid>` (free users metered per person too); `studio-admin` counts subscription + install owners and shows "—" with "Usage rows carry no id yet — counts start with Borea 1.2 (installId)" until rows with ids exist. Ships with Borea 1.2; the functions need redeploying — Brian runs from `~/code/clarendon-labs/borea-ios`:
  ```
  for f in macro-ask macro-brief macro-dexa-insight macro-dexa-parse macro-explain macro-menu macro-plan macro-review macro-speak macro-suggest; do supabase functions deploy $f --project-ref lexhmdbwopgbcagmhwyi; done
  supabase functions deploy studio-admin --no-verify-jwt --project-ref lexhmdbwopgbcagmhwyi
  ```
- Site: the Jinglewire Connect note now names the env vars.
