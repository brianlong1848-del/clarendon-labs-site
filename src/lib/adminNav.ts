// ─── Admin nav ────────────────────────────────────────────────────────────────
//
// Every internal admin page lives under one shared nav so they read as one
// studio instead of a pile of separate URLs, all gated by the same console
// password. Add a page to the console by adding one entry here — the nav
// updates on every page that renders <AdminNav>, nothing else to touch.
//
// Console (/admin) stays first: it's the landing page for the whole section.

export type AdminNavItem = { href: string; label: string }

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Console' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/post', label: 'Post' },
]
