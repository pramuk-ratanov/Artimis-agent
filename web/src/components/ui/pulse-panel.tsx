"use client"

import { useState, useEffect, useRef } from "react"
import { Brain, Wrench, Lightbulb } from "@phosphor-icons/react"

interface PulsePanelProps {
  isLoading: boolean
}

interface Row {
  icon: React.ReactNode
  states: string[]
  color: string
}

const ROWS: Row[] = [
  {
    icon: <Brain size={11} weight="duotone" />,
    states: ["Reading memories...", "Scanning context...", "Loading skills..."],
    color: "var(--color-signal-400)",
  },
  {
    icon: <Wrench size={11} weight="duotone" />,
    states: ["Checking tools...", "Web search available", "File access ready"],
    color: "var(--color-signal-300)",
  },
  {
    icon: <Lightbulb size={11} weight="duotone" />,
    states: ["Drafting response...", "Running critique...", "Refining output..."],
    color: "var(--color-signal-500)",
  },
]

/** Individual row — cycles through its states and animates a progress bar */
function PulseRow({
  row,
  delayMs,
  active,
}: {
  row: Row
  delayMs: number
  active: boolean
}) {
  const [stateIndex, setStateIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [entered, setEntered] = useState(false)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Staggered entry
  useEffect(() => {
    if (!active) {
      setEntered(false)
      return
    }
    const t = setTimeout(() => setEntered(true), delayMs)
    return () => clearTimeout(t)
  }, [active, delayMs])

  // Progress bar + state cycling while active
  useEffect(() => {
    if (!active) {
      setProgress(0)
      setStateIndex(0)
      return
    }

    let p = 0
    const CYCLE_MS = 1800 + delayMs * 0.5 // stagger cycle speeds slightly

    const tick = () => {
      p += 100 / (CYCLE_MS / 40)
      if (p >= 100) {
        p = 0
        setStateIndex(prev => (prev + 1) % row.states.length)
      }
      setProgress(p)
    }

    progressRef.current = setInterval(tick, 40)
    return () => {
      if (progressRef.current) clearInterval(progressRef.current)
      if (cycleRef.current) clearTimeout(cycleRef.current)
    }
  }, [active, delayMs, row.states.length])

  return (
    <div
      className="flex flex-col gap-0.5"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(5px)",
        transition: `opacity 250ms var(--ease-expo-out), transform 250ms var(--ease-expo-out)`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: row.color, opacity: 0.85 }}>{row.icon}</span>
        <span
          className="text-caption font-share"
          style={{ color: "var(--color-ink-muted)", fontSize: "0.6rem", letterSpacing: "0.03em" }}
        >
          {row.states[stateIndex]}
        </span>
      </div>
      {/* Progress bar */}
      <div
        className="h-px w-full overflow-hidden"
        style={{ background: "var(--color-surface-4)" }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: row.color,
            opacity: 0.6,
            transition: "none",
          }}
        />
      </div>
    </div>
  )
}

/**
 * PulsePanel — floating "what am I doing" panel shown while isLoading is true.
 * Positioned absolute at bottom-left, just above the composer.
 */
export function PulsePanel({ isLoading }: PulsePanelProps) {
  const [visible, setVisible] = useState(false)

  // Appear slightly after isLoading becomes true; disappear instantly on false
  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => setVisible(true), 80)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [isLoading])

  if (!isLoading && !visible) return null

  return (
    <div
      className="absolute left-8 bottom-2 z-20"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: isLoading
          ? "opacity 200ms var(--ease-expo-out), transform 200ms var(--ease-expo-out)"
          : "none",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        className="rounded-card border shadow-lg"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-surface-3)",
          padding: "8px 10px",
          minWidth: "168px",
          maxWidth: "200px",
          boxShadow: "0 4px 16px oklch(0 0 0 / 0.5)",
        }}
      >
        {/* Title row */}
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="animate-signal-pulse inline-block rounded-full shrink-0"
            style={{
              width: 5,
              height: 5,
              background: "var(--color-signal-400)",
            }}
          />
          <span
            className="font-share font-semibold"
            style={{
              color: "var(--color-signal-400)",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Processing...
          </span>
        </div>

        {/* Animated rows */}
        <div className="flex flex-col gap-2">
          {ROWS.map((row, i) => (
            <PulseRow
              key={i}
              row={row}
              delayMs={i * 80}
              active={isLoading}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
