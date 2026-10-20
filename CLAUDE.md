# clarendon-dev-site

- Admin console UI (`/admin`, `/inbox`, `/analytics`, `/post`, Money): follow `docs/DESIGN.md`.
- Open design work for the console: `docs/HANDOFF-admin-design.md`.
- Git: Brian pushes from his Mac over HTTPS; never rewrite pushed history (Vercel deploys on push).
- `src/lib/publish/markets.ts` and `src/lib/ads/presets.ts` are hand-copied in studio-ios (`Studio/Core/Markets.swift`, `AudiencePresets.swift`). Change one → change the other in the same session.
