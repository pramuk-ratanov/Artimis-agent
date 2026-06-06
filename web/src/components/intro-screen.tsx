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
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0 cursor-pointer"
      onClick={onComplete}
    >
      <div className="text-center">
        <h1 className="heading-default text-[2rem] font-semibold tracking-tight text-ink-primary mb-2">
          {text}
          {!showSubtitle && <span className="caret-blink text-signal-400">_</span>}
        </h1>
        {showSubtitle && (
          <p className="text-body text-ink-secondary animate-fade-up" style={{ fontFamily: "var(--font-sans)" }}>
            A thinking partner, not a yes-machine
          </p>
        )}
      </div>
    </div>
  )
}
