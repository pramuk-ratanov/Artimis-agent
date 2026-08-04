"use client"

import { ArrowClockwise, Database, WarningCircle } from "@phosphor-icons/react"
import type { ReactNode } from "react"

export function PanelShell({
  title,
  description,
  action,
  children,
  width = "wide",
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  width?: "narrow" | "wide" | "full"
}) {
  const widthClass = width === "narrow" ? "max-w-[760px]" : width === "full" ? "max-w-none" : "max-w-[1120px]"
  return (
    <section className="panel-shell" aria-labelledby={`panel-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`panel-shell-inner ${widthClass}`}>
        <header className="panel-header">
          <div className="min-w-0">
            <h1 id={`panel-${title.toLowerCase().replace(/\s+/g, "-")}`} className="panel-title">{title}</h1>
            {description && <p className="panel-description">{description}</p>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </section>
  )
}

export function PanelLoading({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="panel-state" role="status" aria-live="polite" aria-label={label}>
      <div className="w-full max-w-[720px] space-y-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-row" style={{ width: `${100 - (index % 3) * 12}%` }} />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function PanelEmpty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="panel-state" role="status">
      <Database size={24} weight="regular" className="text-ink-muted" aria-hidden="true" />
      <div className="max-w-[48ch] text-center">
        <h2 className="state-title">{title}</h2>
        <p className="state-description">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function PanelError({
  message = "This view could not be loaded.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="panel-state" role="alert">
      <WarningCircle size={24} weight="regular" className="text-error" aria-hidden="true" />
      <div className="max-w-[48ch] text-center">
        <h2 className="state-title">Unable to load data</h2>
        <p className="state-description">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          <ArrowClockwise size={15} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )
}

export function StatusText({ value }: { value: string }) {
  const normalized = value.toLowerCase()
  const tone = normalized === "completed" || normalized === "active" || normalized === "ok"
    ? "status-ok"
    : normalized === "cancelled" || normalized === "failed" || normalized === "error"
      ? "status-error"
      : normalized === "in_progress" || normalized === "running" || normalized === "streaming"
        ? "status-active"
        : "status-neutral"
  return <span className={`status-text ${tone}`}>{value.replaceAll("_", " ")}</span>
}

export function formatTimestamp(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function truncate(value: string, max = 140): string {
  const clean = value.trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function requestError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "The Artimis API did not return a usable response."
}
