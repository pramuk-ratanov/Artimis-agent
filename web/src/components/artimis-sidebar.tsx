"use client"

import { useState, useRef, useEffect } from "react"
import {
  CaretDown, CaretRight, Brain, ImageSquare, Note,
  CheckSquare, Wrench, Database, Palette, Gear, Compass,
  Archive, Trash, DotsThree, ChartBar, Plus,
} from "@phosphor-icons/react"
import { LivingSignal, type SignalState } from "@/components/living-signal"

export interface Project { id: string; name: string }
export interface ChatSession { id: string; name: string; projectId: string | null; updatedAt: string }

const TOOLS = [
  { id: "intelligence", label: "Intelligence", icon: <Brain size={14} weight="regular" /> },
  { id: "memories", label: "Memories", icon: <Database size={14} weight="regular" /> },
  { id: "deep-research", label: "Deep Research", icon: <Compass size={14} weight="regular" /> },
  { id: "gallery", label: "Gallery", icon: <ImageSquare size={14} weight="regular" /> },
  { id: "notes", label: "Notes", icon: <Note size={14} weight="regular" /> },
  { id: "tasks", label: "Tasks", icon: <CheckSquare size={14} weight="regular" /> },
  { id: "skills", label: "Skills", icon: <Wrench size={14} weight="regular" /> },
  { id: "statistics", label: "Statistics", icon: <ChartBar size={14} weight="regular" /> },
  { id: "harness-lab", label: "Harness Lab", icon: <Wrench size={14} weight="regular" /> },
  { id: "theme", label: "Theme", icon: <Palette size={14} weight="regular" /> },
]

interface Props {
  projects: Project[]
  chats: ChatSession[]
  activeChatId: string | null
  signalState: SignalState
  onNewChat: (pid?: string | null) => void
  onSelectChat: (id: string) => void
  onCreateProject: (n: string) => void
  onSelectTool: (t: string) => void
  onOpenSettings: () => void
  activeTool: string | null
  onArchiveChat: (id: string) => void
  onDeleteChat: (id: string) => void
}

interface FolderGroup { name: string; chats: ChatSession[] }

function groupChats(chats: ChatSession[], projects: Project[]): { unassigned: ChatSession[]; folders: FolderGroup[] } {
  const unassigned = chats.filter(c => !c.projectId)
  const folderMap = new Map<string, ChatSession[]>()
  for (const c of chats) {
    if (!c.projectId) continue
    const proj = projects.find(p => p.id === c.projectId)
    const key = proj?.name || "General"
    if (!folderMap.has(key)) folderMap.set(key, [])
    folderMap.get(key)!.push(c)
  }
  const folders: FolderGroup[] = []
  for (const [name, cs] of folderMap) {
    folders.push({ name, chats: cs })
  }
  return { unassigned, folders }
}

