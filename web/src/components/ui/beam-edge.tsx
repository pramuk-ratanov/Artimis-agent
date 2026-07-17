"use client"

import { useMemo } from "react"

interface BeamEdgeProps {
  x1: number
  y1: number
  x2: number
  y2: number
  active?: boolean
  pulseSpeed?: number
  className?: string
}

export function BeamEdge({
  x1,
  y1,
  x2,
  y2,
  active = false,
  pulseSpeed = 2,
  className = "",
}: BeamEdgeProps) {
  const gradientId = useMemo(
    () => `beam-${Math.random().toString(36).slice(2, 8)}`,
    []
  )

  const dx = x2 - x1
  const dy = y2 - y1
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)

  return (
    <svg
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        {active && (
          <linearGradient
            id={gradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
            gradientTransform={`rotate(${angle})`}
          >
            <stop offset="0%" stopColor="transparent">
              <animate
                attributeName="offset"
                values="-0.5;2"
                dur={`${pulseSpeed}s`}
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="15%" stopColor="rgba(11, 153, 110, 0)" />
            <stop offset="40%" stopColor="rgba(11, 153, 110, 0.35)" />
            <stop offset="50%" stopColor="rgba(11, 153, 110, 0.5)" />
            <stop offset="60%" stopColor="rgba(11, 153, 110, 0.35)" />
            <stop offset="85%" stopColor="rgba(11, 153, 110, 0)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        )}
      </defs>

      {/* Base edge */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={active ? "transparent" : "#D6D3D1"}
        strokeWidth={1}
      />

      {/* Active beam pulse */}
      {active && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${gradientId})`}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
