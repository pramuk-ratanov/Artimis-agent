/**
 * ConversationConstellation
 * --------------------------
 * Star-field of conversation nodes. Each session is a node (sized by message
 * count, colored by dominant topic). Edges connect sessions that share
 * significant vocabulary; an emerald pulse sweeps along each edge to visualize
 * node-to-node relevance.
 *
 * Canvas-rendered with a light force-directed layout. No external graph deps.
 */
import { useEffect, useRef, useState } from "react"
import * as api from "@/lib/api"
import type { GraphNode, GraphEdge } from "@/lib/api"

// Topic → emerald-family hexes (peec palette: emerald primary, neutral grey fallback).
const TOPIC_COLOR: Record<string, string> = {
  coding: "#0B996E",   // primary emerald
  ai: "#34B389",       // light emerald
  design: "#5FC7A2",   // pale emerald
  business: "#0A7A59", // deep emerald
  infra: "#8BDABB",    // mint emerald
  general: "#A3A3A3",  // neutral grey
}

const EMBER = "#0B996E" // emerald pulse fallback accent

interface PNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

export function ConversationConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const nodesRef = useRef<PNode[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    api.getConversationGraph()
      .then(g => { setGraph(g); setLoading(false) })
      .catch(() => { setGraph({ nodes: [], edges: [] }); setLoading(false); setError(true) })
  }, [])
  const [error, setError] = useState(false)

  useEffect(() => { hoverRef.current = hover }, [hover])
  useEffect(() => { selectedRef.current = selected }, [selected])

  // Initialize node positions + run a brief force-directed settle, then animate.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const rect = canvas.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const cx = W / 2, cy = H / 2

    // Seed positions on a loose circle
    const pnodes: PNode[] = graph.nodes.map((n, i) => {
      const a = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2
      const r = Math.min(W, H) * 0.32
      return { ...n, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0 }
    })
    nodesRef.current = pnodes
    const byId = new Map(pnodes.map(n => [n.id, n]))

    // Edge lookup for hover-highlight + neighbor set
    const neighbors = new Map<string, Set<string>>()
    graph.edges.forEach(e => {
      if (!neighbors.has(e.source)) neighbors.set(e.source, new Set())
      if (!neighbors.has(e.target)) neighbors.set(e.target, new Set())
      neighbors.get(e.source)!.add(e.target)
      neighbors.get(e.target)!.add(e.source)
    })

    // Mouse → hover detection
    const onMove = (ev: MouseEvent) => {
      const b = canvas.getBoundingClientRect()
      const mx = ev.clientX - b.left, my = ev.clientY - b.top
      let found: string | null = null
      let best = 18
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x - mx, n.y - my)
        if (d < best) { best = d; found = n.id }
      }
      if (found !== hoverRef.current) setHover(found)
    }
    const onLeave = () => setHover(null)
    const onClick = () => {
      if (hoverRef.current) {
        setSelected(prev => prev === hoverRef.current ? null : hoverRef.current)
      } else {
        setSelected(null)
      }
    }
    
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)
    canvas.addEventListener("click", onClick)

    let t = 0
    const start = performance.now()

    const tick = (now: number) => {
      t = (now - start) / 1000

      // Light physics: repulsion between nodes + spring on edges + gentle center pull
      const SETTLE = t < 2.5 ? 1 : 0.04 // settle fast, then near-freeze for calm drift
      for (let i = 0; i < pnodes.length; i++) {
        const a = pnodes[i]
        for (let j = i + 1; j < pnodes.length; j++) {
          const b = pnodes[j]
          let dx = a.x - b.x, dy = a.y - b.y
          let d2 = dx * dx + dy * dy || 1
          const f = (2200 / d2) * SETTLE
          const d = Math.sqrt(d2)
          a.vx += (dx / d) * f; a.vy += (dy / d) * f
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
        }
        // center pull
        a.vx += (cx - a.x) * 0.0015 * SETTLE
        a.vy += (cy - a.y) * 0.0015 * SETTLE
      }
      graph.edges.forEach(e => {
        const a = byId.get(e.source), b = byId.get(e.target)
        if (!a || !b) return
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1
        const target = 120
        const f = (dist - target) * 0.002 * (0.4 + e.weight) * SETTLE
        a.vx += (dx / dist) * f; a.vy += (dy / dist) * f
        b.vx -= (dx / dist) * f; b.vy -= (dy / dist) * f
      })
      pnodes.forEach(n => {
        n.vx *= 0.82; n.vy *= 0.82
        n.x += n.vx; n.y += n.vy
        n.x = Math.max(20, Math.min(W - 20, n.x))
        n.y = Math.max(20, Math.min(H - 20, n.y))
      })

      // ── Render ──
      ctx.clearRect(0, 0, W, H)
      const hv = hoverRef.current
      const sel = selectedRef.current
      const activeNode = sel || hv
      const activeSet = activeNode ? neighbors.get(activeNode) : null

      // Edges + sweeping ember pulse
      graph.edges.forEach((e, idx) => {
        const a = byId.get(e.source), b = byId.get(e.target)
        if (!a || !b) return
        
        const isConnectedToActive = !activeNode || e.source === activeNode || e.target === activeNode
        const dimEdge = activeNode && !isConnectedToActive
        
        // Faint Static Edge (very thin)
        ctx.strokeStyle = "#A3A3A3" // neutral grey edge on light surface
        ctx.globalAlpha = dimEdge ? 0.01 : (0.1 + e.weight * 0.1)
        ctx.lineWidth = 0.4 + e.weight * 0.3 // Ultra thin wires
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.globalAlpha = 1

        // Ember pulse: fast firing neural line
        if (isConnectedToActive) {
          const speed = 0.5 + e.weight * 0.4 // Faster firing
          const pulseLength = 0.4 
          const cycleLength = 2.5 // Creates the pause/delay between fires
          
          const localPhase = (t * speed + (idx * 0.137)) % cycleLength
          
          if (localPhase < 1 + pulseLength) {
            const phase = localPhase
            const pStart = Math.max(0, phase - pulseLength)
            const pEnd = Math.min(1, phase)
            
            if (pStart < pEnd) {
              const x1 = a.x + (b.x - a.x) * pStart
              const y1 = a.y + (b.y - a.y) * pStart
              const x2 = a.x + (b.x - a.x) * pEnd
              const y2 = a.y + (b.y - a.y) * pEnd
              
              // Linear gradient for a smooth ethereal beam (transparent -> core -> transparent)
              const grad = ctx.createLinearGradient(x1, y1, x2, y2)
              grad.addColorStop(0, "transparent")
              grad.addColorStop(0.5, TOPIC_COLOR[a.topic] || EMBER) // Firing inherits source node color
              grad.addColorStop(1, "transparent")
              
              ctx.beginPath()
              ctx.moveTo(x1, y1)
              ctx.lineTo(x2, y2)
              ctx.strokeStyle = grad
              ctx.lineWidth = activeNode ? 1.5 + e.weight : 1.0 + e.weight
              ctx.lineCap = "round"
              
              // Native canvas shadow for neon glow
              ctx.shadowColor = TOPIC_COLOR[a.topic] || EMBER
              ctx.shadowBlur = 8
              ctx.stroke()
              
              ctx.shadowBlur = 0
              ctx.shadowColor = "transparent"
            }
          }
        }
      })

      // Nodes
      pnodes.forEach(n => {
        // Minimalist nodes: small, solid dots
        const r = 1.5 + n.size * 3 // Scaled down drastically for that dense data-viz look
        const isHover = n.id === activeNode
        const isNeighbor = activeSet?.has(n.id)
        const dim = activeNode && !isHover && !isNeighbor
        const color = TOPIC_COLOR[n.topic] || TOPIC_COLOR.general

        // Nodes dim drastically if not part of the focused cluster
        ctx.globalAlpha = dim ? 0.1 : 1
        
        // No massive halo. Just the crisp core circle
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(n.x, n.y, isHover ? r + 1 : r, 0, Math.PI * 2); ctx.fill()
        
        // Subtle stroke/ring for hovered/selected nodes
        if (isHover || (isNeighbor && sel)) {
           ctx.strokeStyle = color
           ctx.lineWidth = 0.5
           ctx.beginPath(); ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2); ctx.stroke()
        }
        
        ctx.globalAlpha = 1
      })

      // Hover label
      if (hv) {
        const n = byId.get(hv)
        if (n) {
          ctx.font = "11px 'Geist Mono Variable', monospace"
          const text = n.label.length > 40 ? n.label.slice(0, 40) + "…" : n.label
          const tw = ctx.measureText(text).width
          
          const countText = String(n.messages || 0)
          // Dynamically scale inner container if count > 2 digits
          const countW = ctx.measureText(countText).width
          const circleRadius = 9
          const innerWidth = Math.max(circleRadius * 2, countW + 8)
          const pillPadding = 6
          const circleMargin = 6
          const totalWidth = pillPadding + innerWidth + circleMargin + tw + pillPadding
          const rh = 24
          
          const lx = Math.min(W - totalWidth - 16, n.x + 16)
          const ly = n.y - rh / 2
          
          // Pill background — white card with neutral hairline, peec tooltip style
          ctx.fillStyle = "#FFFFFF"
          ctx.beginPath()
          ctx.roundRect(lx, ly, totalWidth, rh, rh / 2)
          ctx.fill()
          ctx.strokeStyle = "#A3A3A3"
          ctx.lineWidth = 1
          ctx.stroke()
          
          // Inner colored shape (capsule or circle depending on text length)
          const cx = lx + pillPadding + innerWidth / 2
          const cy = ly + rh / 2
          ctx.fillStyle = TOPIC_COLOR[n.topic] || TOPIC_COLOR.general
          ctx.beginPath()
          ctx.roundRect(lx + pillPadding, cy - circleRadius, innerWidth, circleRadius * 2, circleRadius)
          ctx.fill()
          
          // Count text — white on emerald capsule
          ctx.fillStyle = "#FFFFFF"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(countText, cx, cy)
          
          // Label text
          ctx.textAlign = "left"
          ctx.fillStyle = "#1C1917"
          ctx.fillText(text, lx + pillPadding + innerWidth + circleMargin, cy)
          
          // Reset
          ctx.textBaseline = "alphabetic"
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
    }
  }, [graph])

  return (
    <div className="font-share rounded-card border border-surface-3 bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
        <div>
          <h3 className="text-heading text-ink-primary">Conversation Constellation</h3>
          <p className="text-caption text-ink-muted mt-0.5">
            Nodes are chats · emerald pulses sweep between related conversations
          </p>
        </div>
        <div className="flex items-center gap-3 text-caption text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-signal-400" />
            chats
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded-full bg-signal-400" />
            relevance
          </span>
        </div>
      </div>
      <div className="relative" style={{ height: 420 }}>
        {loading ? (
          <div className="absolute inset-0 grid place-items-center text-caption text-ink-muted">
            mapping conversations...
          </div>
        ) : error ? (
          <div className="absolute inset-0 grid place-items-center text-caption text-error">
            Unable to load conversation graph
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-caption text-ink-muted">
            No conversations yet. Start chatting to grow the constellation
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-full block" />
        )}
      </div>
    </div>
  )
}
