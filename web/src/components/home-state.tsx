"use client"

import { useState } from "react"
import { Compass, Lightbulb, Scales, Flask } from "@phosphor-icons/react"

export function HomeState({ onSend, onOpenTool }: {
  onSend: (text: string) => void
  onOpenTool: (tool: string) => void
}) {
  const h = new Date().getHours()
  const greeting = h < 6 ? "Good evening." : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening."
  const [quickPrompt, setQuickPrompt] = useState("")

  const handleSend = (text: string) => {
    if (!text.trim()) return
    onSend(text)
    setQuickPrompt("")
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-10 overflow-y-auto">
      {/* Hero: greeting + primary input dominate the view */}
      <h1 className="text-display font-semibold tracking-tight text-center mb-3 font-sans" style={{ letterSpacing: "-0.02em", fontSize: "1.75rem" }}>
        {greeting}
      </h1>
      <p className="text-body text-ink-muted mb-10 font-share">What would you like to work on?</p>

      {/* Quick input — the primary action, visually dominant */}
      <div className="max-w-[560px] w-full mb-10">
        <div className="flex items-stretch bg-surface-1 border border-surface-3 rounded-composer overflow-hidden focus-within:border-signal-400 transition-colors duration-150">
          <input
            type="text"
            value={quickPrompt}
            onChange={e => setQuickPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSend(quickPrompt) }}
            placeholder="Ask anything..."
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-body text-ink-primary font-share placeholder:text-ink-muted py-3.5 px-4"
            style={{ caretColor: "var(--color-signal-500)" }}
          />
          <button
            onClick={() => handleSend(quickPrompt)}
            disabled={!quickPrompt.trim()}
            className="px-6 text-label font-medium font-sans transition-all duration-120 ease-expo-out active:scale-[0.97]
              bg-surface-2 text-ink-primary hover:bg-surface-3 disabled:bg-transparent disabled:text-ink-muted"
          >
            Send
          </button>
        </div>
      </div>

      {/* Secondary actions — quiet, demoted below the hero */}
      <div className="grid grid-cols-4 gap-2.5 max-w-[560px] w-full opacity-90">
        <button
          onClick={() => onOpenTool("deep-research")}
          className="col-span-4 bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-left group flex items-start gap-3"
        >
          <div className="w-9 h-9 flex items-center justify-center rounded-control bg-surface-2 shrink-0 group-hover:bg-surface-3 transition-colors duration-150">
            <Compass size={16} weight="regular" className="text-signal-400" />
          </div>
          <div>
            <div className="text-heading font-semibold text-ink-primary font-sans" style={{ letterSpacing: "-0.01em" }}>Deep Research</div>
            <div className="text-body text-ink-secondary font-share">Multi-source investigation with citations</div>
          </div>
        </button>

        <button
          onClick={() => onSend("Critique this idea from every angle. Find the blind spots, flawed assumptions, and risks I'm missing. Be direct.")}
          className="col-span-2 bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 text-left group"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-control bg-surface-2 mb-2 group-hover:bg-surface-3 transition-colors duration-150">
            <Scales size={15} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-label font-semibold text-ink-primary font-sans">Pressure Test</div>
          <div className="text-caption text-ink-muted font-share mt-0.5">Challenge assumptions, find blind spots</div>
        </button>

        <button
          onClick={() => onSend("Break this down into a step-by-step plan. Include phases, dependencies, and what I should tackle first.")}
          className="col-span-2 bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 text-left group"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-control bg-surface-2 mb-2 group-hover:bg-surface-3 transition-colors duration-150">
            <Lightbulb size={15} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-label font-semibold text-ink-primary font-sans">Plan</div>
          <div className="text-caption text-ink-muted font-share mt-0.5">Structured breakdown, step by step</div>
        </button>

        <button
          onClick={() => onOpenTool("harness-lab")}
          className="col-span-2 bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 text-left group"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-control bg-surface-2 mb-2 group-hover:bg-surface-3 transition-colors duration-150">
            <Flask size={15} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-label font-semibold text-ink-primary font-sans">Harness Lab</div>
          <div className="text-caption text-ink-muted font-share mt-0.5">Self-improvement experiments</div>
        </button>

        <button
          onClick={() => onSend("What patterns have you noticed across our conversations? Surface anything I should know.")}
          className="col-span-2 bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 text-left group"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-control bg-surface-2 mb-2 group-hover:bg-surface-3 transition-colors duration-150">
            <Compass size={15} weight="regular" className="text-signal-400" />
          </div>
          <div className="text-label font-semibold text-ink-primary font-sans">Reflect</div>
          <div className="text-caption text-ink-muted font-share mt-0.5">Cross-session patterns & insights</div>
        </button>
      </div>
    </div>
  )
}
