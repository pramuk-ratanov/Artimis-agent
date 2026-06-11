"use client"

import { useEffect, useState } from "react"
import { Bar, XAxis, YAxis, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell, ComposedChart, Line, Legend } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import * as api from "@/lib/api"
import { ConversationConstellation } from "@/components/panels/conversation-constellation"

type SkillStat = { name: string; value: number }
type FocusStat = { topic: string; sessions: number; messages: number; percentage: number }
type CritiqueTrendPoint = { day: string; avg_score: number; count: number }
type Summary = {
  totalSessions: number; totalMessages: number; totalMemories: number; totalSkills: number
  topSkills: SkillStat[]; focusAreas: FocusStat[]
  critiqueTrend: CritiqueTrendPoint[]
}

const COLORS = ["oklch(65% 0.08 240)", "oklch(60% 0.06 230)", "oklch(68% 0.05 250)", "oklch(55% 0.1 220)", "oklch(62% 0.07 260)"]

function CriticTrendChart({ data }: { data: CritiqueTrendPoint[] }) {
  const WIDTH = 700
  const HEIGHT = 250
  const PAD_LEFT = 40
  const PAD_RIGHT = 20
  const PAD_TOP = 20
  const PAD_BOTTOM = 30
  const CHART_W = WIDTH - PAD_LEFT - PAD_RIGHT
  const CHART_H = HEIGHT - PAD_TOP - PAD_BOTTOM

  const maxScore = 10
  const minScore = 0
  const LINE_COLOR = "oklch(0.58 0.08 230)"
  const GRID_COLOR = "oklch(0.15 0.01 240)"
  const TICK_COLOR = "oklch(0.6 0.01 240)"

  const avgAll = data.reduce((sum, d) => sum + d.avg_score, 0) / data.length

  const xScale = (i: number) => PAD_LEFT + (Math.max(data.length - 1, 1) ? i / Math.max(data.length - 1, 1) : 0) * CHART_W
  const yScale = (score: number) => PAD_TOP + CHART_H - ((score - minScore) / (maxScore - minScore)) * CHART_H

  const pointsStr = data.map((d, i) => `${xScale(i)},${yScale(d.avg_score)}`).join(" ")

  const yTicks = [0, 2, 4, 6, 8, 10]
  const maxLabels = 7
  const step = Math.max(1, Math.ceil(data.length / maxLabels))
  const xLabels: { idx: number; day: string }[] = []
  for (let i = 0; i < data.length; i++) {
    if (i % step === 0 || i === data.length - 1) {
      xLabels.push({ idx: i, day: data[i].day })
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-label text-ink-muted font-share">Average:</span>
        <span className="text-display text-signal-400 font-share">{avgAll.toFixed(1)}</span>
        <span className="text-label text-ink-muted font-share">/ 10</span>
        <span className="tag-pill tag-pill-blue font-share ml-2">{data.length}d</span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
        {/* Grid lines + Y labels */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line x1={PAD_LEFT} y1={yScale(tick)} x2={WIDTH - PAD_RIGHT} y2={yScale(tick)} stroke={GRID_COLOR} strokeWidth="1" />
            <text x={PAD_LEFT - 8} y={yScale(tick) + 4} textAnchor="end" fill={TICK_COLOR} fontSize="10">{tick}</text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={xScale(label.idx)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fill={TICK_COLOR}
            fontSize="9"
          >
            {label.day.slice(5)}
          </text>
        ))}

        {/* Line */}
        {data.length > 1 && (
          <polyline
            points={pointsStr}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Data points */}
        {data.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.avg_score)} r="3" fill={LINE_COLOR} />
        ))}
      </svg>

      <div className="flex justify-between mt-2">
        <span className="text-label text-ink-muted font-share">{data[0]?.day ?? "\u2014"}</span>
        <span className="text-label text-ink-muted font-share">{data[data.length - 1]?.day ?? "\u2014"}</span>
      </div>
    </div>
  )
}

