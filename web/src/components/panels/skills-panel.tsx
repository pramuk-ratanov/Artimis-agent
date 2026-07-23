"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Skill } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, requestError, truncate } from "@/components/ui/panel-state"

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSkills = () => {
    setLoading(true)
    setError(null)
    api.getSkills()
      .then(setSkills)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchSkills() }, [])

  return (
    <PanelShell title="Skills" description="Versioned procedural knowledge. Pin a skill to lock it from auto-updates." width="narrow">
        {loading ? (
          <PanelLoading label="Loading skills" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchSkills} />
        ) : skills.length === 0 ? (
          <PanelEmpty title="No skills yet" description="Skills populate automatically as the agent learns and reuses workflows." />
        ) : (
          <div className="data-list">
            {skills.map(s => {
              const h = s.id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
              return (
                <article key={s.id} className="data-row card-pulse-glow"
                  style={{"--pulse-duration": `${3 + (h % 2)}s`, "--pulse-delay": `${(h % 25) / 10}s`} as React.CSSProperties}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-body font-semibold text-ink-primary truncate">{s.name}</p>
                    <span className="text-caption font-share text-ink-muted shrink-0">v{s.version}</span>
                  </div>
                  <p className="text-label text-ink-secondary mt-1 line-clamp-2">
                    {truncate(s.content, 200)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {s.pinned && <span className="status-text status-active">Pinned</span>}
                    <span className="text-caption font-share text-ink-faint ml-auto">used {s.use_count}x</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
    </PanelShell>
  )
}
