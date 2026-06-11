import { X, Copy, Check, Code, Play } from "@phosphor-icons/react"
import { useState, useEffect, useRef } from "react"

interface CanvasPanelProps {
  title: string
  content: string
  onClose: () => void
}

function extractCodeBlocks(content: string) {
  const blocks: { lang: string; code: string }[] = []
  const regex = /```(\w*)\n([\s\S]*?)(?:```|$)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ lang: match[1] || 'text', code: match[2].trim() })
  }
  return blocks
}

function generateIframeShell(lang: string) {
  if (lang === 'html') {
    return `<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-slate-50 p-4">
    <div id="root"></div>
    <script>
      window.addEventListener('message', (event) => {
        if (event.data.type === 'render') {
          document.getElementById('root').innerHTML = event.data.code;
        }
      });
    </script>
  </body>
</html>`
  }
  
  if (lang === 'tsx' || lang === 'jsx' || lang === 'react') {
    return `<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
      /* Hide scrollbars during live typing to prevent jank */
      body { margin: 0; overflow-x: hidden; }
      #root { width: 100%; min-height: 100vh; padding: 1rem; }
    </style>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="root"></div>
    <script>
      let rootInstance = null;
      window.addEventListener('message', (event) => {
        if (event.data.type === 'render') {
          try {
            const code = event.data.code;
            const stripped = code.replace(/import .* from ['"].*['"];?/g, '');
            
            // Compile JSX to JS using Babel
            const compiled = Babel.transform(stripped, { presets: ['react'] }).code;
            
            // Execute in scope
            eval(compiled);
            
            // Find component
            let MainComponent = null;
            if (typeof App !== 'undefined') MainComponent = App;
            else if (typeof Component !== 'undefined') MainComponent = Component;
            else if (typeof Main !== 'undefined') MainComponent = Main;
            
            if (MainComponent) {
              if (!rootInstance) {
                rootInstance = ReactDOM.createRoot(document.getElementById('root'));
              }
              rootInstance.render(React.createElement(MainComponent));
            }
          } catch(e) {
            // Ignore syntax errors during live typing. The last valid frame stays on screen!
          }
        }
      });
    </script>
  </body>
</html>`
  }
  return ''
}

export function CanvasPanel({ title, content, onClose }: CanvasPanelProps) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isIframeReady = useRef(false)

  const codeBlocks = extractCodeBlocks(content)
  const hasRenderableCode = codeBlocks.some(b => ['html', 'tsx', 'jsx', 'react'].includes(b.lang))
  const mainCodeBlock = codeBlocks.find(b => ['html', 'tsx', 'jsx', 'react'].includes(b.lang))

  // 1. Boot up the static iframe shell once
  useEffect(() => {
    if (viewMode === 'preview' && iframeRef.current && mainCodeBlock && !isIframeReady.current) {
      const html = generateIframeShell(mainCodeBlock.lang)
      const blob = new Blob([html], { type: 'text/html' })
      iframeRef.current.src = URL.createObjectURL(blob)
      isIframeReady.current = true
    }
  }, [viewMode, mainCodeBlock?.lang])

  // 2. Post code updates continuously as they stream in
  useEffect(() => {
    if (viewMode === 'preview' && iframeRef.current && mainCodeBlock && isIframeReady.current) {
       // Send the raw code to the iframe via postMessage.
       // The iframe's internal Babel will compile it without refreshing the page!
       iframeRef.current.contentWindow?.postMessage({
         type: 'render',
         code: mainCodeBlock.code
       }, '*')
    }
  }, [content, viewMode, mainCodeBlock?.code])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-1/2 min-w-[400px] h-full flex flex-col border-l border-surface-2 bg-surface-0 shadow-lg">
      {/* Header */}
      <div className="h-14 min-h-[56px] border-b border-surface-2 flex items-center justify-between px-4 bg-surface-1">
        <h2 className="text-body font-medium text-ink-primary truncate">{title}</h2>
        
        <div className="flex items-center gap-2">
          {hasRenderableCode && (
            <div className="flex bg-surface-2 rounded-control p-0.5">
               <button
                  onClick={() => setViewMode('preview')}
                  className={viewMode === 'preview' ? 'px-3 py-1 rounded text-caption font-medium transition-colors bg-surface-0 text-signal-400 shadow-sm' : 'px-3 py-1 rounded text-caption font-medium transition-colors text-ink-muted hover:text-ink-primary'}
               >
                 <Play size={14} className="inline mr-1" /> Preview
               </button>
               <button
                  onClick={() => setViewMode('code')}
                  className={viewMode === 'code' ? 'px-3 py-1 rounded text-caption font-medium transition-colors bg-surface-0 text-signal-400 shadow-sm' : 'px-3 py-1 rounded text-caption font-medium transition-colors text-ink-muted hover:text-ink-primary'}
               >
                 <Code size={14} className="inline mr-1" /> Code
               </button>
            </div>
          )}

          <button
            onClick={handleCopy}
            className="w-8 h-8 flex items-center justify-center rounded-control hover:bg-surface-2 text-ink-muted hover:text-ink-primary transition-colors ml-2"
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
      <div className="flex-1 overflow-hidden relative bg-[#F8FAFC]">
        {viewMode === 'preview' && hasRenderableCode ? (
           <iframe 
             ref={iframeRef} 
             className="w-full h-full border-none bg-white" 
             sandbox="allow-scripts allow-same-origin"
           />
        ) : (
           <div className="w-full h-full p-6 overflow-y-auto bg-surface-0 text-ink-primary font-share text-[13px]">
              <pre className="whitespace-pre-wrap">{content}</pre>
           </div>
        )}
      </div>
    </div>
  )
}