"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { Note } from "@/lib/api"

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getNotes().then(setNotes).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8 font-share">
      <div className="max-w-[65ch] mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Notes</h2>
        <p className="text-body text-ink-secondary mb-6">
          Documents and markdown notes. Versioned and searchable.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : notes.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-4 text-label text-ink-muted">
            No notes yet. Create one from any chat or via the API.
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map(n => (
              <div key={n.id} className="bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3">
                <p className="text-body font-semibold text-ink-primary mb-0.5">{n.title}</p>
                <p className="text-label text-ink-secondary truncate">
                  {n.content.slice(0, 120)}
                </p>
                <div className="text-caption text-ink-faint mt-1">v{n.version_count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
