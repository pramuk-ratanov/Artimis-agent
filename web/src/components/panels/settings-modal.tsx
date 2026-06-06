"use client"

import { useEffect, useState } from "react"
import { X } from "@phosphor-icons/react"
import * as api from "@/lib/api"
import type { Plugin } from "@/lib/api"

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [model, setModel] = useState("deepseek-v4-pro")

  useEffect(() => {
    if (isOpen) {
      api.getPlugins().then(setPlugins).catch(() => {})
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-surface-1 border border-surface-3 rounded-card w-[480px] max-w-[90vw] max-h-[80vh] overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3">
          <h2 className="text-heading font-semibold text-ink-primary">Settings</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary transition-colors">
            <X size={18} weight="regular" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-5 max-h-[60vh]">
          {/* Model */}
          <div>
            <p className="text-label font-semibold text-ink-secondary mb-2">Model</p>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-control px-3 py-2 text-body
                text-ink-primary font-share outline-none focus:border-signal-500 transition-colors"
            >
              <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
              <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
              <option value="openai/gpt-4o">GPT-4o (OpenRouter)</option>
              <option value="anthropic/claude-sonnet-4">Claude Sonnet 4 (OpenRouter)</option>
            </select>
          </div>

          {/* Plugins */}
          <div>
            <p className="text-label font-semibold text-ink-secondary mb-2">Plugins</p>
            {plugins.length === 0 ? (
              <p className="text-caption text-ink-muted italic">No plugins found.</p>
            ) : (
              <div className="space-y-1.5">
                {plugins.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-surface-2 border border-surface-3
                    rounded-control px-3 py-2">
                    <div>
                      <p className="text-label font-medium text-ink-primary">{p.name}</p>
                      {p.description && (
                        <p className="text-caption text-ink-muted">{p.description}</p>
                      )}
                    </div>
                    <span className={`text-caption font-semibold ${p.installed ? "text-ok" : "text-ink-faint"}`}>
                      {p.installed ? "Installed" : p.available ? "Available" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-3 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-signal-600 text-label font-semibold text-ink-primary rounded-control
              transition-all duration-150 ease-expo-out active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
