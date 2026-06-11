import { X, Copy, Check } from "@phosphor-icons/react"
import { useState } from "react"

interface CanvasPanelProps {
  title: string
  content: string
  onClose: () => void
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
    .replace(/\n\n/g, '<br><br>')
}

export function CanvasPanel({ title, content, onClose }: CanvasPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-1/2 min-w-[300px] h-full flex flex-col border-l border-surface-2 bg-surface-0 shadow-lg">
      {/* Header */}
      <div className="h-14 min-h-[56px] border-b border-surface-2 flex items-center justify-between px-4 bg-surface-1">
        <h2 className="text-body font-medium text-ink-primary truncate">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 text-ink-muted hover:text-ink-primary transition-colors"
            title="Copy content"
          >
            {copied ? <Check size={18} className="text-signal-success" /> : <Copy size={18} />}
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 text-ink-muted hover:text-warn transition-colors"
            title="Close Canvas"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-y-auto p-6 text-ink-primary text-body leading-relaxed markdown-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  )
}