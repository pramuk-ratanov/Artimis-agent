"use client"

import { useEffect, useState } from "react"

type Theme = "dark" | "light"

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  const current = document.documentElement.getAttribute("data-theme")
  return current === "light" ? "light" : "dark"
}

export function ThemePanel() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    try {
      localStorage.setItem("artimis-theme", theme)
    } catch {}
  }, [theme])

  const darkSwatches = ["#0a0b0d", "#111318", "#181c22", "#1e232c", "#252b36", "#2d3341"]
  const lightSwatches = ["#faf9f7", "#f4f2ef", "#ece9e4", "#dfdbd4", "#d0ccc4", "#c2beb6"]
  const signalSwatches = ["#A8E6CE", "#6FCFAC", "#2FA97F", "#0B996E", "#0B7A5A"]

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Theme</h2>
        <p className="text-body text-ink-secondary mb-6">
          Warm peec-paper surfaces + emerald signal by default. Dark theme uses charcoal
          surfaces with the same signal DNA.
        </p>

        <div className="mb-8">
          <p className="text-label text-ink-muted mb-2">MODE</p>
          <div className="flex gap-2">
            {(["dark", "light"] as Theme[]).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-4 py-2 rounded-control border text-label font-share transition-colors duration-150
                  ${theme === t
                    ? "border-signal-500 bg-surface-2 text-ink-primary"
                    : "border-surface-3 bg-surface-1 text-ink-secondary hover:bg-surface-2"}`}
              >
                {t === "dark" ? "Dark" : "Light — default (peec paper)"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-label text-ink-muted mb-2">SURFACES — DARK</p>
          <div className="flex gap-2">
            {darkSwatches.map(c => (
              <div key={c} className="flex-1 aspect-square rounded-card border border-surface-3 flex items-end justify-center p-1"
                style={{ background: c }}>
                <span className="text-[0.5rem] font-mono text-white/40">{c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-label text-ink-muted mb-2">SURFACES — LIGHT</p>
          <div className="flex gap-2">
            {lightSwatches.map(c => (
              <div key={c} className="flex-1 aspect-square rounded-card border border-surface-3 flex items-end justify-center p-1"
                style={{ background: c }}>
                <span className="text-[0.5rem] font-mono text-black/40">{c}</span>
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
          <p className="text-body text-ink-primary mb-1">Body — Geist Mono Variable</p>
          <p className="text-body text-ink-primary mb-1" style={{ fontFamily: "var(--font-sans)" }}>Body — Geist Sans</p>
          <p className="text-label text-ink-secondary mb-1 font-semibold">LABEL</p>
          <p className="text-caption text-ink-muted">caption</p>
          <p className="text-code font-mono text-ink-secondary mt-1">mono code</p>
        </div>
      </div>
    </div>
  )
}
