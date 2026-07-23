"use client"

import { useState } from "react"
import { Compass } from "@phosphor-icons/react"
import * as api from "@/lib/api"
import { PanelError, PanelLoading, PanelShell, requestError } from "@/components/ui/panel-state"

export function DeepResearchPanel() {
  const [task, setTask] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!task.trim() || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.deepResearch(task.trim())
      setResult(res.synthesis)
    } catch (e) {
      setError(requestError(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <PanelShell
      title="Deep Research"
      description="Plan, retrieve, verify, and synthesize a focused research task."
      width="narrow"
    >
        <div className="border border-surface-3 bg-surface-1 p-4 mb-4">
          <label className="field-label" htmlFor="research-task">Research task</label>
          <textarea
            id="research-task"
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Be specific about the subject, scope, and decision this research should support."
            className="field-control resize-y mb-3"
            style={{ minHeight: 80 }}
            rows={4}
          />
          <button
            type="button"
            onClick={run}
            disabled={running || !task.trim()}
            className="btn-primary"
          >
            <Compass size={16} weight="regular" aria-hidden="true" />
            {running ? "Researching..." : "Run research"}
          </button>
        </div>

        {running && <PanelLoading rows={5} label="Research in progress" />}

        {error && <PanelError message={error} onRetry={run} />}

        {result && (
          <article className="border border-surface-3 bg-surface-1 p-5" aria-label="Research result">
            <pre className="whitespace-pre-wrap font-sans text-body text-ink-primary leading-relaxed">{result}</pre>
          </article>
        )}
    </PanelShell>
  )
}
