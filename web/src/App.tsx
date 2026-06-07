"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Bell } from "@phosphor-icons/react"
import { IntroScreen } from "@/components/intro-screen"
import { ChatUI, type ChatMessage } from "@/components/ui/chat-ui"
import { ArtimisSidebar, type Project, type ChatSession } from "@/components/artimis-sidebar"
import { CommandPalette, buildDefaultActions } from "@/components/command-palette"
import type { SignalState } from "@/components/living-signal"
import * as api from "@/lib/api"

import { IntelligencePanel } from "@/components/panels/intelligence-panel"
import { MemoriesPanel } from "@/components/panels/memories-panel"
import { DeepResearchPanel } from "@/components/panels/deep-research-panel"
import { GalleryPanel } from "@/components/panels/gallery-panel"
import { NotesPanel } from "@/components/panels/notes-panel"
import { TasksPanel } from "@/components/panels/tasks-panel"
import { SkillsPanel } from "@/components/panels/skills-panel"
import { ThemePanel } from "@/components/panels/theme-panel"
import { StatisticsPanel } from "@/components/panels/statistics-panel"
import { SettingsModal } from "@/components/panels/settings-modal"

function gen() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

interface FullChat { id: string; name: string; projectId: string | null; updatedAt: string; messages: ChatMessage[] }

