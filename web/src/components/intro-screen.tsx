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
      {/* Ambient VS blueprint grid */}
      <div className="absolute inset-0 vs-blueprint-grid pointer-events-none" aria-hidden="true" />

      <div className="relative bg-surface-1 border border-surface-3 rounded-card px-12 py-10 text-center
        shadow-[0_0_40px_rgba(14,165,233,0.06)]">
        <h1 className="text-[2rem] font-sans font-semibold tracking-tight text-ink-primary mb-2">
          {text}
          {!showSubtitle && <span className="caret-blink text-signal-400">_</span>}
        </h1>
        {showSubtitle && (
          <div className="animate-fade-up">
            <p className="text-body font-sans text-ink-secondary">
              A thinking partner, not a yes-machine
            </p>
            <p className="mt-4 font-share text-[0.5625rem] uppercase tracking-[0.22em] text-ink-faint">
              A Vital Signals company
            </p>
            <button
              onClick={e => { e.stopPropagation(); onComplete() }}
              className="btn-signal-primary mt-5 px-4 py-2 rounded-control text-label font-medium font-sans
                transition-all duration-150 ease-expo-out active:scale-[0.97]"
            >
              Enter Artimis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
