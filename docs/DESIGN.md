# Clarendon Studio — admin design rules

The rules every screen under `/admin`, `/inbox`, `/analytics`, `/post` (and the
Studio iPhone app) follows. Written 2026-10-19 from a full walkthrough of the
live console with the frontend-design + design-critique skills. Tokens live in
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

## Palette (keep, but use with discipline)

| Token | Hex | Use |
|---|---|---|
| paper | #F6F7F9 | page background |
| card | #FFFFFF | containers that hold a group of things |
| ink | #0F1115 | text, primary buttons |
| ink2 / soft | #5B616E / #6B7280 | secondary text, captions |
| rule / rule2 | #E6E8EC / #D5D9E0 | hairlines, input borders |
| teal (`C.mint`) | #0B7A83 | links, "ready/healthy", positive money, focus ring |
| loss | #B4532A | money below zero, everywhere the same |
| red | #C24A4A | errors and destructive actions only — never for "money is negative" |

Remove: the indigo→teal gradient (`C.grad`) on buttons, the radial colour
blobs behind page headers, the four pastel KPI tints (`TILE`), the
gradient sidebar highlight. They are decoration, not information.

## Type

- **Geist** for all UI text. Sentence case everywhere.
- **Besley** (the logo face) for page titles only (h1, 34px/1.1, weight 800).
  It ties the console to the Clarendon wordmark and is the only serif.
- **Geist Mono** only for figures that line up in columns (money, counts in
  tables) via `font-variant-numeric: tabular-nums`. Never for labels.
- Labels above values: 12px Geist 600, `ink2`, sentence case
  ("Revenue · 30 days" → "Revenue, last 30 days"). No tracked-out ALL CAPS
  eyebrows. No `textTransform: 'uppercase'` anywhere in the console.
- Scale: 34 / 22 / 17 / 15 / 13.5 / 12. Body 14–15, line-height 1.5.

## Layout

- Sidebar 212px, content max 1180px, left-aligned (not centred), 32px gutter;
  16px gutter under 700px.
- A card holds a group. Not every number gets its own card: a row of figures
  is one card with dividers, not four cards.
- Radius: 18 for page-level cards, 12 for items inside them, 8 for thumbnails,
  99 for chips. Shadow: none at rest; hairline borders do the work.
- Tables: icon + name inline, figures right-aligned in tabular mono, row
  height 48, hover tint `card2`.
- Forms: two columns on desktop (form left, context/recent right) instead of a
  form stretched across 2/3 of the page with empty space beside it.

## Buttons and words

- Three buttons only: primary (ink solid), secondary (white, rule2 border),
  destructive (white, red text). Teal is for links, not buttons.
- One primary per region. Repeated row actions are secondary.
- Button text says what happens: "Publish", "Retry", "Move to business".
  No "→" on buttons or links; no "Learn more".
- Empty states say what to do next, with the button to do it.
- Meta lines: at most two facts joined with " · ". More than that becomes
  separate lines or columns.
- Loading: never a bare "Loading…" line for more than a beat. Show the page's
  skeleton, or the last known data with a small "Updating…" pill (see
  `/post` → `ACCOUNTS_KEY`).

## Motion

One page-load reveal is allowed; nothing else animates on its own. Motion
answers an action (open, expand, confirm). Respect `prefers-reduced-motion`.

## Quality floor

Works at 390px wide (sidebar becomes a top bar), visible keyboard focus
(2px teal ring), contrast AA for all text, tap targets ≥ 40px on touch.
