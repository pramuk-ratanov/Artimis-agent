"use client"

import { useEffect, useState, useCallback } from "react"
import { PushPin, Trash } from "@phosphor-icons/react"
import * as api from "@/lib/api"
import type { Memory } from "@/lib/api"
import { PanelEmpty, PanelError, PanelLoading, PanelShell, requestError } from "@/components/ui/panel-state"

// ── helpers ────────────────────────────────────────────────────────────────

const ALL_TAG = "all"

const KNOWN_TAGS = ["all", "contact", "fact", "goal", "identity", "preference", "project"]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)         return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)         return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)         return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)         return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12)        return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

// ── sub-components ─────────────────────────────────────────────────────────

interface TagPillProps {
  label: string
  active: boolean
  onClick: () => void
}

function TagPill({ label, active, onClick }: TagPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "shrink-0 px-2.5 py-0.5 rounded-control border text-caption font-share transition-colors duration-150 cursor-pointer",
        active
          ? "border-signal-400 text-signal-400 bg-surface-2"
          : "border-surface-3 text-ink-muted bg-surface-1 hover:border-surface-4 hover:text-ink-secondary",
      ].join(" ")}
    >
      {label}
    </button>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      type="button"
      aria-label="Memory active"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-4 w-7 items-center rounded-full border transition-colors duration-150 shrink-0",
        checked
          ? "bg-signal-500 border-signal-400"
          : "bg-surface-2 border-surface-3",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 h-3 w-3 rounded-full transition-transform duration-150",
          checked ? "bg-ink-primary translate-x-3.5" : "bg-ink-muted translate-x-0.5",
        ].join(" ")}
      />
    </button>
  )
}

interface MemoryCardProps {
  memory: Memory
  onPin: (id: string) => void
  onToggleActive: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  pinLoading: boolean
  activeLoading: boolean
}

