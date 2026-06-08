"use client"

import { useState, useCallback, createContext, useContext, type ReactNode } from "react"

interface ToastItem {
  id: string
  message: string
  type: "success" | "error" | "info"
}

interface ToastContextType {
  toast: (message: string, type?: "success" | "error" | "info") => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in px-4 py-2.5 rounded-control border font-share text-label shadow-lg
              ${t.type === "success" ? "bg-surface-2 border-signal-600 text-signal-400" :
                t.type === "error" ? "bg-surface-2 border-error/50 text-error" :
                "bg-surface-2 border-surface-3 text-ink-secondary"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