export function StatisticsPanel() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStats().then(s => { setData(s as Summary); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-ink-muted font-share">Loading statistics...</div>
  if (!data) return <div className="p-8 text-ink-muted font-share">No data available yet. Start conversations to build statistics.</div>

  const focusConfig: ChartConfig = {}
  data.focusAreas.forEach((f, i) => { focusConfig[f.topic] = { label: f.topic, color: COLORS[i % COLORS.length] } })

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full font-share">
      <h2 className="text-display font-share tracking-wider text-ink-primary">Statistics</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Sessions", value: data.totalSessions, accent: "text-signal-400" },
          { label: "Messages", value: data.totalMessages, accent: "text-ember-400" },
          { label: "Memories", value: data.totalMemories, accent: "text-signal-400" },
          { label: "Skills", value: data.totalSkills, accent: "text-ember-400" },
        ].map(s => (
          <div key={s.label} className="rounded-card card-hover-lift bg-surface-2 border border-surface-3 p-4 text-center">
            <div className={`text-display font-share ${s.accent}`}>{s.value}</div>
            <div className="text-label text-ink-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Conversation constellation — node-to-node relevance graph */}
      <ConversationConstellation />

      {/* Critique Score Trend */}
      <div>
        <h3 className="text-body font-share text-ink-primary mb-3">Critique Score Trend</h3>
        <div className="rounded-card card-pulse-glow card-hover-lift bg-surface-1 border border-surface-3 p-4">
          {data.critiqueTrend && data.critiqueTrend.length > 0 ? (
            <CriticTrendChart data={data.critiqueTrend} />
          ) : (
            <div className="py-8 text-center text-ink-muted font-share">No data yet</div>
          )}
        </div>
      </div>

      {/* Focus areas bar chart */}
      <div>
        <h3 className="text-body font-share text-ink-primary mb-3">Focus Areas</h3>
        <ChartContainer config={focusConfig} className="h-[280px] w-full">
          <ComposedChart data={data.focusAreas.map(f => ({ name: f.topic, sessions: f.sessions, messages: f.messages }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid vertical={true} strokeDasharray="3 3" stroke="oklch(20% 0.01 240)" />
            <XAxis dataKey="name" tick={{ fill: "oklch(60% 0.01 240)", fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: "oklch(60% 0.01 240)", fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "oklch(60% 0.01 240)", fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: 'oklch(60% 0.01 240)' }} />
            <Bar yAxisId="left" name="Messages (Volume)" dataKey="messages" fill="oklch(28% 0.01 240)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" name="Sessions (Count)" type="monotone" dataKey="sessions" stroke="#ff4a4a" strokeWidth={2} dot={{ stroke: '#ff4a4a', strokeWidth: 2, fill: 'black', r: 4 }} />
          </ComposedChart>
        </ChartContainer>
      </div>

      {/* Skills radar + Pie row */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-body font-share text-ink-primary mb-3">Skill Development</h3>
          <ChartContainer config={{}} className="h-[280px] w-full">
            <RadarChart data={data.topSkills}>
              <PolarGrid stroke="oklch(20% 0.01 240)" />
              <PolarAngleAxis dataKey="name" tick={{ fill: "oklch(60% 0.01 240)", fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: "oklch(40% 0.01 240)", fontSize: 9 }} />
              <Radar dataKey="value" stroke="oklch(65% 0.08 240)" fill="oklch(65% 0.08 240)" fillOpacity={0.2} />
            </RadarChart>
          </ChartContainer>
        </div>

        <div>
          <h3 className="text-body font-share text-ink-primary mb-3">Session Distribution</h3>
          <ChartContainer config={{}} className="h-[280px] w-full">
            <PieChart>
              <Pie
                data={data.focusAreas.map(f => ({ name: f.topic, value: f.percentage }))}
                cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                dataKey="value" nameKey="name"
              >
                {data.focusAreas.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  )
}
