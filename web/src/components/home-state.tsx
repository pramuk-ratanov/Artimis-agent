"use client"

import { Compass, Lightbulb, Scales } from "@phosphor-icons/react"

export function HomeState({ onSend, onOpenTool }: {
  onSend: (text: string) => void
  onOpenTool: (tool: string) => void
}) {
  const h = new Date().getHours()
  const greeting = h < 6 ? "Good evening." : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening."

  return (
    <div className="flex flex-col items-center justify-center h-full px-10">
      <h1 className="text-display font-semibold tracking-tight text-center mb-10 font-sans" style={{ letterSpacing: "-0.02em" }}>
        {greeting}
      </h1>

      {/* Bento grid — asymetrical 3-cell layout, per minimalist protocol */}
      <div className="grid grid-cols-4 gap-3 max-w-[520px] w-full mb-6">
        {/* Primary card — spans 3 cols */}
        <button
          onClick={() => onOpenTool("deep-research")}
          className="col-span-4 md:col-span-3 bg-surface-1 border border-surface-3 rounded-card p-6 text-left
            hover:border-surface-4 transition-all duration-150 group"
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-control bg-surface-2 mb-4
            group-hover:bg-surface-3 transition-colors duration-150">
            <Compass size={18} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1.5 font-sans" style={{ letterSpacing: "-0.01em" }}>
            Research deeply
          </div>
          <div className="text-body text-ink-secondary font-sans">
            Multi-source investigation with citations and gap detection
          </div>
        </button>

        {/* Secondary cards — each spans 2 cols */}
        <button
          onClick={() => onSend("Pressure-test this idea")}
          className="col-span-4 md:col-span-2 bg-surface-1 border border-surface-3 rounded-card p-5 text-left
            hover:border-surface-4 transition-all duration-150 group"
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-control bg-surface-2 mb-3
            group-hover:bg-surface-3 transition-colors duration-150">
            <Scales size={18} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1 font-sans" style={{ letterSpacing: "-0.01em" }}>
            Pressure-test
          </div>
          <div className="text-body text-ink-secondary font-sans">
            Challenge assumptions with critique
          </div>
        </button>

        <button
          onClick={() => onSend("Help me plan something")}
          className="col-span-4 md:col-span-2 bg-surface-1 border border-surface-3 rounded-card p-5 text-left
            hover:border-surface-4 transition-all duration-150 group"
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-control bg-surface-2 mb-3
            group-hover:bg-surface-3 transition-colors duration-150">
            <Lightbulb size={18} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1 font-sans" style={{ letterSpacing: "-0.01em" }}>
            Plan something
          </div>
          <div className="text-body text-ink-secondary font-sans">
            Structured breakdown, step by step
          </div>
        </button>
      </div>
    </div>
  )
}
