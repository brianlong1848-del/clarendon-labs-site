# Handoff: admin console design pass (for Claude Code)

From the master Clarendon Labs session, 2026-10-19. A walkthrough of every live
console screen against `docs/DESIGN.md`. Do it in this order, one commit per
numbered step, and check each at 1440px and 390px with the dev server before
moving on. Brian pushes.

Don't change behaviour, data, or API routes, only presentation, except where
a step says so.

## 1. Shared foundation (`src/components/AdminNav.tsx`)

- Remove `C.grad` from `btn('mint')`: `mint` becomes the same as `solid`
  (ink). Keep the name so the 22 call sites still compile, then rename call
  sites to `btn('solid')` in the same commit. Drop the gradient hover glow
  rule in `SHELL_CSS`.
- Remove the radial colour blobs behind the page header (SHELL_CSS line with
  `radial-gradient(...)`) and the gradient on the active sidebar item (use
  `card` background + 3px teal left edge).
- `C.serif` → Besley for page titles only (`AdminShell` h1). Load Besley 800
  (it's already loaded for the logo).
- Add `C.loss = '#B4532A'` and use it for every negative money figure.
- Add a shared `AppTag` component: icon (20px, radius 5) + name inline,
  optional `size`. Add `appAccent(id)` from `STUDIO_APPS`.
- Add a shared `Label` (12px, 600, ink2, sentence case) and replace every
  `fontFamily: C.mono … textTransform: 'uppercase'` label (28 places; grep
  `textTransform: 'uppercase'`). Keep mono only for tabular figures.
- Retire `TILE` (pastel KPI tints).

## 2. Console (`src/app/admin/page.tsx`)

- Apps that aren't connected (Rolligan, YulePick, Borea, Jinglewire today)
  each take a full card to say "Not connected". Show connected apps as cards
  (Gag Order) and the rest as one compact row: four AppTags, each with its
  one-line "how to connect" on hover/expand.
- "Card suggestions" with nothing waiting: collapse to one line under the
  Gag Order card ("No suggestions waiting") instead of a full section header.
- Live community cards: fine, but the pack/tier/format chips → plain text
  "Lesbian · Free · Vote" in ink2; "Retire" stays secondary.
- Header right: "1 of 5 apps connected" is tiny and grey; make it part of the
  subtitle.

## 3. Inbox (`src/app/inbox/page.tsx`)

- First load shows "Gathering everything…" for ~8s on a blank canvas. Use the
  `/post` pattern: render the last result from localStorage
  (`clarendon:inbox-cache`) immediately, refresh in the background with an
  "Updating…" pill; skeleton rows on first-ever visit.
- Jinglewire is missing from the App filter list; add it (parents' messages
  will land here).
- Empty state is a small card floating top-left of a big empty area: make it
  fill the list column, and lead with the action ("Connect 10 more sources").
- Counts in the filter rail: right-align in tabular figures.

## 4. Analytics (`src/app/analytics/page.tsx`, `[app]/page.tsx`)

- Top: two lone KPI cards ("Revenue · 30 days", "New installs · 30 days")
  → one card with both figures + a 30-day sparkline each (data is already
  daily from ASC).
- Per-app sections: the four grey sub-cards (App Store / Instagram /
  Facebook / TikTok) each repeat mono caps labels; make them one row of four
  columns separated by hairlines inside the app card, with the AppTag + 4px
  accent edge on the app card.
- TikTok "Not connected yet — needs a TikTok ad account + access token":
  after Wednesday's token work this fills in; until then show it as a muted
  single line, not a full column.
- App detail page: KPI row of four separate cards → one card, four columns.

## 5. Money (`src/app/admin/money/*`)

- Overview: the four pastel tiles (Revenue / Costs / Ad spend / Profit) →
  one neutral card, four columns; Profit uses `C.loss` when negative.
  All-time P/L stays the hero of the page (it's the number Brian asked for).
- "LLC owes Brian $4,455" floating chip → a line in the All-time card.
- App table: icon stacked above the name → AppTag inline; figures tabular;
  "All-time" column in `C.loss`.
- Transactions: meta lines run 4–6 facts joined with " · " plus a full note.
  Split into: merchant (bold) / app + category (one line) / note (ink2,
  2-line clamp, full text on hover). Dates in tabular figures, not mono caps.
  Filters: one row on desktop (search grows, the rest compact selects).
- Quick Add & receipts: page is 2/3 wide with empty space to the right.
  Two columns: forms left (Quick add, Upload receipt), right column
  "LLC owes Brian" + Member loans + last 5 quick adds.
- Subscriptions: every row has a gradient "Moved to business" button →
  secondary buttons; one primary ("Add subscription") on the page.
- Triage empty state: fine; add a "Sync now" button under the text.

## 6. Post (`src/components/post/*`)

- Compose → Checks: on a fresh page every check is a red ×
  ("Instagram needs a photo or video") before Brian has done anything. Show
  unmet requirements as neutral "To do" (grey dot) until media or a caption
  is added; red only for real conflicts.
- Compose step numbers (01–05) stay: they are a real sequence.
- Queue → All apps lanes: keep. Lanes for apps with nothing at all
  (YulePick, Borea) should still appear as a slim lane so every app is
  visible ("Nothing scheduled · Compose").
- Accounts tab: green "Ready" tiles are fine; "Not yet" tiles lead with the
  button, reason below in ink2.
- Remove "→" from "Open", "Map & details", "Analytics" buttons.

## 7. Security

Fine as is; widen to the content column and add one line on what a passkey
replaces.

## Not design, found during the walkthrough (tell Brian, don't fix in code)

- Post → Accounts: **Rolligan's Threads shows @gagordergame**. Rolligan was
  connected while threads.net was signed in as Gag Order. Fix: sign in to
  threads.net as Rolligan's account, then Connect Threads for Rolligan.
- YulePick's Threads token hit a checkpoint (expired); needs a re-login on
  threads.net and reconnect.

## Studio iPhone app

Apply the same rules to `studio-ios` once the web pass lands (AppTag →
`AppChip` SwiftUI view, no gradient buttons, sentence-case labels). Ask Brian
for screenshots of each tab first.
