"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Memory } from "@/lib/api"

export function IntelligencePanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getActiveMemories().then(setMemories).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Intelligence</h2>
        <p className="text-body text-ink-secondary mb-6">
          Active memories and skills currently in context.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted">Loading…</p>
        ) : memories.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
            No active memories. They appear here when the agent uses them in conversation.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map(m => {
              const h = m.id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
              return (
                <div key={m.id}
                  className="bg-surface-1 border-l-2 border-signal-400 border border-surface-3 rounded-card card-hover-lift p-3 card-pulse-glow"
                  style={{"--pulse-duration": `${2.5 + (h % 1.5)}s`, "--pulse-delay": `${(h % 20) / 10}s`} as React.CSSProperties}>
                  <p className="text-body text-ink-primary mb-1.5">
                    {m.content}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {m.tags.map(t => (
                      <span key={t} className="tag-pill tag-pill-blue">{t}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