/** Inline context menu — appears on hover via the dots button */
function ChatItemMenu({
  onArchive, onDelete, onClose
}: { onArchive: () => void; onDelete: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-0.5 z-50 bg-surface-2 border border-surface-3
        rounded-card shadow-lg overflow-hidden min-w-[120px]"
    >
      <button
        onClick={() => { onArchive(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-2 text-label font-share
          text-ink-secondary hover:bg-surface-3 hover:text-ink-primary transition-colors duration-100"
      >
        <Archive size={12} weight="regular" className="text-ink-muted" />
        Archive
      </button>
      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-label font-share
            text-ink-secondary hover:bg-surface-3 hover:text-error transition-colors duration-100"
        >
          <Trash size={12} weight="regular" className="text-ink-muted" />
          Delete
        </button>
      ) : (
        <div className="px-3 py-2 border-t border-surface-3">
          <p className="text-caption text-ink-muted font-share mb-1.5">Delete forever?</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => { onDelete(); onClose() }}
              className="flex-1 px-2 py-1 text-caption font-semibold font-share
                bg-error/20 text-error hover:bg-error/30 rounded-control transition-colors duration-100"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 px-2 py-1 text-caption font-share
                bg-surface-3 text-ink-muted hover:text-ink-secondary rounded-control transition-colors duration-100"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Single chat row with hover-revealed dots menu */
function ChatItem({
  chat, isActive, onSelect, onArchive, onDelete
}: {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const isDraft = !chat.updatedAt

  // Deterministic pulse per chat — same rhythm every time
  const idHash = chat.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const pulseDur = 3 + ((idHash % 15) / 10)   // 3–4.4s
  const pulseDelay = (idHash % 30) / 10        // 0–2.9s

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setMenuOpen(false) }}
    >
      <div className={`sidebar-item flex items-center rounded-control font-share
        ${isActive
          ? "bg-surface-2 text-ink-primary border border-surface-3"
          : "text-ink-secondary hover:bg-surface-2/40 hover:text-ink-primary border border-transparent"}`}
        style={{
          "--pulse-duration": `${pulseDur}s`,
          "--pulse-delay": `${pulseDelay}s`,
        } as React.CSSProperties}
      >
        {/* Main click area */}
        <button
          onClick={onSelect}
          className="flex-1 text-left px-2 py-1 text-label truncate min-w-0"
          title={isDraft ? "Draft chat — saved after first message" : (chat.name || "Empty Session")}
        >
          <span className={isDraft ? "text-ink-muted" : undefined}>{chat.name || "Empty Session"}</span>
          {isDraft && <span className="ml-1 text-caption text-ink-faint">draft</span>}
        </button>

        {/* Dots button — only visible on hover or when menu is open */}
        {(hovered || menuOpen) && (
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            className="shrink-0 px-1.5 py-1 text-ink-faint hover:text-ink-muted transition-colors duration-100"
          >
            <DotsThree size={12} weight="bold" />
          </button>
        )}
      </div>

      {menuOpen && (
        <ChatItemMenu
          onArchive={onArchive}
          onDelete={onDelete}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}

export function ArtimisSidebar({
  projects, chats, activeChatId, signalState,
  onNewChat, onSelectChat, onCreateProject, onSelectTool, onOpenSettings, activeTool,
  onArchiveChat, onDeleteChat,
}: Props) {
  const [chatsOpen, setChatsOpen] = useState(true)
  const [showingNewProject, setShowingNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")

  const { unassigned, folders } = groupChats(chats, projects)

  const handleCreateProject = () => {
    const n = newProjectName.trim()
    if (!n) return
    onCreateProject(n)
    setNewProjectName("")
    setShowingNewProject(false)
  }

  return (
    <div className="w-[220px] h-full shrink-0 flex flex-col bg-surface-1 border-r border-surface-3 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-surface-3 shrink-0">
        <LivingSignal state={signalState} />
        <span className="text-body font-bold text-signal-400 tracking-widest uppercase font-share">
          Artimis
        </span>
      </div>

      {/* Nav scroll */}
      <div className="flex-1 overflow-y-auto px-3">

        {/* CHATS */}
        <div className="flex items-center gap-1 h-7">
          <button
            onClick={() => setChatsOpen(!chatsOpen)}
            className="flex-1 flex items-center gap-1.5 px-2 text-label font-medium text-ink-muted
              hover:text-ink-secondary transition-colors duration-150 font-share"
          >
            {chatsOpen ? <CaretDown size={10} /> : <CaretRight size={10} />}
            <span>CHATS</span>
          </button>
          <button
            onClick={() => onNewChat(null)}
            title="Start a new chat"
            aria-label="Start a new chat"
            className="h-6 w-6 flex items-center justify-center rounded-control border border-surface-3
              text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors duration-150"
          >
            <Plus size={12} weight="bold" />
          </button>
        </div>

        {chatsOpen && (
          <div className="ml-1.5 mt-0.5 space-y-0.5">
            {unassigned.map(c => (
              <ChatItem
                key={c.id}
                chat={c}
                isActive={c.id === activeChatId}
                onSelect={() => onSelectChat(c.id)}
                onArchive={() => onArchiveChat(c.id)}
                onDelete={() => onDeleteChat(c.id)}
              />
            ))}

            {folders.map(f => (
              <div key={f.name} className="mt-1">
                <div className="px-2 py-1 text-caption font-medium text-ink-muted/70 tracking-wider font-share">
                  {f.name} <span className="text-ink-faint ml-1">{f.chats.length}</span>
                </div>
                {f.chats.map(c => (
                  <ChatItem
                    key={c.id}
                    chat={c}
                    isActive={c.id === activeChatId}
                    onSelect={() => onSelectChat(c.id)}
                    onArchive={() => onArchiveChat(c.id)}
                    onDelete={() => onDeleteChat(c.id)}
                  />
                ))}
              </div>
            ))}

            {!showingNewProject ? (
              <button
                onClick={() => setShowingNewProject(true)}
                className="w-full text-left px-2 py-1 text-caption font-medium text-ink-muted
                  hover:text-ink-secondary transition-colors font-share"
              >
                + New project
              </button>
            ) : (
              <div className="px-1 py-1 flex gap-1">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreateProject()}
                  placeholder="Name"
                  autoFocus
                  spellCheck={false}
                  className="flex-1 bg-surface-2 border border-surface-3 rounded-control px-2 py-1
                    text-label text-ink-primary font-share outline-none placeholder:text-ink-faint"
                />
                <button
                  onClick={handleCreateProject}
                  className="px-2 py-1 text-label font-medium text-signal-400 hover:text-signal-300
                    transition-colors font-share"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}

        {/* TOOLS */}
        <div className="mt-3 mb-1 px-2 text-caption font-medium text-ink-muted tracking-wider font-share">
          TOOLS
        </div>

        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => { onSelectTool(t.id); if (activeTool === t.id) onSelectTool("") }}
            className={`sidebar-item w-full flex items-center gap-2 px-2 py-1 text-label rounded-control font-share
              ${activeTool === t.id
                ? "bg-surface-2 text-ink-primary border border-surface-3"
                : "text-ink-secondary hover:bg-surface-2/40 hover:text-ink-primary border border-transparent"}`}
          >
            <span className={activeTool === t.id ? "text-signal-400" : "text-ink-muted"}>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="h-[42px] px-4 flex items-center justify-between border-t border-surface-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-signal-600 flex items-center justify-center text-caption font-bold text-ink-primary font-share">
            AD
          </div>
          <span className="text-label font-medium text-ink-secondary font-share">admin</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="text-ink-muted hover:text-ink-secondary transition-colors duration-150"
        >
          <Gear size={13} weight="regular" />
        </button>
      </div>
    </div>
  )
}
