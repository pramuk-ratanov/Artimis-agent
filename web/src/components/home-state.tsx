"use client"

import { Compass, Lightbulb, Scales } from "@phosphor-icons/react"

export function HomeState({ onSend, onOpenTool }: {
  onSend: (text: string) => void
  onOpenTool: (tool: string) => void
}) {
  const h = new Date().getHours()
  const greeting = h < 6 ? "Good evening." : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening."

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <h1 className="heading-default text-display font-semibold tracking-tight text-center mb-6">
        {greeting}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-[420px] w-full mb-4">
        {/* Full-width primary card */}
        <button
          onClick={() => onOpenTool("deep-research")}
          className="md:col-span-2 bg-surface-2 border border-surface-3 rounded-card p-3.5 text-left
            hover:border-signal-400 hover:bg-surface-3 transition-all duration-150 ease-expo-out group"
        >
          <div className="w-7 h-7 flex items-center justify-center rounded-control bg-surface-1 mb-2">
            <Compass size={14} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1 group-hover:text-signal-300">
            Research deeply
          </div>
          <div className="text-label text-ink-secondary font-share">
            Multi-source investigation with citations and gap detection
          </div>
        </button>

        {/* Half-width cards */}
        <button
          onClick={() => onSend("Pressure-test this idea")}
          className="bg-surface-2 border border-surface-3 rounded-card p-3.5 text-left
            hover:border-signal-400 hover:bg-surface-3 transition-all duration-150 ease-expo-out group"
        >
          <div className="w-7 h-7 flex items-center justify-center rounded-control bg-surface-1 mb-2">
            <Scales size={14} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1 group-hover:text-signal-300">
            Pressure-test
          </div>
          <div className="text-label text-ink-secondary font-share">
            Challenge assumptions
          </div>
        </button>

        <button
          onClick={() => onSend("Help me plan something")}
          className="bg-surface-2 border border-surface-3 rounded-card p-3.5 text-left
            hover:border-signal-400 hover:bg-surface-3 transition-all duration-150 ease-expo-out group"
        >
          <div className="w-7 h-7 flex items-center justify-center rounded-control bg-surface-1 mb-2">
            <Lightbulb size={14} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-heading font-semibold text-ink-primary mb-1 group-hover:text-signal-300">
            Plan something
          </div>
          <div className="text-label text-ink-secondary font-share">
            Structured breakdown
          </div>
        </button>
      </div>
    </div>
  )
}
