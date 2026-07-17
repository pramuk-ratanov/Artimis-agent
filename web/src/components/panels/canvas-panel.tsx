import { X, Copy, Check, Code, Play } from "@phosphor-icons/react"
import { useState, useMemo } from "react"
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor,
  type SandpackFiles,
} from "@codesandbox/sandpack-react"

interface CanvasPanelProps {
  title: string
  content: string
  onClose: () => void
}

const SANDPACK_BUNDLER_URL = import.meta.env.VITE_SANDPACK_BUNDLER_URL || undefined

const SANDBOX_DEPENDENCIES = {
  "lucide-react": "1.17.0",
  "@phosphor-icons/react": "2.1.10",
}

function extractCodeFromContent(content: string): { lang: string; code: string } | null {
  const match = content.match(/```(html|tsx|jsx|react)\n([\s\S]*?)(?:```|$)/)
  if (!match) return null
  return { lang: match[1], code: match[2].trim() }
}

const sandpackTheme = {
  colors: {
    surface1: "#0f1117",
    surface2: "#161822",
    surface3: "#1e2130",
    clickable: "#8b949e",
    base: "#c9d1d9",
    disabled: "#484f58",
    hover: "#e6edf3",
    accent: "#7c9aff",
    error: "#f85149",
    errorSurface: "#161822",
  },
  syntax: {
    keyword: "#ff7b72",
    property: "#79c0ff",
    plain: "#c9d1d9",
    static: "#a5d6ff",
    string: "#a5d6ff",
    definition: "#d2a8ff",
    punctuation: "#8b949e",
    tag: "#7ee787",
    comment: "#8b949e",
  },
  font: { size: "13px", lineHeight: "20px", mono: "'JetBrains Mono', 'Fira Code', monospace" },
}

export function CanvasPanel({ title, content, onClose }: CanvasPanelProps) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview")

  const extracted = extractCodeFromContent(content)

  const sandpackFiles = useMemo((): SandpackFiles | null => {
    if (!extracted) return null
    const { lang, code } = extracted

    if (lang === "html") {
      return { "/index.html": code } as SandpackFiles
    }

    return {
      "/App.tsx": code,
      "/index.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);`,
      "/public/index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <title>Canvas Preview</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    } as SandpackFiles
  }, [content])

  const customSetup = useMemo(() => {
    if (!extracted || extracted.lang === "html") return undefined
    return {
      dependencies: SANDBOX_DEPENDENCIES,
    }
  }, [extracted?.lang])

  const handleCopy = () => {
    navigator.clipboard.writeText(extracted?.code || content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!extracted || !sandpackFiles) {
    return (
      <div className="w-1/2 min-w-[400px] h-full flex flex-col border-l border-surface-2 bg-surface-0 shadow-lg">
        <div className="h-14 min-h-[56px] border-b border-surface-2 flex items-center justify-between px-4 bg-surface-1">
          <h2 className="text-body font-medium text-ink-primary truncate">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 text-ink-muted hover:text-warn transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-[#F8FAFC]">
          <div className="w-full h-full p-6 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-[13px] font-share text-ink-secondary leading-relaxed">{content}</pre>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-1/2 min-w-[400px] h-full flex flex-col border-l border-surface-2 bg-surface-0 shadow-lg">
      {/* Header */}
      <div className="h-14 min-h-[56px] border-b border-surface-2 flex items-center justify-between px-4 bg-surface-1">
        <h2 className="text-body font-medium text-ink-primary truncate">{title}</h2>

        <div className="flex items-center gap-2">
          <div className="flex bg-surface-2 rounded-control p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              className={
                viewMode === "preview"
                  ? "px-3 py-1 rounded text-caption font-medium transition-colors bg-surface-0 text-signal-400 shadow-sm"
                  : "px-3 py-1 rounded text-caption font-medium transition-colors text-ink-muted hover:text-ink-primary"
              }
            >
              <Play size={14} className="inline mr-1" /> Preview
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={
                viewMode === "code"
                  ? "px-3 py-1 rounded text-caption font-medium transition-colors bg-surface-0 text-signal-400 shadow-sm"
                  : "px-3 py-1 rounded text-caption font-medium transition-colors text-ink-muted hover:text-ink-primary"
              }
            >
              <Code size={14} className="inline mr-1" /> Code
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 text-ink-muted hover:text-ink-primary transition-colors ml-2"
            title="Copy code"
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

      {/* Sandpack content */}
      <div className="flex-1 overflow-hidden">
        <SandpackProvider
          template={extracted.lang === "html" ? "static" : "react-ts"}
          files={sandpackFiles}
          customSetup={customSetup}
          theme={sandpackTheme}
          options={{
            bundlerURL: SANDPACK_BUNDLER_URL,
            externalResources: [],
          }}
        >
          <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
            {viewMode === "preview" ? (
              <SandpackPreview
                style={{ height: "100%" }}
                showOpenInCodeSandbox={false}
                showRefreshButton={false}
              />
            ) : (
              <SandpackCodeEditor
                style={{ height: "100%" }}
                showLineNumbers
                showTabs
                closableTabs
              />
            )}
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  )
}
