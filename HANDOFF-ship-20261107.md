# HANDOFF — ship the 2026-11-07 master-project changes (three repos)
All edits are uncommitted and unbuilt; written by Cowork, which can't build or push. Do these in order and stop on any failure.

## 1. clarendon-dev-site (this repo)
- Changed: `src/lib/ads/store.ts` (PLAY_PACKAGE_IDS + playStoreUrl), `src/app/get/[app]/route.ts` (Android → Google Play, both store buttons). `tsc --noEmit` already passes. Leave `redesign-port.patch` and `supabase/studio-migrations/20261005_wipe_sandbox_data.sql` alone (not mine).
- `npm run build`; commit `/get: send Android to Google Play with a referrer token (FEAT-CLA-025)`; `git push` (HTTPS). Vercel deploys main. Check: `curl -A "Mozilla/5.0 (Linux; Android 14) Chrome/120" https://clarendon.dev/get/rolligan?ct=test` contains `play.google.com`, and with an iPhone UA contains `apps.apple.com`.

## 2. rolligan-web (`~/code/clarendon-labs/rolligan-web`)
- Changed: `src/App.jsx`, `src/JoinGame.jsx`, `src/index.css`, `index.html` (Play badges, Android copy, post-game GetTheApp banner — FEAT-ROL-023). `docs/ios-app-store-handoff.md` was already modified before me; include it only if its diff is obviously fine.
- Stale lock files `.git/stale-*` can be deleted. `npm run build`; `npx eslint src/JoinGame.jsx` — the 5 hooks errors are pre-existing (lines ~192–410), not in GetTheApp. Preview `/join?code=XXXX` game-over if a quick demo room is possible; otherwise ship. Commit `Play badges + post-game install banner (FEAT-ROL-023)`, push.

## 3. gagorder-web (`~/code/clarendon-labs/gagorder-web`)
- Changed by me: `app/HomeClient.tsx` (PlayBadge/StoreBadges, Android section), `app/page.tsx` (description), `app/home.css` (`.gh-badges`). Already-uncommitted before me in the same files: London/Vancouver/Toronto "coming soon" chips + dock copy — ship them together. Untracked `brand/`, `commit-web-fixes.sh`, `lib/thankYou.ts`, `ship-website-refresh.command`: ask Brian or leave untracked.
- `npm run build`; commit `Google Play badge + Android host copy; cities coming soon (FEAT-GAG-027)`; push.

## 4. Then
- Read `~/code/clarendon-labs/gagorder-ios/HANDOFF-pricing.md` and start FEAT-GAG-028 (web gate first).
- Finish with a "Paste back to Cowork" block: commit SHAs, Vercel deploy state for all three, curl results, anything skipped.

## 5. (added later the same evening) /analytics "This week" round 2 — FEAT-CLA-023
Changed by Cowork, uncommitted: `src/lib/ads/narrative.ts` (conversational voice: headline + summary as a note to Brian, a plain-words "say" per ranked action; tool schema gained `headline` + `actions`), `src/app/api/ads/insights/route.ts` (each campaign now carries `media`, each action `say`, payload `headline`), `src/components/analytics/Insights.tsx` (headline/note block; each action shows a 92×164 playable tile of the ad via AdThumb + MediaViewer, Claude's sentence first, "Show the numbers" reveals the rules-engine detail), `src/components/analytics/AdThumb.tsx` (width/height/radius props), `src/components/AdminNav.tsx` (`.adm-action` stacks under 600px).
- `tsc` + eslint clean. Build, screenshot /analytics at 1440 and 390 (signed in), commit `This week: playable ad tiles + analyst voice (FEAT-CLA-023)`, push. The first load after deploy shows the OLD cached write-up (no `say`/`headline`) until Brian presses Regenerate — say so in the paste-back.
- Studio iPhone app: new fields are optional; `StudioAPI` models can add `media` + `say` + `headline` later (HANDOFF note left for studio-ios).
- Also in step 5: `src/lib/ads/meta.ts` asks Graph for `creative.thumbnail_width(1080).thumbnail_height(1080)` and `src/lib/ads/media.ts` treats an unreadable IG media as image+permalink. The ads list is cached an hour (`meta-ads:<campaign>`), so after deploy press Regenerate (fresh=1) once to re-pull the sharp thumbnails. If Graph rejects the field modifier syntax (check the deploy's /api/analytics/campaigns errors), fall back to `creative{thumbnail_url,...}` and append `&thumbnail_width=1080&thumbnail_height=1080` as query params on that `ads` call instead.

## 6. (later) Meta thumbnail size — second try + Studio push (FEAT-CLA-027)
- Graph ignored `creative.thumbnail_width(1080)...` (no error, still 160px). `src/lib/ads/meta.ts` now passes `thumbnail_width=1080&thumbnail_height=1080` as query params on the `/ads` call. Commit as `Meta ad thumbnails at 1080px`, push, then Regenerate on /analytics and confirm the two "Promoting website" tiles are sharp (URL no longer says p160x160). If still 160, try `thumbnail_width` on `creative?fields=thumbnail_url` per ad (one call each, cached hourly).
- Studio push: see `HANDOFF-push.md` in studio-ios and the server files listed there (all uncommitted in this repo: `src/lib/push/*`, `src/app/api/push/**`, `src/app/api/cron/push-digest`, hooks in plaid webhook / ad-insights / asc-revenue crons, `vercel.json`, `supabase/studio-migrations/20261107_push.sql`). Build + commit `Studio push notifications (FEAT-CLA-027)` + push. Brian then runs the env paste and the migration from HANDOFF-push.md.
