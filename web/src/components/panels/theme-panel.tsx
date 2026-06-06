"use client"

export function ThemePanel() {
  const swatches = ["#0a0b0d", "#111318", "#181c22", "#1e232c", "#252b36", "#2d3341"]
  const signalSwatches = ["#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1"]

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Theme</h2>
        <p className="text-body text-ink-secondary mb-6" style={{ fontFamily: "var(--font-sans)" }}>
          Charcoal surfaces + sky-blue signal. Vital Signals DNA. This is the only theme.
        </p>

        <div className="mb-6">
          <p className="text-label text-ink-muted mb-2">SURFACES</p>
          <div className="flex gap-2">
            {swatches.map(c => (
              <div key={c} className="flex-1 aspect-square rounded-card border border-surface-3 flex items-end justify-center p-1"
                style={{ background: c }}>
                <span className="text-[0.5rem] font-mono text-ink-faint">{c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-label text-ink-muted mb-2">SIGNAL</p>
          <div className="flex gap-2">
            {signalSwatches.map(c => (
              <div key={c} className="flex-1 aspect-square rounded-card flex items-end justify-center p-1"
                style={{ background: c }}>
                <span className="text-[0.5rem] font-mono text-white/60">{c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-1 border border-surface-3 rounded-card p-4">
          <p className="text-label text-ink-muted mb-2">TYPOGRAPHY</p>
          <p className="text-display font-semibold text-ink-primary mb-1 heading-default">Display</p>
          <p className="text-heading font-semibold text-ink-primary mb-1">Heading</p>
          <p className="text-body text-ink-primary mb-1">Body — Share Tech Mono</p>
          <p className="text-body text-ink-primary mb-1" style={{ fontFamily: "var(--font-sans)" }}>Body — System Sans</p>
          <p className="text-label text-ink-secondary mb-1 font-semibold">LABEL</p>
          <p className="text-caption text-ink-muted">caption</p>
          <p className="text-code font-mono text-ink-secondary mt-1">mono code</p>
        </div>
      </div>
    </div>
  )
}
