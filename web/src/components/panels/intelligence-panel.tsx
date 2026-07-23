"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Memory } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, requestError } from "@/components/ui/panel-state"

export function IntelligencePanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMemories = () => {
    setLoading(true)
    setError(null)
    api.getActiveMemories()
      .then(setMemories)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchMemories() }, [])

  return (
    <PanelShell title="Intelligence" description="Memories currently active in the agent's context." width="narrow">
        {loading ? (
          <PanelLoading label="Loading active memories" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchMemories} />
        ) : memories.length === 0 ? (
          <PanelEmpty title="No active memories" description="Active memories appear here when the agent uses them in a conversation." />
        ) : (
          <div className="space-y-2">
            {memories.map(m => {
              const h = m.id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
              return (
                <article key={m.id}
                  className="data-row border-l-2 border-l-signal-400 card-pulse-glow"
                  style={{"--pulse-duration": `${2.5 + (h % 1.5)}s`, "--pulse-delay": `${(h % 20) / 10}s`} as React.CSSProperties}>
                  <p className="text-body text-ink-primary mb-1.5">
                    {m.content}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {m.tags.map(t => (
                      <span key={t} className="tag-pill tag-pill-blue">{t}</span>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        )}
    </PanelShell>
  )
}
