"use client"

import { useState, useEffect } from "react"

export function IntroScreen({ onComplete }: { onComplete: () => void }) {
  const [text, setText] = useState("")
  const [showSubtitle, setShowSubtitle] = useState(false)
  const [exit, setExit] = useState(false)

  useEffect(() => {
    const word = "Artimis"
    let i = 0
    const timer = setInterval(() => {
      if (i >= word.length) {
        clearInterval(timer)
        setTimeout(() => setShowSubtitle(true), 300)
        return
      }
      setText(word.slice(0, i + 1))
      i++
    }, 120)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (showSubtitle) {
      const t = setTimeout(() => {
        setExit(true)
        setTimeout(onComplete, 500)
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [showSubtitle, onComplete])

  if (exit) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0 cursor-pointer font-sans"
      onClick={onComplete}
    >
      <div className="bg-surface-1 border border-surface-3 rounded-card px-12 py-10 text-center">
        <h1 className="text-[2rem] font-sans font-semibold tracking-tight text-ink-primary mb-2">
          {text}
          {!showSubtitle && <span className="caret-blink text-signal-400">_</span>}
        </h1>
        {showSubtitle && (
          <div className="animate-fade-up">
            <p className="text-body font-sans text-ink-secondary">
              A thinking partner, not a yes-machine
            </p>
            <button
              onClick={e => { e.stopPropagation(); onComplete() }}
              className="mt-6 px-4 py-2 rounded-control bg-ink-primary text-white text-label font-medium font-sans
                hover:opacity-90 transition-opacity duration-150"
            >
              Enter Artimis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
