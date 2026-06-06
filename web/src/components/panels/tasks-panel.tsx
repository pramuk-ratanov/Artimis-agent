"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Task } from "@/lib/api"

const STATUS_COLORS: Record<string, string> = {
  pending: "text-ink-muted",
  in_progress: "text-signal-400",
  paused: "text-warn",
  completed: "text-ok",
  cancelled: "text-error",
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = () => {
    api.getTasks().then(setTasks).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchTasks() }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Tasks</h2>
        <p className="text-body text-ink-secondary mb-6" style={{ fontFamily: "var(--font-sans)" }}>
          Background task execution. Multi-phase pipeline with pause and resume.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : tasks.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card p-4 text-label text-ink-muted">
            No tasks. Submit one via the agent or API.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="bg-surface-1 border border-surface-3 rounded-card p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-body font-semibold text-ink-primary">{t.title}</p>
                    {t.description && (
                      <p className="text-label text-ink-secondary mt-0.5" style={{ fontFamily: "var(--font-sans)" }}>
                        {t.description}
                      </p>
                    )}
                  </div>
                  <span className={`text-caption font-semibold shrink-0 ${STATUS_COLORS[t.status]}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-caption text-ink-muted">Phase: {t.phase}</span>
                  <span className="text-caption text-ink-muted">Priority: {t.priority}</span>
                  <span className="text-caption text-ink-faint ml-auto">{t.created_at}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
