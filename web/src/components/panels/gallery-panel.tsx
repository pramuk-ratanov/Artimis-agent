"use client"

import { useEffect, useState } from "react"
import * as api from "@/lib/api"
import type { GalleryItem } from "@/lib/api"

export function GalleryPanel() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getGallery().then(setItems).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-heading font-semibold text-ink-primary mb-1">Gallery</h2>
        <p className="text-body text-ink-secondary mb-6" style={{ fontFamily: "var(--font-sans)" }}>
          Generated images. Quality-passed items have a blue border.
        </p>
        {loading ? (
          <p className="text-label text-ink-muted italic">Loading…</p>
        ) : items.length === 0 ? (
          <div className="bg-surface-1 border border-surface-3 rounded-card p-4 text-label text-ink-muted">
            No images yet. Generated images from conversations appear here.
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {items.map(item => (
              <div
                key={item.id}
                className={`aspect-square bg-surface-1 border rounded-card overflow-hidden flex flex-col
                  ${item.quality_pass ? "border-signal-400" : "border-surface-3"}`}
              >
                <div className="flex-1 bg-surface-2 flex items-center justify-center text-ink-muted text-caption">
                  [img]
                </div>
                <div className="p-2">
                  <p className="text-caption text-ink-secondary truncate">{item.prompt.slice(0, 60)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
