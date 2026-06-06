"use client"

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { HomeState } from "@/components/home-state"
import type { SignalState } from "@/components/living-signal"
import type { ToolCall } from "@/lib/api"

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

function StreamingMessage({ content, onDone }: { content: string; onDone: () => void }) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    const chars = [...content]
    const timer = setInterval(() => {
      if (i >= chars.length) {
        clearInterval(timer)
        setDone(true)
        onDone()
        return
      }
      const chunk = chars.slice(i, i + (Math.random() > 0.5 ? 3 : 1)).join("")
      i += chunk.length
      setDisplayed(prev => prev + chunk)
    }, 20)
    return () => clearInterval(timer)
  }, [content, onDone])

  return (
    <span>
      <span
        className="msg-content"
        style={{ fontFamily: "var(--font-sans)", fontSize: "var(--font-size-body)", lineHeight: 1.65, color: "var(--color-ink-primary)" }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
      />
      {!done && <span className="caret-blink text-signal-400 font-mono">_</span>}
    </span>
  )
}

export function ChatUI({
  messages, onSend, onOpenTool, signalState = "idle", onStreamingChange,
  placeholder = "Message Artimis...", isLoading = false,
}: ChatUIProps) {
  const [input, setInput] = useState("")
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [lastMsgId, setLastMsgId] = useState<string | null>(null)

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom || messages.length <= 1) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Detect new streaming message
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.role === "assistant" && last.id !== lastMsgId) {
      setLastMsgId(last.id)
      onStreamingChange?.(true)
    }
  }, [messages, lastMsgId, onStreamingChange])

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

  const isStreaming = signalState === "streaming"

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {messages.length === 0 ? (
        <HomeState onSend={onSend} onOpenTool={onOpenTool || (() => {})} />
      ) : (
        <>
          {/* Messages feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-[65ch] mx-auto space-y-3">
              {messages.map((msg, i) => {
                const isStreamingMsg = isStreaming && i === messages.length - 1 && msg.role === "assistant"

                return (
                  <div key={msg.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 3) * 60}ms` }}>
                    {/* Timestamp */}
                    {msg.timestamp && (
                      <div className={`text-caption text-ink-faint mb-1 ${msg.role === "user" ? "text-right" : ""}`}>
                        {msg.timestamp}
                      </div>
                    )}

                    {/* System messages */}
                    {msg.role === "system" && (
                      <div className="bg-surface-1 border border-surface-3 rounded-card px-4 py-3 text-label text-ink-muted italic">
                        {msg.content}
                      </div>
                    )}

                    {/* User messages */}
                    {msg.role === "user" && (
                      <div className="flex justify-end">
                        <div className="msg-turn text-right">
                          <p className="text-body text-ink-secondary" style={{ fontFamily: "var(--font-sans)" }}>
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
                              className="msg-content text-body text-ink-primary"
                              style={{ fontFamily: "var(--font-sans)" }}
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                            />
                          )}
                        </div>

                        {/* Tool calls block */}
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
                                    <span>{open ? "▾" : "▸"}</span>
                                    <span>{tc.name}</span>
                                    <span className="text-ink-faint">· executed call</span>
                                  </button>
                                  {open && (
                                    <div className="mt-1 ml-5 p-2 bg-surface-1 border border-surface-3 rounded-control
                                      text-code font-mono text-ink-muted overflow-x-auto">
                                      {JSON.stringify(tc.arguments, null, 2)}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Hover affordances (Copy / Save / Retry on last) */}
                        <div className="flex gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button className="text-caption text-ink-muted hover:text-ink-secondary transition-colors">
                            Copy
                          </button>
                          <button className="text-caption text-ink-muted hover:text-ink-secondary transition-colors">
                            Save to Memory
                          </button>
                          {i === messages.length - 1 && (
                            <button className="text-caption text-ink-muted hover:text-ink-secondary transition-colors">
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Loading state */}
              {isLoading && !isStreaming && (
                <div className="animate-fade-up">
                  <div className="flex items-center gap-2 text-label text-ink-muted italic">
                    <span>Thinking</span>
                    <span className="animate-signal-pulse inline-block w-1.5 h-1.5 rounded-full bg-signal-400" />
                    <span>Analyzing context & running tools…</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4">
        <div className="max-w-[65ch] mx-auto">
          <div className="flex items-stretch bg-surface-1 border border-surface-3 rounded-composer
            overflow-hidden focus-within:border-signal-500 focus-within:shadow-[0_0_0_1px_rgba(14,165,233,0.35)]
            transition-all duration-150 ease-expo-out">
            <span className="flex items-center pl-2.5 pr-1.5 text-body font-mono text-signal-400 select-none">
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
                font-share placeholder:text-ink-muted py-2 px-1"
              style={{ caretColor: "var(--color-signal-500)" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={`px-4 text-label font-semibold transition-all duration-150 ease-expo-out
                active:scale-[0.97]
                ${input.trim()
                  ? "bg-signal-600 text-ink-primary"
                  : "bg-transparent text-ink-muted"}`}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
