"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { HomeState } from "@/components/home-state"
import type { SignalState } from "@/components/living-signal"
import type { ToolCall } from "@/lib/api"
import * as api from "@/lib/api"
import { SpotlightButton } from "@/components/ui/spotlight-button"
import { PulsePanel } from "@/components/ui/pulse-panel"

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "tool" | "system"
  content: string
  timestamp?: string
  tool_calls?: ToolCall[]
}

interface ChatUIProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  onRetry?: () => void
  onOpenTool?: (tool: string) => void
  signalState?: SignalState
  streamingMsgId?: string | null
  placeholder?: string
  isLoading?: boolean
}

function renderMarkdown(content: string): string {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ""
      return `<div class="code-block"><div class="code-header">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(code.trim())}">Copy</button></div><pre><code>${code.trim()}</code></pre></div>`
    })
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      if (match.includes('---')) return ''
      const cells = match.split('|').filter(c => c.trim())
      return '<tr>' + cells.map(c => `<td>${c.trim().replace(/\*\*/g, '')}</td>`).join('') + '</tr>'
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>')
}

/** Three-dot typing indicator */
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 animate-fade-up">
      <div className="w-2 h-2 rounded-full bg-signal-400 animate-typing-dot" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 rounded-full bg-signal-400 animate-typing-dot" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 rounded-full bg-signal-400 animate-typing-dot" style={{ animationDelay: "300ms" }} />
    </div>
  )
}

