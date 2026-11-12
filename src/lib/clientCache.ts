// ─── Last-seen copy of a studio page's data, kept in this browser ────────────
//
// CLIENT ONLY. A page paints from the copy it showed last time and swaps in the
// live answer when it lands, instead of sitting on skeletons. The Inbox and
// Post pages already did this by hand; this is the same idea, shared.
//
// `session: true` keeps the copy only until the tab closes — use it for Money.
// Everything here is dropped on sign-out (clearStudioCache).

const PREFIX = 'clarendon:seen:'
const store = (session?: boolean) => (session ? sessionStorage : localStorage)

export function peek<T>(key: string, session?: boolean): T | null {
  try { return JSON.parse(store(session).getItem(PREFIX + key) ?? 'null') as T | null } catch { return null }
}

export function stash(key: string, value: unknown, session?: boolean) {
  try { store(session).setItem(PREFIX + key, JSON.stringify(value)) } catch { /* private mode / full */ }
}

export function clearStudioCache() {
  for (const s of [() => localStorage, () => sessionStorage]) {
    try {
      const st = s()
      for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k?.startsWith(PREFIX)) st.removeItem(k) }
    } catch { /* unavailable */ }
  }
}
