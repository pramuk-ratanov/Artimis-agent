"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import * as api from "@/lib/api"

type SkillStat = { name: string; value: number }
type FocusStat = { topic: string; sessions: number; messages: number; percentage: number }
type Summary = { totalSessions: number; totalMessages: number; totalMemories: number; totalSkills: number; topSkills: SkillStat[]; focusAreas: FocusStat[] }

const COLORS = ["oklch(65% 0.08 240)", "oklch(60% 0.06 230)", "oklch(68% 0.05 250)", "oklch(55% 0.1 220)", "oklch(62% 0.07 260)"]

export function StatisticsPanel() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStats().then(s => { setData(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-ink-muted font-sans">Loading statistics...</div>
  if (!data) return <div className="p-8 text-ink-muted font-sans">No data available yet. Start conversations to build statistics.</div>

  const focusConfig: ChartConfig = {}
  data.focusAreas.forEach((f, i) => { focusConfig[f.topic] = { label: f.topic, color: COLORS[i % COLORS.length] } })

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full font-sans">
      <h2 className="text-display font-share tracking-wider text-ink-primary">Statistics</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Sessions", value: data.totalSessions },
          { label: "Messages", value: data.totalMessages },
          { label: "Memories", value: data.totalMemories },
          { label: "Skills", value: data.totalSkills },
        ].map(s => (
          <div key={s.label} className="rounded-card bg-surface-2 border border-surface-3 p-4 text-center">
            <div className="text-display font-share text-signal-400">{s.value}</div>
            <div className="text-label text-ink-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Focus areas bar chart */}
      <div>
        <h3 className="text-body font-share text-ink-primary mb-3">Focus Areas</h3>
        <ChartContainer config={focusConfig} className="h-[280px] w-full">
          <BarChart data={data.focusAreas.map(f => ({ name: f.topic, sessions: f.sessions, messages: f.messages }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(20% 0.01 240)" />
            <XAxis dataKey="name" tick={{ fill: "oklch(60% 0.01 240)", fontSize: 11 }} />
            <YAxis tick={{ fill: "oklch(60% 0.01 240)", fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="sessions" fill="oklch(65% 0.08 240)" radius={[4, 4, 0, 0]} />
          </BarChart>
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
