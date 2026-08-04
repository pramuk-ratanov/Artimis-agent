"use client"

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react"
import { Bell, List, X } from "@phosphor-icons/react"
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
import { HarnessLabPanel } from "@/components/panels/harness-lab-panel"
import { SettingsModal } from "@/components/panels/settings-modal"
const CanvasPanel = lazy(() =>
  import("@/components/panels/canvas-panel").then(m => ({ default: m.CanvasPanel }))
)
const StatisticsPanel = lazy(() =>
  import("@/components/panels/statistics-panel").then(m => ({ default: m.StatisticsPanel }))
)
import { ToastProvider } from "@/components/ui/toast"

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
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  const [liveReasoning, setLiveReasoning] = useState("")
  const [canvasState, setCanvasState] = useState<{isOpen: boolean; title: string; content: string}>({isOpen: false, title: "", content: ""})
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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

  // Rehydrate canvas from active chat messages on chat switch or load
  useEffect(() => {
    if (isLoading) return; // Don't interrupt streaming updates
    const chat = chats.find(c => c.id === activeChatId)
    if (!chat || chat.messages.length === 0) {
       setCanvasState(s => s.isOpen ? { ...s, isOpen: false } : s)
       return
    }
    
    let foundCanvas = false;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
       const msg = chat.messages[i];
       if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
           const canvasCall = msg.tool_calls.find((t: any) => t.function?.name === 'canvas_update' || t.name === 'canvas_update');
           if (canvasCall) {
               try {
                  const argsRaw = canvasCall.function?.arguments || canvasCall.arguments;
                  const args = typeof argsRaw === 'string' 
                     ? JSON.parse(argsRaw) 
                     : argsRaw;
                  setCanvasState({
                     isOpen: true,
                     title: args.title || "Canvas",
                     content: args.content || ""
                  });
                  foundCanvas = true;
                  break;
               } catch(e) {}
           }
       }
    }
    
    if (!foundCanvas) {
        setCanvasState(s => s.isOpen ? { ...s, isOpen: false } : s)
    }
  }, [activeChatId, chats, isLoading])

  const handleNewChat = useCallback((pid: string | null = null) => {
    // Create local-only chat. Session is only persisted to DB on first message.
    const c: FullChat = { id: gen(), name: "New Chat", projectId: pid, updatedAt: "", messages: [] }
    setChats(p => [c, ...p])
    setActiveChatId(c.id)
    setActiveTool(null)
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
    api.updateSession(id, { status: "archived" }).catch(() => {})
    setChats(p => {
      const next = p.filter(c => c.id !== id)
      if (activeChatId === id && next.length > 0) setActiveChatId(next[0].id)
      return next
    })
  }, [activeChatId])

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

    // Placeholder for streaming assistant response
    const amId = gen()
    const am: ChatMessage = {
      id: amId, role: "assistant", content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }

    setChats(p => p.map(c => c.id === activeChatId ? {
      ...c, messages: [...c.messages, um, am], updatedAt: new Date().toISOString(),
    } : c))

    setIsLoading(true)
    setSignalState("thinking")
    setStreamingMsgId(amId)
    setLiveReasoning("")

    try {
      const stream = await api.streamAgentMessage(text, activeChatId)
      const reader = stream.getReader()
      let responseText = ""
      let sessionId = activeChatId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value.type === "tool") {
          setSignalState("thinking")
          setLiveReasoning("")
          // canvas_update tool — open canvas with provided content immediately
          if (value.name === "canvas_update" && value.args?.content) {
            setCanvasState({ isOpen: true, title: value.args.title || "Canvas", content: value.args.content })
          }
          // design_audit tool — keep canvas open showing current code
          if (value.name === "design_audit") {
            setCanvasState(s => ({ isOpen: true, title: s.title || "Design Audit", content: s.content }))
          }
        } else if (value.type === "reasoning") {
          // Live "thoughts" from reasoning models (DeepSeek reasoning_content)
          setLiveReasoning(prev => prev + (value.content || ""))
        } else if (value.type === "start") {
          setSignalState("streaming")
          if (value.session_id) sessionId = value.session_id
        } else if (value.type === "token") {
          responseText += value.content || ""

          // Update canvas content if already open (canvas_update tool opened it)
          if (canvasState.isOpen) {
            setCanvasState(s => ({ ...s, content: responseText }))
          }

          setChats(p => p.map(c => c.id === activeChatId ? {
            ...c,
            messages: c.messages.map(m => m.id === amId ? { ...m, content: responseText } : m),
          } : c))
        } else if (value.type === "done") {
          // Backend sends the authoritative session_id on the done event.
          // (The start event does not carry it.) Capture it for ID sync below.
          if (value.session_id) sessionId = value.session_id
        } else if (value.type === "error") {
          if (value.session_id) sessionId = value.session_id
          if (!responseText) responseText = value.content || "Something went wrong."
          setChats(p => p.map(c => c.id === activeChatId ? {
            ...c,
            messages: c.messages.map(m => m.id === amId ? { ...m, content: responseText } : m),
          } : c))
          break
        }
      }

      setSignalState("idle")
      setStreamingMsgId(null)
      setLiveReasoning("")

      // Sync frontend ID with backend session
      if (sessionId && sessionId !== activeChatId) {
        setActiveChatId(sessionId)
        setChats(p => p.map(c => c.id === activeChatId ? { ...c, id: sessionId } : c))
      }

      // Auto-name the session after first exchange
      const finalSessionId = sessionId || activeChatId
      const currentChat = chats.find(c => c.id === activeChatId)
      const isFirstExchange = currentChat && currentChat.messages.filter(m => m.role === "assistant").length === 0
      if (isFirstExchange || currentChat?.name === "New Chat") {
        api.autoNameSession(finalSessionId).then(r => {
          if (r.name && r.name !== "New Chat") {
            setChats(p => p.map(c => (c.id === activeChatId || c.id === finalSessionId) ? { ...c, name: r.name } : c))
          }
        }).catch(() => {})
      }

    } catch {
      setSignalState("error")
      setStreamingMsgId(null)
      setChats(p => p.map(c => c.id === activeChatId ? {
        ...c,
        messages: c.messages.map(m => m.id === amId ? { ...m, content: "Could not reach the Artimis backend. Is it running on port 7002?" } : m),
      } : c))
      setTimeout(() => setSignalState("idle"), 3000)
    } finally {
      setIsLoading(false)
    }
  }, [activeChatId, chats])

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
      case "statistics": return (
        <Suspense fallback={<div className="p-6 text-label text-ink-muted font-share">Loading statistics…</div>}>
          <StatisticsPanel />
        </Suspense>
      )
      case "harness-lab": return <HarnessLabPanel />
      case "theme": return <ThemePanel />
      default: return null
    }
  }

  return (
    <ToastProvider>
      {showIntro && <IntroScreen onComplete={handleIntroDone} />}

      {!showIntro && (
        <div className="flex w-full min-h-[100dvh] h-[100dvh] bg-surface-0 overflow-hidden">
          {/* Desktop navigation */}
          <div className="hidden md:block h-full shrink-0">
            <ArtimisSidebar
              projects={projects} chats={sidebarChats} activeChatId={activeChatId}
              signalState={signalState} onNewChat={handleNewChat} onSelectChat={handleSelectChat}
              onCreateProject={handleCreateProject} onSelectTool={handleSelectTool}
              onOpenSettings={() => setSettingsOpen(true)} activeTool={activeTool}
              onArchiveChat={handleArchiveChat} onDeleteChat={handleDeleteChat}
            />
          </div>

          {/* Mobile navigation drawer */}
          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <button
                className="absolute inset-0 bg-surface-0/80"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              />
              <div className="relative h-full w-[min(86vw,320px)]">
                <ArtimisSidebar
                  projects={projects} chats={sidebarChats} activeChatId={activeChatId}
                  signalState={signalState}
                  onNewChat={(pid) => { handleNewChat(pid); setMobileNavOpen(false) }}
                  onSelectChat={(id) => { handleSelectChat(id); setMobileNavOpen(false) }}
                  onCreateProject={handleCreateProject}
                  onSelectTool={(tool) => { handleSelectTool(tool); setMobileNavOpen(false) }}
                  onOpenSettings={() => { setSettingsOpen(true); setMobileNavOpen(false) }}
                  activeTool={activeTool}
                  onArchiveChat={handleArchiveChat}
                  onDeleteChat={handleDeleteChat}
                />
                <button className="absolute right-3 top-3 btn-ghost" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 min-w-0 overflow-hidden relative dark-horizon-glow pt-11 md:pt-0">
            <div className="absolute top-0 inset-x-0 z-20 h-11 md:hidden flex items-center justify-between px-3 border-b border-surface-3 bg-surface-1">
              <button className="btn-ghost !min-h-8 !px-2" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
                <List size={19} />
              </button>
              <span className="text-label font-semibold text-ink-primary">Artimis</span>
              <button className="btn-ghost !min-h-8 !px-2" onClick={() => setNotificationCount(0)} aria-label="Notifications">
                <Bell size={17} weight={notificationCount > 0 ? "fill" : "regular"} />
              </button>
            </div>
            {/* Notification bell */}
            <button
              aria-label="Clear notifications"
              className="hidden md:flex absolute top-2 right-3 z-10 w-7 h-7 items-center justify-center rounded-control
                text-ink-muted hover:text-ink-secondary hover:bg-surface-2 transition-all duration-150"
              onClick={() => setNotificationCount(0)}
            >
              <Bell size={14} weight={notificationCount > 0 ? "fill" : "regular"} />
              <span className="t-badge" data-open={notificationCount > 0}>
                <span className="t-badge-dot w-4 h-4 flex items-center justify-center
                  rounded-full bg-signal-600 text-[0.5rem] font-bold text-white">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              </span>
            </button>

            {/* Offline banner */}
            {offline && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-warn/10 border border-warn/30
                rounded-control text-caption font-medium text-warn">
                Offline. Waiting for connection
              </div>
            )}

            {activeTool ? (
              renderToolPanel()
            ) : (
              <div className="flex h-full w-full relative">
                <div className={`flex-1 min-w-0 transition-all duration-300 ${canvasState.isOpen ? 'hidden lg:block lg:w-1/2' : 'w-full'}`}>
                  <ChatUI
                    messages={activeChat.messages}
                    onSend={handleSend}
                    onRetry={handleRetry}
                    onOpenTool={handleSelectTool}
                    onOpenCanvas={(title, content) => setCanvasState({ isOpen: true, title, content })}
                    signalState={signalState}
                    streamingMsgId={streamingMsgId}
                    liveReasoning={liveReasoning}
                    isLoading={isLoading}
                  />
                </div>
                {canvasState.isOpen && (
                  <Suspense fallback={
                    <div className="flex items-center justify-center w-full lg:w-1/2 h-full bg-surface-1 border-l border-surface-3" role="status" aria-live="polite">
                      <span className="text-label text-ink-muted font-share">Loading canvas...</span>
                    </div>
                  }>
                    <CanvasPanel
                      title={canvasState.title}
                      content={canvasState.content}
                      onClose={() => setCanvasState(s => ({ ...s, isOpen: false }))}
                    />
                  </Suspense>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ToastProvider>
  )
}

export default App
