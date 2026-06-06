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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Intelligence</h2>
        <p className="text-body text-ink-secondary mb-6" style={{ fontFamily: "var(--font-sans)" }}>
          Active memories and skills currently in context.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : memories.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card p-4 text-label text-ink-muted">
            No active memories. They appear here when the agent uses them in conversation.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map(m => (
              <div key={m.id}
                className="bg-surface-1 border-l-2 border-signal-400 border border-surface-3 rounded-card p-3">
                <p className="text-body text-ink-primary" style={{ fontFamily: "var(--font-sans)" }}>
                  {m.content}
                </p>
                <div className="flex gap-2 mt-1.5">
                  {m.tags.map(t => (
                    <span key={t} className="text-caption text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded-control border border-surface-3">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
