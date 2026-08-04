"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Note } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, requestError, truncate } from "@/components/ui/panel-state"

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotes = () => {
    setLoading(true)
    setError(null)
    api.getNotes()
      .then(setNotes)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchNotes() }, [])

  return (
    <PanelShell title="Notes" description="Versioned, searchable documents and markdown notes." width="narrow">
        {loading ? (
          <PanelLoading label="Loading notes" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchNotes} />
        ) : notes.length === 0 ? (
          <PanelEmpty title="No notes" description="Create a note from any chat, or add one through the API." />
        ) : (
          <div className="data-list">
            {notes.map(n => (
              <article key={n.id} className="data-row">
                <p className="text-body font-semibold text-ink-primary mb-0.5">{n.title}</p>
                <p className="text-label text-ink-secondary">
                  {truncate(n.content, 120)}
                </p>
                <div className="text-caption text-ink-faint mt-1">{n.version_count} {n.version_count === 1 ? "version" : "versions"}</div>
              </article>
            ))}
          </div>
        )}
    </PanelShell>
  )
}