function MemoryCard({
  memory: m,
  onPin,
  onToggleActive,
  onDelete,
  pinLoading,
  activeLoading,
}: MemoryCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Deterministic pulse params from memory ID — same card always gets the same rhythm
  const idHash = m.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const pulseDur = 2.5 + ((idHash % 15) / 10)  // 2.5–3.9s
  const pulseDelay = (idHash % 20) / 10        // 0–1.9s

  return (
    <div
      className={[
        "bg-surface-1 border border-surface-3 rounded-card card-hover-lift p-3 transition-colors duration-150 card-pulse-glow",
        m.pinned ? "border-l-2 border-l-signal-400" : "",
        !m.active ? "opacity-50" : "",
      ].join(" ")}
      style={{
        "--pulse-duration": `${pulseDur}s`,
        "--pulse-delay": `${pulseDelay}s`,
      } as React.CSSProperties}
    >
      {/* Content */}
      <p className="text-body text-ink-primary mb-2 leading-relaxed font-sans">
        {m.content}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tag pills */}
        {m.tags.length > 0 && m.tags.map(t => (
          <span
            key={t}
            className="tag-pill tag-pill-blue"
          >
            {t}
          </span>
        ))}

        {/* Source badge */}
        <span
          className={[
            "text-caption px-1.5 py-0.5 rounded-control border font-share",
            m.source === "manual"
              ? "text-signal-400 border-signal-600 bg-surface-2"
              : "text-ink-muted border-surface-3 bg-surface-2",
          ].join(" ")}
        >
          {m.source}
        </span>

        {/* Use count */}
        <span className="text-caption text-ink-faint font-share">
          {m.use_count}x
        </span>

        {/* Time ago */}
        <span className="text-caption text-ink-faint font-share">
          {timeAgo(m.created_at)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Pin button */}
          <button
            type="button"
            onClick={() => onPin(m.id)}
            disabled={pinLoading}
            aria-label={m.pinned ? "Unpin memory" : "Pin memory"}
            className={[
              "inline-flex items-center gap-1 text-caption font-share px-1.5 py-0.5 rounded-control border transition-colors duration-150",
              m.pinned
                ? "text-signal-400 border-signal-600 bg-surface-2 hover:bg-surface-3"
                : "text-ink-faint border-surface-3 bg-surface-1 hover:text-ink-muted hover:border-surface-4",
              pinLoading ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            <PushPin size={14} weight={m.pinned ? "fill" : "regular"} aria-hidden="true" />
            {m.pinned ? "Pinned" : "Pin"}
          </button>

          {/* Active toggle */}
          <Toggle
            checked={m.active}
            onChange={v => onToggleActive(m.id, v)}
            disabled={activeLoading}
          />

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                className="text-caption text-error border border-error px-1.5 py-0.5 rounded-control font-share cursor-pointer hover:bg-surface-2 transition-colors duration-150"
              >
                confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-caption text-ink-muted border border-surface-3 px-1.5 py-0.5 rounded-control font-share cursor-pointer hover:bg-surface-2 transition-colors duration-150"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete memory"
              className="text-caption text-ink-faint font-share border border-surface-3 px-1.5 py-0.5 rounded-control cursor-pointer hover:text-error hover:border-error transition-colors duration-150"
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── inline add-form ────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (content: string, tags: string[]) => Promise<void>
  onCancel: () => void
}

function AddForm({ onAdd, onCancel }: AddFormProps) {
  const [content, setContent] = useState("")
  const [tagsRaw, setTagsRaw] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed) { setError("Content is required."); return }
    setSaving(true)
    setError(null)
    try {
      const tags = tagsRaw
        .split(",")
        .map(t => t.trim())
        .filter(Boolean)
      await onAdd(trimmed, tags)
    } catch {
      setError("Failed to save memory.")
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-signal-600 rounded-card card-hover-lift p-3 space-y-2">
      <textarea
        autoFocus
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Memory content…"
        rows={3}
        className="w-full bg-surface-2 border border-surface-3 rounded-control px-2.5 py-1.5 text-body text-ink-primary font-sans outline-none placeholder:text-ink-faint focus:border-signal-500 resize-none transition-colors duration-150"
      />
      <input
        type="text"
        value={tagsRaw}
        onChange={e => setTagsRaw(e.target.value)}
        placeholder="Tags (comma-separated, e.g. fact, goal)"
        className="w-full bg-surface-2 border border-surface-3 rounded-control px-2.5 py-1.5 text-body text-ink-primary font-share outline-none placeholder:text-ink-faint focus:border-signal-500 transition-colors duration-150"
      />
      {error && (
        <p className="text-caption text-error font-share">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          className="text-label font-share px-3 py-1 rounded-control bg-signal-600 text-ink-primary border border-signal-500 hover:bg-signal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-label font-share px-3 py-1 rounded-control bg-surface-2 text-ink-muted border border-surface-3 hover:bg-surface-3 disabled:opacity-40 transition-colors duration-150 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function MemoriesPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [search, setSearch] = useState("")
  const [activeTag, setActiveTag] = useState<string>(ALL_TAG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [pinLoadingIds, setPinLoadingIds] = useState<Set<string>>(new Set())
  const [activeLoadingIds, setActiveLoadingIds] = useState<Set<string>>(new Set())

  // Collect all unique tags seen in memories (merge with known list)
  const allTagsFromData = Array.from(
    new Set(memories.flatMap(m => m.tags))
  )
  const filterTags = Array.from(
    new Set([...KNOWN_TAGS, ...allTagsFromData])
  )

  const fetchMemories = useCallback((s?: string, tag?: string) => {
    setLoading(true)
    setError(null)
    const params: Parameters<typeof api.getMemories>[0] = {}
    if (s) params.search = s
    if (tag && tag !== ALL_TAG) params.tag = tag
    api.getMemories(params)
      .then(setMemories)
      .catch((cause) => setError(requestError(cause)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchMemories(search || undefined, activeTag !== ALL_TAG ? activeTag : undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (val: string) => {
    setSearch(val)
    fetchMemories(val || undefined, activeTag !== ALL_TAG ? activeTag : undefined)
  }

  const handleTagFilter = (tag: string) => {
    setActiveTag(tag)
    fetchMemories(search || undefined, tag !== ALL_TAG ? tag : undefined)
  }

  const handlePin = async (id: string) => {
    setPinLoadingIds(prev => new Set(prev).add(id))
    try {
      const updated = await api.toggleMemoryPin(id)
      setMemories(prev => prev.map(m => m.id === id ? updated : m))
    } catch (cause) {
      setError(requestError(cause))
    } finally {
      setPinLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleToggleActive = async (id: string, active: boolean) => {
    setActiveLoadingIds(prev => new Set(prev).add(id))
    try {
      const updated = await api.updateMemory(id, { active } as Parameters<typeof api.updateMemory>[1] & { active?: boolean })
      setMemories(prev => prev.map(m => m.id === id ? updated : m))
    } catch (cause) {
      setError(requestError(cause))
    } finally {
      setActiveLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id)
      setMemories(prev => prev.filter(m => m.id !== id))
    } catch (cause) {
      setError(requestError(cause))
    }
  }

  const handleAdd = async (content: string, tags: string[]) => {
    const created = await api.createMemory(content, tags, "manual")
    setMemories(prev => [created, ...prev])
    setShowAdd(false)
  }

  // Sort: pinned first, then by date desc
  const sorted = [...memories].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <PanelShell
      title="Memories"
      description="Facts, preferences, and project context the agent can reuse."
      action={
        <div className="flex items-center gap-3">
          <span className="text-caption text-ink-muted font-share" aria-live="polite">
            {memories.length} {memories.length === 1 ? "memory" : "memories"}
          </span>
          <button type="button" onClick={() => setShowAdd(v => !v)} className="btn-secondary">
            Add memory
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="memory-search">Search memories</label>
          <input
            id="memory-search"
            type="search"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by content or tag"
            className="field-control"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none" aria-label="Filter memories by tag">
          {filterTags.map(tag => (
            <TagPill
              key={tag}
              label={tag}
              active={activeTag === tag}
              onClick={() => handleTagFilter(tag)}
            />
          ))}
        </div>

        {showAdd && (
          <AddForm
            onAdd={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {loading ? (
          <PanelLoading label="Loading memories" />
        ) : error ? (
          <PanelError message={error} onRetry={() => fetchMemories(search || undefined, activeTag !== ALL_TAG ? activeTag : undefined)} />
        ) : sorted.length === 0 ? (
          <PanelEmpty
            title={search || activeTag !== ALL_TAG ? "No matching memories" : "No memories yet"}
            description={search || activeTag !== ALL_TAG
              ? "Change the search text or select another tag."
              : "Memories accumulate as you work with the agent, or you can add one manually."}
          />
        ) : (
          <div className="space-y-2">
            {sorted.map(m => (
              <MemoryCard
                key={m.id}
                memory={m}
                onPin={handlePin}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                pinLoading={pinLoadingIds.has(m.id)}
                activeLoading={activeLoadingIds.has(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
