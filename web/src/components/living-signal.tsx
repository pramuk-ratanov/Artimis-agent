"use client"

export type SignalState = "idle" | "thinking" | "streaming" | "error"

export function LivingSignal({ state, size = 7 }: { state: SignalState; size?: number }) {
  const colors: Record<SignalState, string> = {
    idle: "var(--color-signal-500)",
    thinking: "var(--color-signal-400)",
    streaming: "var(--color-signal-300)",
    error: "var(--color-error)",
  }
  const anim = state === "thinking" || state === "streaming"
    ? "animate-signal-pulse"
    : state === "idle"
    ? "animate-signal-breath"
    : ""

  return (
    <span
      className={`inline-block rounded-full shrink-0 ${anim}`}
      style={{ width: size, height: size, backgroundColor: colors[state] }}
      role="status"
      aria-label={`AI status: ${state}`}
    />
  )
}
