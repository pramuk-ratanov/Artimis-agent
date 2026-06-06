"use client"

import { useState } from "react"
import {
  Plus, CaretDown, CaretRight, Brain, ImageSquare, Note,
  CheckSquare, Wrench, Database, Palette, Gear, Compass,
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

export function ArtimisSidebar({
  projects, chats, activeChatId, signalState,
  onNewChat, onSelectChat, onCreateProject, onSelectTool, onOpenSettings, activeTool,
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
    <div className="w-[200px] h-full shrink-0 flex flex-col bg-surface-1 border-r border-surface-3 overflow-hidden">
      {/* Header */}
      <div className="h-[40px] px-2.5 flex items-center gap-2 border-b border-surface-3 shrink-0">
        <LivingSignal state={signalState} />
        <span className="text-label font-semibold text-signal-400 tracking-wide">Artimis</span>
      </div>

      {/* New Chat */}
      <div className="p-2 shrink-0">
        <button
          onClick={() => onNewChat(null)}
          className="w-full flex items-center gap-2 h-8 px-2 rounded-control bg-surface-2 text-label
            font-medium text-ink-secondary hover:border-signal-500 hover:text-ink-primary
            border border-transparent transition-all duration-150 ease-expo-out"
        >
          <Plus size={14} weight="regular" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Nav scroll */}
      <div className="flex-1 overflow-y-auto px-2">

        {/* CHATS */}
        <button
          onClick={() => setChatsOpen(!chatsOpen)}
          className="w-full flex items-center gap-1.5 h-7 px-2 text-label font-medium text-ink-muted
            hover:text-ink-secondary transition-colors duration-150"
        >
          {chatsOpen ? <CaretDown size={10} /> : <CaretRight size={10} />}
          <span>CHATS</span>
        </button>

        {chatsOpen && (
          <div className="ml-2">
            {unassigned.map(c => (
              <button
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={`sidebar-item w-full text-left px-1.5 py-0.5 text-label rounded-control
                  ${c.id === activeChatId
                    ? "bg-surface-2 text-ink-primary border border-surface-3"
                    : "text-ink-secondary hover:bg-surface-2/40 hover:text-ink-primary border border-transparent"}`}
              >
                {c.name}
              </button>
            ))}

            {folders.map(f => (
              <div key={f.name} className="mt-1">
                <div className="px-2 py-0.5 text-caption font-medium text-ink-muted/70 tracking-wider">
                  {f.name} <span className="text-ink-faint ml-1">{f.chats.length}</span>
                </div>
                {f.chats.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectChat(c.id)}
                    className={`sidebar-item w-full text-left px-1.5 py-0.5 text-label rounded-control
                      ${c.id === activeChatId
                        ? "bg-surface-2 text-ink-primary border border-surface-3"
                        : "text-ink-secondary hover:bg-surface-2/40 hover:text-ink-primary border border-transparent"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ))}

            {!showingNewProject ? (
              <button
                onClick={() => setShowingNewProject(true)}
                className="w-full text-left px-1.5 py-0.5 text-caption font-medium text-ink-muted
                  hover:text-ink-secondary transition-colors"
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
                    transition-colors"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}

        {/* TOOLS */}
        <div className="mt-2 mb-0.5 px-2 text-caption font-medium text-ink-muted tracking-wider">
          TOOLS
        </div>

        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => { onSelectTool(t.id); if (activeTool === t.id) onSelectTool("") }}
            className={`sidebar-item w-full flex items-center gap-2 px-1.5 py-0.5 text-label rounded-control
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
      <div className="h-[40px] px-2.5 flex items-center justify-between border-t border-surface-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-signal-600 flex items-center justify-center text-caption font-bold text-ink-primary">
            AD
          </div>
          <span className="text-label font-medium text-ink-secondary">admin</span>
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
