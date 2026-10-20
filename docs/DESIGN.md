# Clarendon Studio — admin design rules

The rules every screen under `/admin`, `/inbox`, `/analytics`, `/post` (and the
Studio iPhone app) follows. Written 2026-10-19 from a full walkthrough of the
live console with the frontend-design + design-critique skills, on top of
the approved FEAT-CLA-017 redesign (which these rules keep). Tokens live in
`src/components/AdminNav.tsx` (`C`, `btn`, `STUDIO_APPS`).

## What this tool is

A one-person studio's control room: five apps (Rolligan, Gag Order, YulePick,
Borea, Jinglewire), each with money, posts, ads, players and feedback. Brian
opens it on a Mac to answer "what's going on with each app, and what needs
me?" — and on an iPhone between other things. Every screen should answer that
in the first glance, by app.

## The one bold thing: the app is the unit

Each app's accent colour is its identity everywhere (Rolligan #F2814F, Gag
Order #F0509A, YulePick #E8474C, Borea #22D3C4, Jinglewire #1F6B3A). Anything
that belongs to one app carries:

- the app icon (rounded 22% of its size) + name, inline on one line, and
- a 4px accent edge on its container (top edge on a card, left edge on a row
  group).

Use the shared `<AppTag>` / lane pattern (see Post → Queue → All apps). Never
stack the icon above the name. Everything else on the page stays neutral so
the five colours are the only colour that means "which app".

## The approved look (FEAT-CLA-017, 2026-10-18 — keep it)

Brian approved the light, colourful redesign: "modern, light, colourful, with
animation and glow welcome". Light mode only. Nothing in this file removes
it; these rules only make it consistent.

| Token | Hex | Use |
|---|---|---|
| paper | #F6F7F9 | page background, with the aurora behind the page header |
| card | #FFFFFF | containers that hold a group of things |
| ink | #0F1115 | text, solid buttons |
| ink2 / soft | #5B616E / #6B7280 | secondary text, captions |
| rule / rule2 | #E6E8EC / #D5D9E0 | hairlines, input borders |
| teal (`C.mint`) | #0B7A83 | links, ready/healthy, positive money, focus ring |
| teal → indigo gradient (`C.grad`) | | the primary action |
| tile tints (`TILE`) | teal, indigo, coral, violet | KPI tiles |
| loss | #B4532A | money below zero, everywhere the same |
| red | #C24A4A | errors and destructive actions only |

Discipline that keeps the colour meaningful:

- **One gradient button per region** — the main action of that card or
  screen. Repeated row actions ("Moved to business" on every subscription,
  "Retire" on every card) are secondary (white, hairline).
- **Tiles hold KPIs**, one tint per figure in `TILE` order; never tint a
  card that holds a list or a form.
- **The aurora** stays behind page headers only; never behind content cards.
- **App colours** only mean "which app" (below) — never decoration.

## Type

- **Geist** for UI; **Besley** only in the "C." logo mark.
- Small labels above figures: the house style is Geist Mono, 10.5–11.5px,
  tracked, uppercase — use the shared `label` style so every page matches.
  Labels say what the figure is in plain words ("Revenue, 30 days").
- Figures in tables: tabular-nums, right-aligned.
- Scale: 34 / 22 / 17 / 15 / 13.5 / 12. Body 14–15, line-height 1.5.

## Layout

- Sidebar 212px, content max 1180px, left-aligned (not centred), 32px gutter;
  16px gutter under 700px.
- A card holds a group. Headline KPIs are tiles (up to four in a row);
  secondary figures sit inside their card as columns, not as more cards.
- Radius: 18 for page-level cards, 12 for items inside them, 8 for thumbnails,
  99 for chips. Shadow: the existing soft card shadow only; hairline borders do the rest.
- Tables: icon + name inline, figures right-aligned in tabular mono, row
  height 48, hover tint `card2`.
- Forms: two columns on desktop (form left, context/recent right) instead of a
  form stretched across 2/3 of the page with empty space beside it.

## Buttons and words

- Buttons: primary (gradient), solid (ink, for a strong secondary like
  Retry), secondary (white, rule2 border), destructive (white, red text).
  One primary per region. Repeated row actions are secondary.
- Button text says what happens: "Publish", "Retry", "Move to business".
  No "→" on buttons or links; no "Learn more".
- Empty states say what to do next, with the button to do it.
- Meta lines: at most two facts joined with " · ". More than that becomes
  separate lines or columns.
- Loading: never a bare "Loading…" line for more than a beat. Show the page's
  skeleton, or the last known data with a small "Updating…" pill (see
  `/post` → `ACCOUNTS_KEY`).

## Motion

Animation and glow are welcome (the aurora drift, the primary button's glow,
tile reveals). Everything stops under `prefers-reduced-motion` / Reduce Motion.

## Quality floor

Works at 390px wide (sidebar becomes a top bar), visible keyboard focus
(2px teal ring), contrast AA for all text, tap targets ≥ 40px on touch.

## Pattern: country editions in the queue (added 2026-10-20)

Apps that post to more than one country (Rolligan, Borea, YulePick) get
three extra pieces. Gag Order and Jinglewire never show any of them.

| Piece | What it is | Rule |
|---|---|---|
| `CountryTag` | flag + country name chip | Only where countries are mixed. A lane whose posts are all one country says it once, in the lane header — never "United States" on every row. |
| `FlagStack` | up to 4 overlapping flags, then "+N" | Marks one multi-country post. |
| Edition row | one row per `edition_group` | A multi-country post is one idea, so it's one row: first edition's thumbnail and caption, FlagStack, "N countries · same local time". "Editions" opens the per-country rows (country, that country's local time, Cancel each). |

**Group the queue by:** a small "Apps · Countries" switch on the All-apps
view (remembered per browser).

- **Apps** (default): one lane per app, AppTag + accent top edge.
- **Countries:** one lane per country with anything scheduled, in the
  `MARKETS` order (US first). Header: big flag, country, language, how many
  scheduled, the time there now, and the apps present. Rows show times in
  that country's clock with Brian's own time underneath, and carry their app
  as an AppTag plus a 3px accent bar on the left (the app is the
  secondary dimension here).

Lanes pack as masonry (CSS columns, `break-inside: avoid`) so a short lane
never leaves a hole. Apps with nothing scheduled share one strip at the
bottom ("Nothing scheduled: YulePick · Borea — Compose") instead of a lane
each. The iPhone app mirrors this (`AppChip`, `CountryTag`).
