"use client"

import { useEffect, useRef, useState } from "react"
import { BeamEdge } from "@/components/ui/beam-edge"

export type NodeCategory = "conversation" | "skill" | "memory" | "prompt"

export interface GraphNode {
  id: string
  label: string
  category: NodeCategory
  x: number
  y: number
  active?: boolean
  correlatedWith?: string[] // IDs of nodes this one correlates with
}

export interface GraphEdge {
  source: string
  target: string
  active?: boolean // true when both nodes are active/correlated
}

interface NodesGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  onNodeClick?: (node: GraphNode) => void
  className?: string
}

const CATEGORY_SHAPES: Record<NodeCategory, { size: number; shape: "circle" | "diamond" | "square" }> = {
  conversation: { size: 7, shape: "circle" },
  skill: { size: 8, shape: "diamond" },
  memory: { size: 5, shape: "circle" },
  prompt: { size: 6, shape: "square" },
}

function NodeShape({
  node,
  onClick,
}: {
  node: GraphNode
  onClick?: (node: GraphNode) => void
}) {
  const shape = CATEGORY_SHAPES[node.category]
  const baseColor = node.active ? "#0B996E" : "#A3A3A3"
  const glowColor = node.active ? "rgba(11, 153, 110, 0.35)" : "transparent"

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: node.x - shape.size / 2,
    top: node.y - shape.size / 2,
    cursor: "pointer",
    transition: "transform 0.15s ease-out, filter 0.2s ease",
    filter: node.active ? `drop-shadow(0 0 4px ${glowColor})` : "none",
  }

  const handleClick = () => onClick?.(node)

  if (shape.shape === "diamond") {
    return (
      <div
        style={{
          ...commonStyle,
          width: shape.size,
          height: shape.size,
          backgroundColor: baseColor,
          transform: "rotate(45deg)",
          borderRadius: 0,
        }}
        onClick={handleClick}
        title={node.label}
      />
    )
  }

  return (
    <div
      style={{
        ...commonStyle,
        width: shape.size,
        height: shape.size,
        backgroundColor: baseColor,
        borderRadius: shape.shape === "circle" ? "50%" : "0",
      }}
      onClick={handleClick}
      title={node.label}
    />
  )
}

export function NodesGraph({
  nodes,
  edges,
  width = 280,
  height = 240,
  onNodeClick,
  className = "",
}: NodesGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Simple force simulation to position nodes
  const [positions, setPositions] = useState<GraphNode[]>(nodes)

  useEffect(() => {
    // Run a simple force-directed layout
    const simulated = nodes.map((n, i) => ({
      ...n,
      x: n.x || width / 2 + (Math.random() - 0.5) * (width * 0.6),
      y: n.y || 30 + (i / nodes.length) * (height - 60),
    }))

    // Simple repulsion + attraction simulation
    const iterations = 50
    for (let iter = 0; iter < iterations; iter++) {
      const forces = simulated.map(() => ({ dx: 0, dy: 0 }))

      // Repulsion between all nodes
      for (let i = 0; i < simulated.length; i++) {
        for (let j = i + 1; j < simulated.length; j++) {
          const dx = simulated[i].x - simulated[j].x
          const dy = simulated[i].y - simulated[j].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 800 / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          forces[i].dx += fx
          forces[i].dy += fy
          forces[j].dx -= fx
          forces[j].dy -= fy
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const si = simulated.findIndex((n) => n.id === edge.source)
        const ti = simulated.findIndex((n) => n.id === edge.target)
        if (si >= 0 && ti >= 0) {
          const dx = simulated[ti].x - simulated[si].x
          const dy = simulated[ti].y - simulated[si].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = dist * 0.01
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          forces[si].dx += fx
          forces[si].dy += fy
          forces[ti].dx -= fx
          forces[ti].dy -= fy
        }
      }

      // Center gravity
      for (let i = 0; i < simulated.length; i++) {
        forces[i].dx += (width / 2 - simulated[i].x) * 0.01
        forces[i].dy += (height / 2 - simulated[i].y) * 0.01
      }

      // Apply forces with damping
      const damping = 0.5
      for (let i = 0; i < simulated.length; i++) {
        simulated[i] = {
          ...simulated[i],
          x: Math.max(10, Math.min(width - 10, simulated[i].x + forces[i].dx * damping)),
          y: Math.max(20, Math.min(height - 20, simulated[i].y + forces[i].dy * damping)),
        }
      }
    }

    setPositions(simulated)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black ${className}`}
      style={{ width, height }}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const source = positions.find((n) => n.id === edge.source)
        const target = positions.find((n) => n.id === edge.target)
        if (!source || !target) return null

        const isCorrelated =
          edge.active !== false &&
          source.active &&
          target.active &&
          (source.correlatedWith?.includes(target.id) ||
            target.correlatedWith?.includes(source.id))

        return (
          <BeamEdge
            key={`edge-${i}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            active={isCorrelated}
          />
        )
      })}

      {/* Nodes */}
      {positions.map((node) => (
        <div key={node.id}>
          <NodeShape node={node} onClick={onNodeClick} />
          <div
            style={{
              position: "absolute",
              left: node.x,
              top: node.y + 10,
              transform: "translateX(-50%)",
              fontSize: 10,
              fontFamily: "'Geist Mono Variable', monospace",
              color:
                hoveredNode === node.id
                  ? "#1C1917"
                  : node.active
                  ? "#525252"
                  : "#A3A3A3",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              transition: "color 0.15s ease",
              maxWidth: 100,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.label}
          </div>
          {/* Invisible hover target over label */}
          <div
            style={{
              position: "absolute",
              left: node.x - 50,
              top: node.y + 8,
              width: 100,
              height: 18,
              cursor: "pointer",
            }}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => onNodeClick?.(node)}
          />
        </div>
      ))}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 8,
          display: "flex",
          gap: 12,
          fontSize: 9,
          fontFamily: "'Geist Mono Variable', monospace",
          color: "#A3A3A3",
        }}
      >
        <span>o conversation</span>
        <span>◇ skill</span>
        <span>· memory</span>
        <span>□ prompt</span>
      </div>
    </div>
  )
}
