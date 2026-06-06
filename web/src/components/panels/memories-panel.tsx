"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Memory } from "@/lib/api"

export function MemoriesPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const fetchMemories = (s?: string) => {
    setLoading(true)
    api.getMemories(s ? { search: s } : {}).then(setMemories).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchMemories() }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Memories</h2>
        <p className="text-body text-ink-secondary mb-4" style={{ fontFamily: "var(--font-sans)" }}>
          Persistent knowledge the agent has saved about you and your work.
        </p>

        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); fetchMemories(e.target.value) }}
          placeholder="Search memories…"
          className="w-full bg-surface-1 border border-surface-3 rounded-control px-3 py-2 text-body
            text-ink-primary font-share outline-none placeholder:text-ink-muted mb-4
            focus:border-signal-500 transition-colors duration-150"
        />

        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : memories.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card p-4 text-label text-ink-muted">
            No memories yet. They accumulate as you talk with the agent.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map(m => (
              <div key={m.id} className="bg-surface-1 border border-surface-3 rounded-card p-3">
                <p className="text-body text-ink-primary mb-1" style={{ fontFamily: "var(--font-sans)" }}>
                  {m.content}
                </p>
                <div className="flex items-center gap-2">
                  {m.tags.map(t => (
                    <span key={t} className="text-caption text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded-control border border-surface-3">
                      {t}
                    </span>
                  ))}
                  <span className="text-caption text-ink-faint ml-auto">×{m.use_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
