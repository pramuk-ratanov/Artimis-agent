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
import { PanelEmpty, PanelError, PanelLoading, PanelShell, StatusText, formatTimestamp, requestError } from "@/components/ui/panel-state"

export function HarnessLabPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshotMsg, setSnapshotMsg] = useState("")

  const fetchAll = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getHarnessVersions(20),
      getHarnessExperiments(20),
      getHarnessTestCases(),
    ]).then(([s, e, t]) => {
      setSnapshots(s)
      setExperiments(e)
      setTestCases(t)
    }).catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSnapshot = async (component: string) => {
    setSnapshotMsg("Taking snapshot...")
    try {
      const res = await createHarnessSnapshot(component, "manual")
      setSnapshotMsg(`Snapshotted: ${res.count} component(s) at v${res.latest_version}`)
      fetchAll()
    } catch (cause) {
      setSnapshotMsg(`Snapshot failed: ${requestError(cause)}`)
    }
    setTimeout(() => setSnapshotMsg(""), 3000)
  }

  return (
    <PanelShell
      title="Harness Lab"
      description="Snapshots, experiments, and test cases for evaluating changes to the agent harness."
      action={snapshotMsg ? (
        <span className="text-caption text-signal-400" role="status" aria-live="polite">
          {snapshotMsg}
        </span>
      ) : undefined}
    >

        {loading ? (
          <PanelLoading rows={6} label="Loading harness lab" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchAll} />
        ) : (
          <>
            {/* Snapshots */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-body font-semibold text-ink-primary">Snapshots</h3>
                <div className="flex gap-1.5">
                  {["system_prompt", "tools", "brain", "all"].map(c => (
                    <button type="button" key={c} onClick={() => handleSnapshot(c)} className="btn-ghost">
                      {c.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              {snapshots.length === 0 ? (
                <PanelEmpty title="No snapshots" description="Take a snapshot to start versioning the harness." />
              ) : (
                <div className="space-y-1">
                  {snapshots.slice(0, 10).map(s => (
                    <div key={s.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-caption font-mono text-signal-400">v{s.version}</span>
                        <span className="text-caption text-ink-secondary">{s.component}</span>
                        <span className="text-caption text-ink-muted">{s.source}</span>
                      </div>
                      <time className="text-caption text-ink-faint" dateTime={s.created_at}>{formatTimestamp(s.created_at)}</time>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Experiments */}
            <div>
              <h3 className="text-body font-semibold text-ink-primary mb-3">Experiments</h3>
              {experiments.length === 0 ? (
                <PanelEmpty title="No experiments" description="Experiments appear when the agent detects consistently low evaluation scores." />
              ) : (
                <div className="space-y-1">
                  {experiments.map(e => (
                    <div key={e.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-label text-ink-primary truncate mr-2">{e.hypothesis}</span>
                        <StatusText value={e.outcome} />
                      </div>
                      <div className="flex items-center gap-3 text-caption text-ink-muted">
                        <span>{e.component}</span>
                        {e.score_before != null && <span>score: {e.score_before} → {e.score_after}</span>}
                        <time className="text-ink-faint" dateTime={e.created_at}>{formatTimestamp(e.created_at)}</time>
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
                <PanelEmpty title="No test cases" description="Test cases are created from user corrections during conversations." />
              ) : (
                <div className="space-y-1">
                  {testCases.map(tc => (
                    <div key={tc.id} className="bg-surface-1 border border-surface-3 rounded-control px-3 py-2">
                      <p className="text-label text-ink-primary truncate">{tc.input_message}</p>
                      <time className="text-caption text-ink-faint" dateTime={tc.created_at}>{formatTimestamp(tc.created_at)}</time>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
    </PanelShell>
  )
}
