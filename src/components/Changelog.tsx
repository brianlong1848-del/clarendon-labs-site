type Entry = [string, string, string, 'feat' | 'docs' | 'init' | 'fix']

const entries: Entry[] = [
  ['MAY 08', 'Rolligan', 'Added haptic feedback for bust events.', 'feat'],
  ['MAY 02', 'Rolligan', 'New theme: “Linoleum” inspired by 70s diners.', 'feat'],
  ['APR 24', 'site', 'Rewrote the manifesto, eighth time.', 'docs'],
  ['APR 18', 'LOG', 'Started concept work. Notebook open.', 'init'],
]

export default function Changelog() {
  return (
    <section id="changelog" className="px-8 py-14">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
        <div>
          <span className="micro">{"// "}03 — Build log</span>
          <h2 className="text-[32px] mt-2">Recent commits to the catalog.</h2>
        </div>
        <a
          href="mailto:hello@clarendon.dev?subject=Subscribe%20to%20updates"
          className="nav-link"
        >
          Subscribe to updates <span className="ascii">→</span>
        </a>
      </div>
      <div className="card">
        {entries.map(([d, scope, msg, type], i, arr) => (
          <div
            key={i}
            className="grid grid-cols-[90px_80px_80px_1fr] px-5 py-3.5 items-center gap-4"
            style={{
              borderBottom:
                i < arr.length - 1 ? '1px solid rgb(var(--line))' : 'none',
            }}
          >
            <span className="mono text-[12px] text-mute">{d}</span>
            <span className="chip text-[10.5px]">{scope}</span>
            <span
              className="mono text-[11px]"
              style={{
                color: type === 'feat' ? 'var(--accent-text)' : 'rgb(var(--mute))',
              }}
            >
              {type}:
            </span>
            <span className="text-[14px]">{msg}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
