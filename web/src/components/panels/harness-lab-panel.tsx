"use client"

import { useEffect, useState, useCallback } from "react"
import {
  getHarnessVersions,
  getHarnessExperiments,
  getHarnessTestCases,
  createHarnessSnapshot,
  type HarnessSnapshot as Snapshot,
  type HarnessExperiment as Experiment,
  type HarnessTestCase as TestCase,
} from "@/lib/api"

export function HarnessLabPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [snapshotMsg, setSnapshotMsg] = useState("")

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      getHarnessVersions(20).catch(() => []),
      getHarnessExperiments(20).catch(() => []),
      getHarnessTestCases().catch(() => []),
    ]).then(([s, e, t]) => {
      setSnapshots(s)
      setExperiments(e)
      setTestCases(t)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSnapshot = async (component: string) => {
    setSnapshotMsg("Taking snapshot...")
    try {
      const res = await createHarnessSnapshot(component, "manual")
      setSnapshotMsg(`Snapshotted: ${res.count} component(s) at v${res.latest_version}`)
      fetchAll()
    } catch {
      setSnapshotMsg("Snapshot failed")
    }
    setTimeout(() => setSnapshotMsg(""), 3000)
  }

  const outcomeColor = (o: string) => {
    switch (o) {
      case "applied": return "text-ok"
      case "rejected": return "text-error"
      case "pending": return "text-warn"
      default: return "text-ink-muted"
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-heading font-semibold text-ink-primary mb-1">Harness Lab</h2>
            <p className="text-body text-ink-secondary">
              Self-improvement engine. Snapshots, experiments, and test cases for optimizing the agent harness.
            </p>
          </div>
          {snapshotMsg && (
            <span className="text-caption text-signal-400 bg-surface-2 px-2 py-1 rounded-control border border-signal-600">
              {snapshotMsg}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-label text-ink-muted">Loading…</p>
        ) : (
          <>
            {/* Snapshots */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-body font-semibold text-ink-primary">Snapshots</h3>
                <div className="flex gap-1.5">
                  {["system_prompt", "tools", "brain", "all"].map(c => (
                    <button key={c} onClick={() => handleSnapshot(c)}
                      className="text-caption px-2 py-0.5 rounded-control border border-surface-3 text-ink-muted hover:text-signal-400 hover:border-signal-600 transition-colors cursor-pointer">
                      + {c.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              {snapshots.length === 0 ? (
                <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
                  No snapshots yet. Take one to start versioning your harness.
                </div>
              ) : (
                <div className="space-y-1">
                  {snapshots.slice(0, 10).map(s => (
                    <div key={s.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-caption font-mono text-signal-400">v{s.version}</span>
                        <span className="text-caption text-ink-secondary">{s.component}</span>
                        <span className="text-caption text-ink-muted">{s.source}</span>
                      </div>
                      <span className="text-caption text-ink-faint">{s.created_at}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Experiments */}
            <div>
              <h3 className="text-body font-semibold text-ink-primary mb-3">Experiments</h3>
              {experiments.length === 0 ? (
                <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
                  No experiments yet. They auto-trigger when the agent detects consistent low scores.
                </div>
              ) : (
                <div className="space-y-1">
                  {experiments.map(e => (
                    <div key={e.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-label text-ink-primary truncate mr-2">{e.hypothesis}</span>
                        <span className={`text-caption font-semibold shrink-0 ${outcomeColor(e.outcome)}`}>
                          {e.outcome}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-caption text-ink-muted">
                        <span>{e.component}</span>
                        {e.score_before != null && <span>score: {e.score_before} → {e.score_after}</span>}
                        <span className="text-ink-faint">{e.created_at}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Test Cases */}
            <div>
              <h3 className="text-body font-semibold text-ink-primary mb-3">Test Cases</h3>
              {testCases.length === 0 ? (
                <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
                  No test cases. They're auto-created from user corrections during conversations.
                </div>
              ) : (
                <div className="space-y-1">
                  {testCases.map(tc => (
                    <div key={tc.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2">
                      <p className="text-label text-ink-primary truncate">{tc.input_message}</p>
                      <span className="text-caption text-ink-faint">{tc.created_at}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