function App() {
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem("artimis-intro-shown"))
  const [projects, setProjects] = useState<Project[]>([])
  const [chats, setChats] = useState<FullChat[]>(() => {
    const id = gen()
    return [{ id, name: "New Chat", projectId: null, updatedAt: "", messages: [] }]
  })
  const [activeChatId, setActiveChatId] = useState<string>(chats[0].id)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [signalState, setSignalState] = useState<SignalState>("idle")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [offline, setOffline] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0]

  // Safety: if chats is empty (all deleted), force a new one
  useEffect(() => {
    if (chats.length === 0) handleNewChat()
  }, [chats.length])

  // Intro persistence
  const handleIntroDone = useCallback(() => {
    sessionStorage.setItem("artimis-intro-shown", "1")
    setShowIntro(false)
  }, [])

  // Cmd+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(p => !p) }
    }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [])

  // Notification polling
  useEffect(() => {
    pollRef.current = setInterval(() => {
      api.getNotifications().then(ns => setNotificationCount(ns.length)).catch(() => {})
    }, 30000)
    api.getNotifications().then(ns => setNotificationCount(ns.length)).catch(() => {})
    return () => clearInterval(pollRef.current)
  }, [])

  // Online/offline detection
  useEffect(() => {
    const go = () => setOffline(false)
    const stop = () => setOffline(true)
    setOffline(!navigator.onLine)
    window.addEventListener("online", go)
    window.addEventListener("offline", stop)
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", stop) }
  }, [])

  // Load sessions on mount
  useEffect(() => {
    api.getSessions().then(sessions => {
      if (sessions.length > 0) {
        const mapped: FullChat[] = sessions.map(s => ({
          id: s.id, name: s.name, projectId: null,
          updatedAt: s.updated_at, messages: [],
        }))
        setChats(mapped)
        setActiveChatId(mapped[0].id)
      }
    }).catch(() => {})
  }, [])

  const handleNewChat = useCallback((pid: string | null = null) => {
    api.createSession().then(s => {
      const c: FullChat = { id: s.id, name: s.name, projectId: pid, updatedAt: s.updated_at, messages: [] }
      setChats(p => [c, ...p])
      setActiveChatId(c.id)
      setActiveTool(null)
    }).catch(() => {
      const c: FullChat = { id: gen(), name: "New Chat", projectId: pid, updatedAt: "", messages: [] }
      setChats(p => [c, ...p])
      setActiveChatId(c.id)
      setActiveTool(null)
    })
  }, [])

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id)
    setActiveTool(null)
    // Load messages from backend if not already loaded
    setChats(p => {
      const chat = p.find(c => c.id === id)
      if (chat && chat.messages.length === 0) {
        api.getSessionMessages(id, 100, 0).then(msgs => {
          const mapped: ChatMessage[] = msgs.map(m => ({
            id: String(m.id),
            role: m.role as ChatMessage["role"],
            content: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            tool_calls: m.tool_calls,
          }))
          setChats(prev => prev.map(c => c.id === id ? { ...c, messages: mapped } : c))
        }).catch(() => {})
      }
      return p
    })
  }, [])

  const handleCreateProject = useCallback((n: string) => {
    setProjects(p => [...p, { id: gen(), name: n }])
  }, [])

  const handleArchiveChat = useCallback((id: string) => {
    api.updateSessionName(id, chats.find(c => c.id === id)?.name || "Archived").catch(() => {})
    fetch(`/api/sessions/${id}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({status:"archived"}) }).catch(() => {})
    setChats(p => {
      const next = p.filter(c => c.id !== id)
      if (activeChatId === id && next.length > 0) setActiveChatId(next[0].id)
      return next
    })
  }, [activeChatId, chats])

  const handleDeleteChat = useCallback((id: string) => {
    api.deleteSession(id).catch(() => {})
    setChats(p => {
      const next = p.filter(c => c.id !== id)
      if (activeChatId === id && next.length > 0) setActiveChatId(next[0].id)
      return next
    })
  }, [activeChatId])

  const handleSelectTool = useCallback((t: string) => setActiveTool(t), [])

  const handleSend = useCallback(async (text: string) => {
    const um: ChatMessage = {
      id: gen(), role: "user", content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }
    setChats(p => p.map(c => c.id === activeChatId ? {
      ...c, messages: [...c.messages, um], updatedAt: new Date().toISOString(),
    } : c))

    setIsLoading(true)
    setSignalState("thinking")

    try {
      const res = await api.sendAgentMessage(text, activeChatId)
      setSignalState("streaming")
      const am: ChatMessage = {
        id: gen(), role: "assistant", content: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
      setChats(p => p.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, am], updatedAt: new Date().toISOString() } : c))
      setSignalState("idle")

      // Auto-name the session after the first exchange
      const currentChat = chats.find(c => c.id === activeChatId)
      const isFirstExchange = currentChat && currentChat.messages.filter(m => m.role === "assistant").length === 0
      if (isFirstExchange || currentChat?.name === "New Chat") {
        api.autoNameSession(activeChatId).then(r => {
          if (r.name && r.name !== "New Chat") {
            setChats(p => p.map(c => c.id === activeChatId ? { ...c, name: r.name } : c))
          }
        }).catch(() => {})
      }
    } catch {
      setSignalState("error")
      const em: ChatMessage = {
        id: gen(), role: "system", content: "Could not reach the Artimis backend on port 7001. Is it running?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
      setChats(p => p.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, em] } : c))
      setTimeout(() => setSignalState("idle"), 3000)
    } finally {
      setIsLoading(false)
    }
  }, [activeChatId, chats])

  const handleStreamingChange = useCallback((streaming: boolean) => {
    if (!streaming && signalState === "streaming") setSignalState("idle")
  }, [signalState])

  const handleRetry = useCallback(() => {
    const lastUserMsg = activeChat.messages.filter(m => m.role === "user").pop()
    if (lastUserMsg) {
      // Strip the last assistant message so the agent doesn't see its own
      // previous (potentially partial/failed) response before we resend.
      setChats(p => p.map(c => {
        if (c.id !== activeChatId) return c
        // Walk from the end and remove the last assistant message
        const msgs = [...c.messages]
        const lastAssistantIdx = msgs.map(m => m.role).lastIndexOf("assistant")
        if (lastAssistantIdx !== -1) msgs.splice(lastAssistantIdx, 1)
        return { ...c, messages: msgs }
      }))
      handleSend(lastUserMsg.content)
    }
  }, [activeChat.messages, activeChatId, handleSend])

  const sidebarChats: ChatSession[] = chats.map(c => ({
    id: c.id, name: c.name, projectId: c.projectId, updatedAt: c.updatedAt,
  }))

  const paletteActions = buildDefaultActions(
    () => handleNewChat(), handleSelectTool, () => setSettingsOpen(true),
    chats.slice(0, 10).map(c => ({ id: c.id, name: c.name, onClick: () => handleSelectChat(c.id) }))
  )

  const renderToolPanel = () => {
    switch (activeTool) {
      case "intelligence": return <IntelligencePanel />
      case "memories": return <MemoriesPanel />
      case "deep-research": return <DeepResearchPanel />
      case "gallery": return <GalleryPanel />
      case "notes": return <NotesPanel />
      case "tasks": return <TasksPanel />
      case "skills": return <SkillsPanel />
      case "statistics": return <StatisticsPanel />
      case "theme": return <ThemePanel />
      default: return null
    }
  }

  return (
    <>
      {showIntro && <IntroScreen onComplete={handleIntroDone} />}

      {!showIntro && (
        <div className="flex w-screen h-screen bg-surface-0 overflow-hidden">
          <ArtimisSidebar
            projects={projects} chats={sidebarChats} activeChatId={activeChatId}
            signalState={signalState} onNewChat={handleNewChat} onSelectChat={handleSelectChat}
            onCreateProject={handleCreateProject} onSelectTool={handleSelectTool}
            onOpenSettings={() => setSettingsOpen(true)} activeTool={activeTool}
            onArchiveChat={handleArchiveChat} onDeleteChat={handleDeleteChat}
          />

          <main className="flex-1 min-w-0 overflow-hidden relative dark-horizon-glow">
            {/* Notification bell */}
            <button
              className="absolute top-2 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-control
                text-ink-muted hover:text-ink-secondary hover:bg-surface-2 transition-all duration-150"
              onClick={() => setNotificationCount(0)}
            >
              <Bell size={14} weight={notificationCount > 0 ? "fill" : "regular"} />
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center
                  rounded-full bg-signal-600 text-[0.5rem] font-bold text-ink-primary">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </button>

            {/* Offline banner */}
            {offline && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-warn/10 border border-warn/30
                rounded-control text-caption font-medium text-warn">
                Offline — waiting for connection
              </div>
            )}

            {activeTool ? (
              renderToolPanel()
            ) : (
              <ChatUI
                messages={activeChat.messages}
                onSend={handleSend}
                onRetry={handleRetry}
                onOpenTool={handleSelectTool}
                signalState={signalState}
                onStreamingChange={handleStreamingChange}
                isLoading={isLoading}
              />
            )}
          </main>
        </div>
      )}

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

export default App