/** Drag-and-drop file upload zone */
function FileDrop({ onUploaded }: { onUploaded: (files: { id: string; original_name: string }[]) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; original_name: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!e.dataTransfer.files.length) return

    setUploading(true)
    try {
      const result = await api.uploadFiles(e.dataTransfer.files)
      const files = result.uploaded
      setUploadedFiles(prev => [...prev, ...files])
      onUploaded(files)
    } catch {
      // silent
    } finally {
      setUploading(false)
    }
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    setUploading(true)
    try {
      const result = await api.uploadFiles(e.target.files)
      const files = result.uploaded
      setUploadedFiles(prev => [...prev, ...files])
      onUploaded(files)
    } catch {
      // silent
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={`mb-2 rounded-control border border-dashed transition-all duration-150
        ${dragOver ? "border-signal-400 bg-surface-2" : "border-surface-3 hover:border-surface-4"}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-caption font-share text-ink-muted hover:text-signal-400 transition-colors cursor-pointer"
          >
            {uploading ? "Uploading..." : dragOver ? "Drop files" : "+ Attach files"}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFilePick} />
          {uploadedFiles.length > 0 && (
            <span className="text-caption text-ink-faint font-share">
              {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""} uploaded
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatUI({
  messages, onSend, onRetry, onOpenTool, signalState: _signalState = "idle",
  streamingMsgId = null,
  placeholder = "Message Artimis...", isLoading = false,
}: ChatUIProps) {
  const [input, setInput] = useState("")
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Auto-scroll to bottom
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom || messages.length <= 1) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Show scroll-to-bottom button when scrolled up
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const check = () => {
      if (!el) return
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(dist > 200 && messages.length > 2)
    }
    el.addEventListener("scroll", check, { passive: true })
    return () => el.removeEventListener("scroll", check)
  }, [messages.length])

  useEffect(() => {
    if (messages.length === 0) inputRef.current?.focus()
  }, [messages.length])

  const scrollToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" })
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    onSend(text)
    setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const toggleToolBlock = (id: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(msgId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = content
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopiedId(msgId)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  // Code block copy via event delegation
  const handleFeedClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains("code-copy-btn")) {
      const encoded = target.getAttribute("data-code")
      if (encoded) {
        const code = decodeURIComponent(encoded)
        navigator.clipboard.writeText(code).catch(() => {})
        target.textContent = "Copied"
        setTimeout(() => { target.textContent = "Copy" }, 1500)
      }
    }
  }

  // Group consecutive messages from the same role
  const groupedMessages: ChatMessage[][] = []
  for (const msg of messages) {
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && lastGroup[0].role === msg.role && msg.role !== "system") {
      lastGroup.push(msg)
    } else {
      groupedMessages.push([msg])
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {messages.length === 0 ? (
        <HomeState onSend={onSend} onOpenTool={onOpenTool || (() => {})} />
      ) : (
        <>
          <div ref={feedRef} className="relative flex-1 overflow-y-auto px-4 md:px-8 py-6" onClick={handleFeedClick}>
            <div className="max-w-[72ch] mx-auto space-y-5">
              {groupedMessages.map((group, gi) => {
                const firstMsg = group[0]
                const isAssistant = firstMsg.role === "assistant"
                const isSystem = firstMsg.role === "system"

                if (isSystem) {
                  return (
                    <div key={firstMsg.id} className="animate-fade-up" style={{ animationDelay: `${gi * 50}ms` }}>
                      <div className="bg-surface-1 border border-surface-3 rounded-card px-5 py-3 text-label text-ink-muted italic font-share">
                        {group.map(m => m.content).join("\n")}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={firstMsg.id} className="animate-fade-up msg-group"
                    style={{ animationDelay: `${gi * 50}ms` }}>
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-caption font-bold font-share
                        ${isAssistant ? "bg-signal-600/20 text-signal-400" : "bg-surface-2 text-ink-muted"}`}>
                        {isAssistant ? "A" : "U"}
                      </div>

                      <div className="flex-1 min-w-0">
                        {group.map((msg, mi) => {
                          const isStreaming = streamingMsgId === msg.id
                          const isLastInGroup = mi === group.length - 1
                          const isLastOverall = gi === groupedMessages.length - 1 && isLastInGroup

                          return (
                            <div key={msg.id} className={mi > 0 ? "mt-3" : ""}>
                              {msg.role === "user" ? (
                                <p className="text-body text-ink-secondary font-share leading-relaxed whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              ) : (
                                <div className="group/msg">
                                  <div className="msg-turn">
                                    <div
                                      className="msg-content text-body text-ink-primary leading-relaxed"
                                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) + (isStreaming ? '<span class="typing-cursor" />' : '') }}
                                    />
                                  </div>

                                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                                    <div className="mt-2">
                                      {msg.tool_calls.map((tc, j) => {
                                        const tcId = `${msg.id}-tc-${j}`
                                        const open = expandedTools.has(tcId)
                                        return (
                                          <div key={tcId} className="mb-1">
                                            <button
                                              onClick={() => toggleToolBlock(tcId)}
                                              className="flex items-center gap-1.5 text-code font-mono text-ink-muted
                                                hover:text-ink-secondary transition-colors duration-150"
                                            >
                                              <span className="text-[10px]">{open ? "\u25BE" : "\u25B8"}</span>
                                              <span>{tc.name}</span>
                                            </button>
                                            {open && (
                                              <div className="mt-1 ml-5 p-2 bg-surface-1 border border-surface-3 rounded-control
                                                text-code font-mono text-ink-muted overflow-x-auto max-h-[160px] overflow-y-auto">
                                                {JSON.stringify(tc.arguments, null, 2)}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}

                                  {isLastInGroup && !isStreaming && (
                                    <div className="flex gap-3 mt-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
                                      <button
                                        onClick={() => handleCopy(msg.content, msg.id)}
                                        className="text-caption font-share text-ink-muted hover:text-ink-secondary transition-colors"
                                      >
                                        {copiedId === msg.id ? "Copied" : "Copy"}
                                      </button>
                                      {isLastOverall && onRetry && (
                                        <button onClick={onRetry}
                                          className="text-caption font-share text-ink-muted hover:text-ink-secondary transition-colors">
                                          Retry
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {msg.timestamp && (
                                <div className="text-caption text-ink-faint mt-0.5 font-share">
                                  {msg.timestamp}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator during tool-calling phase */}
              {isLoading && !streamingMsgId && (
                <div className="flex items-start gap-3 animate-fade-up">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-caption font-bold font-share bg-signal-600/20 text-signal-400">
                    A
                  </div>
                  <TypingDots />
                </div>
              )}
            </div>

            {showScrollBtn && (
              <button onClick={scrollToBottom}
                className="absolute bottom-4 right-6 w-8 h-8 rounded-full bg-surface-2 border border-surface-3
                  flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-surface-3
                  shadow-sm transition-all duration-150 animate-fade-up">
                <span className="text-xs">&#8595;</span>
              </button>
            )}

            <PulsePanel isLoading={isLoading && !streamingMsgId} />
          </div>
        </>
      )}

      {/* Composer */}
      <div className="shrink-0 px-4 md:px-8 pb-6 pt-2">
        <div className="max-w-[72ch] mx-auto">
          {/* File upload drop zone */}
          <FileDrop onUploaded={(_files) => {
            // Files uploaded — agent can now reference them via read_uploaded_file
          }} />
          <div className="flex items-stretch bg-surface-1 border border-surface-3 rounded-composer
            overflow-hidden focus-within:border-signal-400
            transition-colors duration-150 ease-expo-out">
            <span className="flex items-center pl-3 pr-1.5 text-body font-mono text-signal-400 select-none">
              &gt;
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Artimis is thinking..." : placeholder}
              disabled={isLoading}
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent border-none outline-none text-body text-ink-primary
                font-share placeholder:text-ink-muted py-2.5 px-1"
              style={{ caretColor: "var(--color-signal-500)" }}
            />
            <SpotlightButton>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`px-5 text-label font-medium font-sans transition-all duration-120 ease-expo-out
                  active:scale-[0.97]
                  ${input.trim() && !isLoading
                    ? "bg-surface-2 text-ink-primary hover:bg-surface-3"
                    : "bg-transparent text-ink-muted"}`}
              >
                Send
              </button>
            </SpotlightButton>
          </div>
        </div>
      </div>
    </div>
  )
}
