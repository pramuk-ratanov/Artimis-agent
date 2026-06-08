"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Skill } from "@/lib/api"

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getSkills().then(setSkills).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Skills</h2>
        <p className="text-body text-ink-secondary mb-6">
          Versioned procedural knowledge. Pin to lock from auto-updates.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : skills.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
            No skills. They auto-populate as the agent learns workflows.
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map(s => {
              const h = s.id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
              return (
                <div key={s.id} className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 card-pulse-glow"
                  style={{"--pulse-duration": `${3 + (h % 2)}s`, "--pulse-delay": `${(h % 25) / 10}s`} as React.CSSProperties}>
                  <div className="flex items-center justify-between">
                    <p className="text-body font-semibold text-ink-primary">{s.name}</p>
                    <span className="text-caption text-ink-muted">v{s.version}</span>
                  </div>
                  <p className="text-label text-ink-secondary mt-1 line-clamp-2">
                    {s.content.slice(0, 200)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {s.pinned && <span className="text-caption text-signal-400 font-semibold">PINNED</span>}
                    <span className="text-caption text-ink-faint ml-auto">×{s.use_count}</span>
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
