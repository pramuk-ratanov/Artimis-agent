"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Task } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, StatusText, formatTimestamp, requestError } from "@/components/ui/panel-state"

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = () => {
    setLoading(true)
    setError(null)
    api.getTasks()
      .then(setTasks)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTasks() }, [])

  return (
    <PanelShell
      title="Tasks"
      description="Background task execution with pause and resume."
    >
        {loading ? (
          <PanelLoading label="Loading tasks" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchTasks} />
        ) : tasks.length === 0 ? (
          <PanelEmpty title="No tasks" description="Ask the agent to create a background task, or submit one through the API." />
        ) : (
          <div className="data-list">
            {tasks.map(t => (
              <article key={t.id} className="data-row">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink-primary">{t.title}</p>
                    {t.description && (
                      <p className="text-label text-ink-secondary mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <StatusText value={t.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span className="text-caption text-ink-muted">Phase: {t.phase}</span>
                  <span className="text-caption text-ink-muted">Priority: {t.priority}</span>
                  <time className="text-caption text-ink-faint sm:ml-auto" dateTime={t.created_at}>{formatTimestamp(t.created_at)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
    </PanelShell>
  )
}
