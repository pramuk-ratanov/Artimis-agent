"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Chat, Brain, Database, Compass, ImageSquare, Note, CheckSquare, Wrench, Palette, Plus, MagnifyingGlass } from "@phosphor-icons/react"

interface PaletteAction { id: string; label: string; shortcut?: string; icon?: React.ReactNode; action: () => void }

export function CommandPalette({ isOpen, onClose, actions }: { isOpen: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const filtered = query.trim() ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase())) : actions

  useEffect(() => { if (isOpen) { setQuery(""); setIndex(0); setTimeout(() => inputRef.current?.focus(), 50) } }, [isOpen])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); const s = filtered[index]; if (s) { s.action(); onClose() } }
    else if (e.key === "Escape") onClose()
  }, [filtered, index, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-surface-1 border border-surface-3 rounded-card w-[520px] max-w-[90vw] overflow-hidden
        animate-fade-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b border-surface-3">
          <span className="pl-4 text-ink-muted"><MagnifyingGlass size={16} weight="regular" /></span>
          <input ref={inputRef} type="text" value={query}
            onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={onKey}
            placeholder="Search chats and tools…"
            className="flex-1 bg-transparent border-none outline-none text-body text-ink-primary font-sans
              py-3 px-3 placeholder:text-ink-muted"
            style={{ caretColor: "var(--color-signal-500)" }}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {filtered.map((a, i) => (
            <div key={a.id}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors duration-100
                ${i === index ? "bg-surface-2 text-ink-primary" : "text-ink-secondary"}`}
              onClick={() => { a.action(); onClose() }}
              onMouseEnter={() => setIndex(i)}>
              <div className="flex items-center gap-2.5">
                {a.icon && <span className={i === index ? "text-signal-400" : "text-ink-muted"}>{a.icon}</span>}
                <span className="text-label font-medium font-sans">{a.label}</span>
              </div>
              {a.shortcut && (
                <kbd className="text-caption font-share text-ink-muted bg-surface-1 border border-surface-3
                  rounded-control px-1.5 py-0.5">{a.shortcut}</kbd>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-label text-ink-muted italic font-sans">No results</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function buildDefaultActions(
  onNewChat: () => void, onSelectTool: (t: string) => void, onOpenSettings: () => void,
  chatList: { id: string; name: string; onClick: () => void }[]
): PaletteAction[] {
  return [
    { id: "new-chat", label: "New Chat", shortcut: "Ctrl N", icon: <Plus size={16} />, action: onNewChat },
    ...chatList.slice(0, 5).map(c => ({ id: `chat-${c.id}`, label: c.name, icon: <Chat size={16} />, action: c.onClick })),
    { id: "sep1", label: "—", action: () => {} },
    { id: "t-brain", label: "Intelligence", icon: <Brain size={16} />, action: () => onSelectTool("intelligence") },
    { id: "t-memories", label: "Memories", icon: <Database size={16} />, action: () => onSelectTool("memories") },
    { id: "t-dr", label: "Deep Research", icon: <Compass size={16} />, action: () => onSelectTool("deep-research") },
    { id: "t-gallery", label: "Gallery", icon: <ImageSquare size={16} />, action: () => onSelectTool("gallery") },
    { id: "t-notes", label: "Notes", icon: <Note size={16} />, action: () => onSelectTool("notes") },
    { id: "t-tasks", label: "Tasks", icon: <CheckSquare size={16} />, action: () => onSelectTool("tasks") },
    { id: "t-skills", label: "Skills", icon: <Wrench size={16} />, action: () => onSelectTool("skills") },
    { id: "t-theme", label: "Theme", icon: <Palette size={16} />, action: () => onSelectTool("theme") },
    { id: "sep2", label: "—", action: () => {} },
    { id: "settings", label: "Settings", shortcut: "Ctrl ,", icon: <Wrench size={16} />, action: onOpenSettings },
  ]
}
