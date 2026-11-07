# HANDOFF — Household (personal finances + Claude advisor + second admin login)

Written 2026-11-07 by the master Clarendon Labs project (Cowork). FEAT-CLA-027.

## The spec
Read, in full, before coding:
`~/Library/CloudStorage/GoogleDrive-brian@clarendon.dev/My Drive/Clarendon/Studio/Admin-Money/Admin-Money-spec-addendum-3-household.md`
(together with `Admin-Money-build-spec.md` and addenda 1–2 in that folder). Where it conflicts with older docs, the addendum wins.

## State today
- Admin auth: `src/lib/supabase/guard.ts` accepts exactly `ADMIN_EMAIL` + TOTP (aal2). Studio iPhone sends a bearer token through the same check.
- Every money table has RLS `owner_id = auth.uid()`; every row is owned by `STUDIO_OWNER_ID` (Brian). A second user would see nothing.
- Plaid: production, Transactions only, `src/lib/money/plaid.ts`, sync via `/api/cron/plaid-sync` + `/api/plaid/webhook`. **Investments product requested 2026-11-07, pending Plaid review** — build against sandbox (`ins_109508` has investment accounts) and switch when approved.
- Second member: **andrewjmachado@gmail.com** (Brian's husband). He sees everything — Household and the business Money section.
- Market data: Financial Modeling Prep, account created 2026-11-07 (brian@clarendon.dev, free tier, 250 calls/day). The key is in `~/code/clarendon-labs/secrets/fmp.env` (`FMP_API_KEY=…`). Push it to Vercel with `vercel env add FMP_API_KEY production preview development --scope clarendonlabs --project clarendon-labs-site` (value via stdin from the file). Never print it.
- Vercel env `ADMIN_EMAILS=brian@clarendon.dev,andrewjmachado@gmail.com` — the Vercel connector refused the write (403), so set it yourself with `vercel env add ADMIN_EMAILS production preview development --scope clarendonlabs --project clarendon-labs-site`. Keep the `ADMIN_EMAIL` fallback in code.

## Still to do (in order)
1. **Section A — second user.** `ADMIN_EMAILS` in guard.ts (+ console.ts comment), `studio_members` table, `is_studio_member()`, rewrite every RLS policy, `force_studio_owner` triggers, `/auth/set-password` page, `/admin/security` members list. Migration file: `supabase/studio-migrations/20261107_household_members.sql`. Apply it with the Supabase MCP / dashboard SQL editor on project **clarendon-studio** (not an app project).
2. **Section B — schema** `20261107_household.sql`, plus `scope = 'studio'` filters on the business views/exports listed in the spec.
3. **Section C — Plaid by type + investments sync** (`src/lib/money/plaidInvestments.ts`, link-token `products` by type, exchange writes scope, webhooks HOLDINGS / INVESTMENTS_TRANSACTIONS, cron).
4. **Section D — FMP quotes** (`src/lib/household/marketData.ts`, `quotes` cache, 15:15 CT close snapshot).
5. **Section F — UI** `/household` Overview, Accounts, Holdings, Activity, Settings. Light mode, Studio design rules.
6. **Section E — advisor** (`src/lib/household/advisor.ts`, `/api/household/advisor` run/ask/actions, weekly cron Monday 07:00 CT) + Advisor tab.
7. **Section G — privacy line** on `/admin/privacy`.
8. **Studio iPhone**: write `~/code/clarendon-labs/studio-ios/HANDOFF-household.md` (models + Household tab) — mark Unverified until it builds.
9. Commit in small steps; push; confirm the Vercel production deploy matches `origin/main`.

## When you finish or get stuck
End with a code block titled **"Paste back to Cowork"**: commits, what's live, what's unverified, which migrations were applied, and the exact next action for Cowork (e.g. "invite andrewjmachado@gmail.com from the Supabase dashboard now — the set-password page is live").
