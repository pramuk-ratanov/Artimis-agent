"use client"

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { HomeState } from "@/components/home-state"
import type { SignalState } from "@/components/living-signal"
import type { ToolCall } from "@/lib/api"
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
  onStreamingChange?: (streaming: boolean) => void
  placeholder?: string
  isLoading?: boolean
}

function renderMarkdown(content: string): string {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
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

/** Typewriter: reveals text character-by-character at human reading speed */
function StreamingMessage({ content, onDone }: { content: string; onDone: () => void }) {
  const [displayed, setDisplayed] = useState("")
  const doneRef = useRef(false)

  useEffect(() => {
    let i = 0
    const chars = [...content]
    // Speed: 2-5 chars per tick at ~15ms = ~200-300 chars/sec (fast reading speed)
    const timer = setInterval(() => {
      if (i >= chars.length) {
        clearInterval(timer)
        if (!doneRef.current) {
          doneRef.current = true
          onDone()
        }
        return
      }
      const chunkSize = Math.floor(Math.random() * 4) + 2 // 2-5 chars per frame
      const chunk = chars.slice(i, i + chunkSize).join("")
      i += chunkSize
      setDisplayed(prev => prev + chunk)
    }, 12)
    return () => clearInterval(timer)
  }, [content, onDone])

  return (
    <span>
      <span
        className="msg-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
      />
      {displayed.length < content.length && (
        <span className="caret-blink text-signal-400 font-share">_</span>
      )}
    </span>
  )
}

export function ChatUI({
  messages, onSend, onRetry, onOpenTool, signalState: _signalState = "idle", onStreamingChange,
  placeholder = "Message Artimis...", isLoading = false,
}: ChatUIProps) {
  const [input, setInput] = useState("")
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom || messages.length <= 1) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Detect new assistant message and start streaming
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.role === "assistant" && last.id !== streamingMsgId) {
      setStreamingMsgId(last.id)
      onStreamingChange?.(true)
    }
  }, [messages, streamingMsgId, onStreamingChange])

  useEffect(() => {
    if (messages.length === 0) inputRef.current?.focus()
  }, [messages.length])

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

  const handleStreamDone = useCallback(() => {
    onStreamingChange?.(false)
  }, [onStreamingChange])

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(msgId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback
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

  const handleSaveToMemory = async (content: string) => {
    try {
      const { createMemory } = await import("@/lib/api")
      await createMemory(content, [], "manual")
    } catch {
      // Best effort
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {messages.length === 0 ? (
        <HomeState onSend={onSend} onOpenTool={onOpenTool || (() => {})} />
      ) : (
        <>
          {/* Messages feed */}
          <div ref={feedRef} className="relative flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-[72ch] mx-auto space-y-6">
              {messages.map((msg, i) => {
                const isStreamingMsg = streamingMsgId === msg.id && msg.role === "assistant"
                const isLast = i === messages.length - 1

                return (
                  <div key={msg.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 3) * 60}ms` }}>
                    {/* Timestamp */}
                    {msg.timestamp && (
                      <div className={`text-caption text-ink-faint mb-1.5 font-share ${msg.role === "user" ? "text-right" : ""}`}>
                        {msg.timestamp}
                      </div>
                    )}

                    {/* System messages */}
                    {msg.role === "system" && (
                      <div className="bg-surface-1 border border-surface-3 rounded-card px-5 py-3 text-label text-ink-muted italic font-share">
                        {msg.content}
                      </div>
                    )}

                    {/* User messages */}
                    {msg.role === "user" && (
                      <div className="flex justify-end">
                        <div className="msg-turn text-right">
                          <p className="text-body text-ink-secondary font-share leading-relaxed">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Assistant messages */}
                    {msg.role === "assistant" && (
                      <div className="group">
                        <div className="msg-turn">
                          {isStreamingMsg ? (
                            <StreamingMessage content={msg.content} onDone={handleStreamDone} />
                          ) : (
                            <div
                              className="msg-content text-body text-ink-primary font-share leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                            />
                          )}
                        </div>

                        {/* Tool calls block */}
                        {msg.tool_calls && msg.tool_calls.length > 0 && (
                          <div className="mt-3">
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
                                    <span>{open ? "\u25BE" : "\u25B8"}</span>
                                    <span>{tc.name}</span>
                                    <span className="text-ink-faint">{"\u00B7"} executed</span>
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

                        {/* Hover affordances */}
                        <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button
                            onClick={() => handleCopy(msg.content, msg.id)}
                            className="text-caption font-share text-ink-muted hover:text-ink-secondary transition-colors"
                          >
                            {copiedId === msg.id ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={() => handleSaveToMemory(msg.content)}
                            className="text-caption font-share text-ink-muted hover:text-ink-secondary transition-colors"
                          >
                            Save to Memory
                          </button>
                          {isLast && onRetry && (
                            <button
                              onClick={onRetry}
                              className="text-caption font-share text-ink-muted hover:text-ink-secondary transition-colors"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

            </div>
            {/* Pulse panel — replaces simple Thinking indicator */}
            <PulsePanel isLoading={isLoading && !streamingMsgId} />
          </div>
        </>
      )}

      {/* Composer */}
      <div className="shrink-0 px-8 pb-6 pt-2">
        <div className="max-w-[72ch] mx-auto">
          <div className="flex items-stretch bg-surface-1 border border-surface-3 rounded-composer
            overflow-hidden focus-within:border-signal-500 focus-within:shadow-[0_0_0_1px_rgba(14,165,233,0.35)]
            transition-all duration-150 ease-expo-out">
            <span className="flex items-center pl-3 pr-1.5 text-body font-mono text-signal-400 select-none">
              &gt;
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              spellCheck={false}
              className="flex-1 bg-transparent border-none outline-none text-body text-ink-primary
                font-share placeholder:text-ink-muted py-2.5 px-1"
              style={{ caretColor: "var(--color-signal-500)" }}
            />
            <SpotlightButton>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`px-5 text-label font-semibold font-share transition-all duration-150 ease-expo-out
                  active:scale-[0.97]
                  ${input.trim()
                    ? "bg-signal-600 text-ink-primary"
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
