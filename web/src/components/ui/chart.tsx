"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

export type ChartConfig = Record<string, {
  label?: React.ReactNode
  icon?: React.ComponentType
  color?: string
}>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a <ChartContainer />")
  return context
}

export function ChartContainer({
  id, className = "", children, config, ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ReactNode
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={`flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground ${className}`}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

export function ChartTooltipContent({
  active, payload, nameKey,
  className = "",
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; dataKey?: string; payload?: Record<string, unknown>; color?: string }>
  hideLabel?: boolean
  nameKey?: string
  labelKey?: string
  className?: string
}) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div className={`border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${className}`}>
      <div className="grid gap-1.5">
        {payload.map((item, i) => {
          const key = nameKey || item.dataKey || item.name || "value"
          const cfg = config[key] || {}
          const color = item.payload?.fill || item.color || "#888"
          return (
            <div key={i} className="flex w-full items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color as string }} />
              <div className="flex flex-1 justify-between leading-none">
                <span className="text-muted-foreground">{cfg.label || item.name || key}</span>
                {item.value !== undefined && (
                  <span className="font-mono font-medium tabular-nums">{item.value.toLocaleString()}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ChartTooltip, useChart }
