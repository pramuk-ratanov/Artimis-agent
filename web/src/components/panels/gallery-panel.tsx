"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { GalleryItem } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, StatusText, requestError, truncate } from "@/components/ui/panel-state"

export function GalleryPanel() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGallery = () => {
    setLoading(true)
    setError(null)
    api.getGallery()
      .then(setItems)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchGallery() }, [])

  return (
    <PanelShell title="Gallery" description="Generated image records and their quality results.">
        {loading ? (
          <PanelLoading label="Loading gallery" />
        ) : error ? (
          <PanelError message={error} onRetry={fetchGallery} />
        ) : items.length === 0 ? (
          <PanelEmpty title="No generated images" description="Images generated during conversations will appear here." />
        ) : (
          <div className="data-list">
            {items.map(item => (
              <article key={item.id} className="data-row">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink-primary">{truncate(item.prompt, 180)}</p>
                    <p className="mt-1 text-caption text-ink-muted break-all">{item.thumbnail_path || item.file_path}</p>
                  </div>
                  <StatusText value={item.quality_pass ? "completed" : "pending"} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
                  {item.model && <span>Model: {item.model}</span>}
                  {item.width && item.height && <span>{item.width} x {item.height}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
    </PanelShell>
  )
}
