# HANDOFF — ship the 2026-11-12 master sweep (several repos)
Written by Cowork (master project), which can't build, commit or push. Do these in order; stop and report on any failure. Use HTTPS remotes. Never print secret values.

## 1. clarendon-dev-site (this repo)
- Changed (uncommitted): `src/lib/ads/meta.ts` — `appFromName` now also reads the app from a `/get/<app>` link in the campaign name. Business Suite names its campaigns "[11/6/2026] Promoting https://clarendon.dev/get/rolligan?ct=…", so those rows landed in `ad_spend` with `app_slug = null` ($86.59 of November Meta spend showed under no app). Rows already in the table were fixed by SQL on 2026-11-12; this stops the nightly cron writing null again.
- `npx tsc --noEmit` and `npm run build`; commit `Meta spend: map Business Suite campaigns to their app via the /get/<app> link`; push. After the deploy is READY, call the ad-spend cron once (same way the cron does) and confirm no `ad_spend` row for campaigns 120254103530670237 / 120254103588070237 went back to null.
- Leave `redesign-port.patch`, `ship-rolligan-icon.command`, `supabase/studio-migrations/20261005_wipe_sandbox_data.sql` alone. Commit the HANDOFF-*.md files that are modified/untracked (docs only).

## 2. yulepick-web
- Changed (uncommitted): `webapp/public-root/.well-known/apple-app-site-association` (adds the `/start` path next to `/join/*`) and `vercel.json` (`/start` → `/` redirect for browsers). Purpose: the App Store in-app event "Black Friday Draw Weekend" needs an event deep link; `https://www.yulepick.com/start` opens the installed app at home (the shipped app ignores non-join links and just opens).
- Check `vercel.json` still parses and nothing else in it changed (`git diff`). Commit `Universal link /start for the App Store event deep link`; push; wait for Vercel READY.
- Verify: `curl -s https://www.yulepick.com/.well-known/apple-app-site-association` shows both paths, is served as application/json with no redirect; `curl -sI https://www.yulepick.com/start` is a 307/302 to `/`; `curl -sI https://www.yulepick.com/join/ABC123` still returns 200.
- Also commit the untracked `HANDOFF-android.md` and `ship-webapp.command`. Leave `_site-refresh-2026-10-30/` untracked.

## 3. gagorder-web
- Changed (uncommitted): `app/privacy/page.tsx` — rewritten to match what the app really stores now: optional player photos, Google Play purchases, the Android app, 6-hour close / 7-day delete, interaction + Exhibit A + song-request data, and the Stripe checkout email (the old page said "no email addresses", which was wrong for web buyers). Effective date 2026-11-12.
- `npm run build`; commit `Privacy: photos, Google Play, retention, interactions (2026-11-12)`; push; confirm https://gagorder.app/privacy shows "Effective November 12, 2026".
- Do NOT touch the four untracked files (`brand/`, `commit-web-fixes.sh`, `lib/thankYou.ts`, `ship-website-refresh.command`).

## 4. Repo hygiene (nothing here changes app behaviour)
- gagorder-ios (`master`): 2 commits not pushed; add `paywall-shot.command`; push.
- rolligan-ios (`main`): 4 commits not pushed (through `dde49b4` 1.4.3 (20) Meta SDK build). Look at the uncommitted `Rolligan.xcodeproj/project.pbxproj` + `Scripts/upload-build.command` diff: if it is only what `xcodegen generate` / the 27.2 script update produces, commit it with `Scripts/install-metal-toolchain.command`; push. Do NOT upload or submit 1.4.3 — Rolligan ads are paused; report whether build 20 was ever uploaded (check `build/archive.log`).
- borea-ios (`redesign/veil`, no upstream): commit the Xcode 27.2 script/HANDOFF edits as "Build with Xcode 27.2 (Xcode.app 27B52)"; push the branch with `-u`. Report whether `main` on GitHub contains the released 1.2 (Veil) code or whether this branch needs merging (don't merge without Brian).
- jinglewire-ios, yulepick-android, studio-ios: commit the modified/untracked HANDOFF / `.command` files (docs/scripts only); push.
- gagorder-android and rolligan-android have NO git remote (code only exists on this Mac). First run `git ls-files | grep -i -E 'keystore|\.jks|\.p8|\.pem|secret|\.env'` in each — if anything matches, stop and report. Otherwise `gh repo create brianlong1848-del/<name> --private --source . --push` and add both to the folder map in `~/code/clarendon-labs/CLAUDE.md`.
- Delete the stale `.git/stale-*` lock files noted in earlier handoffs where present (they are safe to remove).

## 5. Finish
End with a "Paste back to Cowork" block: commit SHAs per repo, Vercel deployment ids + state for the three sites, the curl results from step 2, the rolligan-ios build-20 answer, the borea-ios branch answer, and anything skipped.
