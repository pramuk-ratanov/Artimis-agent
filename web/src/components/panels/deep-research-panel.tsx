"use client"

import { useState } from "react"
import { Compass } from "@phosphor-icons/react"
import * as api from "@/lib/api"

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
      setError(e instanceof Error ? e.message : "Research failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Deep Research</h2>
        <p className="text-body text-ink-secondary mb-6">
          Multi-phase research pipeline. Plan, retrieve, verify, synthesize. Every claim carries a citation.
        </p>

        <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 mb-4">
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Enter a research task — be specific about what you need to know…"
            className="w-full bg-transparent resize-none text-body text-ink-primary font-share
              outline-none placeholder:text-ink-muted mb-3"
            style={{ minHeight: 80 }}
            rows={4}
          />
          <button
            onClick={run}
            disabled={running || !task.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-signal-600 text-label font-semibold text-ink-primary
              rounded-control transition-all duration-150 ease-expo-out active:scale-[0.97]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Compass size={16} weight="regular" />
            {running ? "Researching…" : "Run Research"}
          </button>
        </div>

        {error && (
          <div className="bg-surface-1 border border-error/30 rounded-card card-hover-lift p-3 text-label text-error mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-5">
            <div
              className="msg-content text-body text-ink-primary"
              dangerouslySetInnerHTML={{
                __html: result
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/\n/g, '<br>'),
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
