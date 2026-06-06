"use client"

import { useRef, type PointerEvent, type ReactNode, type CSSProperties } from "react"

/**
 * SpotlightButton
 * ───────────────
 * A transparent wrapper that tracks pointer position and paints a subtle
 * radial-gradient spotlight under the cursor on hover.
 *
 * Technique: four CSS custom properties (--x, --y, --xp, --yp) are updated
 * on pointermove (same pattern as GlowCard). The spotlight is rendered via
 * a ::before pseudo-element driven by those vars, so there are zero extra
 * DOM nodes and no re-renders on mouse movement.
 *
 * Glow colour: signal hue (oklch 65% 0.1 240) at low opacity so it reads
 * as a whisper of blue, never overpowering the button's own styling.
 */

interface SpotlightButtonProps {
  children: ReactNode
  /** Extra class names forwarded to the wrapper element */
  className?: string
}

export function SpotlightButton({ children, className = "" }: SpotlightButtonProps) {
  const ref = useRef<HTMLSpanElement>(null)

  const handlePointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xp = Math.round((x / rect.width) * 100)
    const yp = Math.round((y / rect.height) * 100)
    el.style.setProperty("--x", `${x}px`)
    el.style.setProperty("--y", `${y}px`)
    el.style.setProperty("--xp", `${xp}%`)
    el.style.setProperty("--yp", `${yp}%`)
  }

  return (
    <span
      ref={ref}
      onPointerMove={handlePointerMove}
      className={`spotlight-button-wrap ${className}`}
      style={
        {
          "--x": "50%",
          "--y": "50%",
          "--xp": "50%",
          "--yp": "50%",
        } as CSSProperties
      }
    >
      {children}
    </span>
  )
}
