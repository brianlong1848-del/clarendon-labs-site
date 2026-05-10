export default function StatusBar() {
  return (
    <div className="bg-ink text-bg px-8 py-2 flex justify-between items-center text-[11px] mono tracking-[0.04em]">
      <span>STATUS · CLARENDON LABS · MAIN · CLEAN</span>
      <span className="hidden md:flex gap-[18px] opacity-85">
        <span>Rolligan ▸ shipped</span>
        <span>·</span>
        <span>Next ship: Q4 2026</span>
        <span>·</span>
        <span>Built in Chicago</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--accent)' }}
        />{' '}
        ALL SYSTEMS OK
      </span>
    </div>
  )
}
