"use client"

import { Dashboard } from "@/components/dashboard"
import { ConversationConstellation } from "@/components/panels/conversation-constellation"

export function StatisticsPanel() {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-baseline gap-3">
        <h2 className="text-display font-sans font-semibold tracking-tight text-ink-primary">Statistics</h2>
        <span className="font-share text-caption uppercase tracking-[0.14em] text-ink-muted">
          Live workspace data
        </span>
      </div>

      {/* Artimis dashboard — efferd/dashboard-3 block, catered to real API data */}
      <Dashboard />

      {/* Conversation constellation — node-to-node relevance graph */}
      <ConversationConstellation />
    </div>
  )
}
