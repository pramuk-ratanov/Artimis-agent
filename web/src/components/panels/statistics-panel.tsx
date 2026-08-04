"use client"

import { Dashboard } from "@/components/dashboard"
import { ConversationConstellation } from "@/components/panels/conversation-constellation"

export function StatisticsPanel() {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-display font-sans font-semibold tracking-tight text-ink-primary">Statistics</h2>
        <p className="text-body text-ink-secondary mt-1">
          Live workspace data
        </p>
      </div>

      {/* Artimis dashboard — efferd/dashboard-3 block, catered to real API data */}
      <Dashboard />

      {/* Conversation constellation — node-to-node relevance graph */}
      <ConversationConstellation />
    </div>
  )
}
