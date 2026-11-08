# HANDOFF — Google Play badges on clarendon.dev (FEAT-CLA-025, 2026-11-08)
Written by Cowork (can't build/push). Uncommitted, tsc clean.

Mine: `public/assets/google-play-badge.svg` (new) and `src/app/{page,rolligan/page,support/page,privacy/page,terms/page,studio/page,yulepick/page}.tsx`.
NOT mine — leave alone: HANDOFF-ad-insights.md, HANDOFF-tiktok-ads.md, HANDOFF-ship-20261107.md, redesign-port.patch, ship-rolligan-icon.command, supabase/.

1. `npm run build` (stop on failure).
2. `git add public/assets/google-play-badge.svg src/app HANDOFF-play-badges.md` → commit `Google Play badges + Android copy on clarendon.dev (FEAT-CLA-025)` → `git push` (HTTPS).
3. After Vercel deploys: `curl -s https://clarendon.dev | grep -c google-play-badge.svg` should be 2, `/rolligan` 2, `/support` contains `dev.clarendon.gagorder` and `com.clarendonlabs.rolligan`, `/assets/google-play-badge.svg` returns 200 image/svg+xml.
4. Screenshot / and /rolligan at 1440 and 390 to confirm the two badges sit side by side at the same 40px height.
5. Remove `~/code/clarendon-labs/Claude outputs/tmp-preview/` (Cowork preview scratch).
6. End with a "Paste back to Cowork" block: SHA, deploy state, curl results.
