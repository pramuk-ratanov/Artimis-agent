"use client"

import { useEffect, useState } from "react"
import { X, Eye, EyeSlash } from "@phosphor-icons/react"
import * as api from "@/lib/api"
import type { ConfigUpdate } from "@/lib/api"

// ── Model catalogue ──────────────────────────────────────────────────────────

const MODEL_GROUPS = [
  {
    label: "DeepSeek",
    options: [
      { value: "deepseek-v4-pro",   label: "deepseek-v4-pro" },
      { value: "deepseek-v4-flash",  label: "deepseek-v4-flash" },
    ],
  },
  {
    label: "OpenAI",
    options: [
      { value: "gpt-4o",      label: "gpt-4o" },
      { value: "gpt-4o-mini", label: "gpt-4o-mini" },
      { value: "gpt-5.5",     label: "gpt-5.5" },
    ],
  },
  {
    label: "OpenRouter",
    options: [
      { value: "openai/gpt-5.5-pro",          label: "openai/gpt-5.5-pro" },
      { value: "anthropic/claude-sonnet-4",    label: "anthropic/claude-sonnet-4" },
      { value: "anthropic/claude-opus-4",      label: "anthropic/claude-opus-4" },
    ],
  },
] as const

// ── Key field descriptor ─────────────────────────────────────────────────────

type KeyField = {
  id: keyof Pick<ConfigUpdate, "DEEPSEEK_API_KEY" | "OPENAI_API_KEY" | "OPENROUTER_API_KEY" | "ANTHROPIC_API_KEY">
  label: string
}

const KEY_FIELDS: KeyField[] = [
  { id: "DEEPSEEK_API_KEY",   label: "DeepSeek API Key" },
  { id: "OPENAI_API_KEY",     label: "OpenAI API Key" },
  { id: "OPENROUTER_API_KEY", label: "OpenRouter API Key" },
  { id: "ANTHROPIC_API_KEY",  label: "Anthropic API Key" },
]

// ── Component ────────────────────────────────────────────────────────────────

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [model, setModel]       = useState("deepseek-v4-pro")
  const [keys, setKeys]         = useState<Record<string, string>>({})
  const [masked, setMasked]     = useState<Record<string, string>>({})
  const [visible, setVisible]   = useState<Record<string, boolean>>({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Load config when modal opens
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSaved(false)
    api.getConfig()
      .then(cfg => {
        setModel(cfg.model ?? "deepseek-v4-pro")
        setMasked({
          DEEPSEEK_API_KEY:   cfg.keys?.DEEPSEEK_API_KEY   ?? "",
          OPENAI_API_KEY:     cfg.keys?.OPENAI_API_KEY     ?? "",
          OPENROUTER_API_KEY: cfg.keys?.OPENROUTER_API_KEY ?? "",
          ANTHROPIC_API_KEY:  cfg.keys?.ANTHROPIC_API_KEY  ?? "",
        })
        // Reset user-typed values on fresh open
        setKeys({})
        setVisible({})
      })
      .catch(() => {
        // Non-fatal – modal still usable without pre-fill
      })
  }, [isOpen])

  if (!isOpen) return null

  // ── Handlers ──

  function handleKeyChange(id: string, value: string) {
    setKeys(prev => ({ ...prev, [id]: value }))
  }

  function toggleVisible(id: string) {
    setVisible(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload: ConfigUpdate = { model }
      for (const field of KEY_FIELDS) {
        const val = keys[field.id]?.trim()
        if (val) payload[field.id] = val
      }
      await api.saveConfig(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-surface-3 rounded-card w-[500px] max-w-[92vw] max-h-[88vh]
          overflow-hidden font-share flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 shrink-0">
          <h2 className="text-heading font-semibold text-ink-primary tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink-secondary transition-colors"
            aria-label="Close settings"
          >
            <X size={18} weight="regular" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto p-5 space-y-7 flex-1">

          {/* ── Section 1: Model ── */}
          <section>
            <p className="text-label font-semibold text-signal-400 uppercase tracking-widest mb-3">
              Model
            </p>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-control px-3 py-2
                text-body text-ink-primary font-share outline-none
                focus:border-signal-400 transition-colors appearance-none cursor-pointer"
            >
              {MODEL_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </section>

          {/* ── Divider ── */}
          <div className="border-t border-surface-3" />

          {/* ── Section 2: API Keys ── */}
          <section>
            <p className="text-label font-semibold text-signal-400 uppercase tracking-widest mb-1">
              API Keys
            </p>
            <p className="text-caption text-ink-muted mb-4">
              Leave any field blank to keep the existing key.
            </p>

            <div className="space-y-4">
              {KEY_FIELDS.map(field => {
                const isVisible = !!visible[field.id]
                const inputType = isVisible ? "text" : "password"
                const placeholder = masked[field.id] ? masked[field.id] : "Not set"

                return (
                  <div key={field.id}>
                    <label
                      htmlFor={`key-${field.id}`}
                      className="block text-label font-medium text-ink-secondary mb-1.5"
                    >
                      {field.label}
                    </label>
                    <div className="relative">
                      <input
                        id={`key-${field.id}`}
                        type={inputType}
                        value={keys[field.id] ?? ""}
                        onChange={e => handleKeyChange(field.id, e.target.value)}
                        placeholder={placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full bg-surface-2 border border-surface-3 rounded-control
                          px-3 py-2 pr-10 text-body text-ink-primary font-share
                          placeholder:text-ink-faint outline-none
                          focus:border-signal-400 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => toggleVisible(field.id)}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                          text-ink-muted hover:text-signal-400 transition-colors"
                        aria-label={isVisible ? "Hide key" : "Show key"}
                        tabIndex={-1}
                      >
                        {isVisible
                          ? <EyeSlash size={15} weight="regular" />
                          : <Eye      size={15} weight="regular" />
                        }
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-surface-3 px-5 py-3 flex items-center justify-between shrink-0">
          {/* Status feedback */}
          <div className="text-caption font-share min-w-0">
            {saved  && <span className="text-ok font-semibold">✓ Saved</span>}
            {error  && <span className="text-error truncate">{error}</span>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-label font-medium text-ink-muted font-sans
                rounded-control transition-colors duration-120 hover:text-ink-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-surface-2 text-label font-medium text-ink-primary font-sans
                rounded-control transition-all duration-120 ease-expo-out
                hover:bg-surface-3 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
