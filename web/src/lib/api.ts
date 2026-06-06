const BASE = ""

export interface Session {
  id: string
  name: string
  mode: "agent" | "chat"
  model?: string
  status: "active" | "archived" | "background"
  created_at: string
  updated_at: string
  message_count?: number
}

export interface Message {
  id: number
  session_id: string
  role: "user" | "assistant" | "tool" | "system"
  content: string
  tool_calls?: ToolCall[]
  created_at: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentResponse {
  response: string
  session_id: string
  tool_calls_made: number
  model_used: string
  intelligence?: unknown
  critique?: unknown
}

export interface Memory {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  use_count: number
  source: "auto" | "manual"
  active: boolean
  created_at: string
}

export interface Task {
  id: string
  session_id?: string
  title: string
  description?: string
  status: "pending" | "in_progress" | "paused" | "completed" | "cancelled"
  phase: "triage" | "research" | "execution" | "review" | "complete"
  phase_data?: Record<string, unknown>
  priority: "low" | "medium" | "high"
  research_gated: boolean
  retry_count: number
  max_retries: number
  last_activity?: string
  created_at: string
  completed_at?: string
}

export interface Note {
  id: string
  session_id?: string
  title: string
  content: string
  version_count: number
  created_at: string
  updated_at: string
}

export interface GalleryItem {
  id: string
  session_id?: string
  prompt: string
  file_path: string
  thumbnail_path?: string
  width?: number
  height?: number
  model?: string
  quality_pass: boolean
  created_at: string
}

export interface Skill {
  id: string
  name: string
  version: number
  content: string
  file_path?: string
  tags: string[]
  use_count: number
  pinned: boolean
  auto_updated: boolean
  active: boolean
}

export interface SkillVersion {
  id: number
  skill_id: string
  version: number
  content: string
  created_at: string
}

export interface CookbookTemplate {
  id: string
  name: string
  description?: string
  prompt: string
  variables: string[]
  tags: string[]
  use_count: number
}

export interface Plugin {
  id: string
  name: string
  description?: string
  version?: string
  installed: boolean
  available: boolean
  capabilities: string[]
  install_path?: string
}

export interface Notification {
  type: string
  task_id?: string
  title: string
  message: string
  timestamp: string
}

export interface DeepResearchResult {
  task: string
  synthesis: string
  confidence: number
  iterations: number
  retrieval_count: number
  gaps: string[]
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  return normalizeResponse(data) as T
}

/** Normalize backend types that come as JSON strings or integers to frontend types */
function normalizeResponse(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(normalizeResponse)
  if (data === null || data === undefined || typeof data !== "object") return data
  const obj = data as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    // Parse JSON-string tags
    if (key === "tags" && typeof val === "string") {
      try { out[key] = JSON.parse(val) } catch { out[key] = [] }
    }
    // Normalize integer booleans
    else if ((key === "pinned" || key === "active" || key === "installed" || key === "available" || key === "auto_updated") && typeof val === "number") {
      out[key] = val === 1
    }
    // Normalize quality_pass
    else if (key === "quality_pass" && typeof val === "number") {
      out[key] = val === 1
    }
    // Normalize research_gated
    else if (key === "research_gated" && typeof val === "number") {
      out[key] = val === 1
    }
    else {
      out[key] = normalizeResponse(val)
    }
  }
  return out
}

// ── Sessions ──

export function getSessions() {
  return fetchJSON<Session[]>("/api/sessions")
}

export function createSession(mode: "agent" | "chat" = "agent", model?: string) {
  return fetchJSON<Session>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ mode, model }),
  })
}

export function getSession(id: string) {
  return fetchJSON<Session>(`/api/sessions/${id}`)
}

export function updateSessionName(id: string, name: string) {
  return fetchJSON<Session>(`/api/sessions/${id}?name=${encodeURIComponent(name)}`, {
    method: "PATCH",
  })
}

export function deleteSession(id: string) {
  return fetchJSON<{ deleted: true }>(`/api/sessions/${id}`, { method: "DELETE" })
}

export function getSessionMessages(id: string, limit = 100, offset = 0) {
  return fetchJSON<Message[]>(`/api/sessions/${id}/messages?limit=${limit}&offset=${offset}`)
}

export function autoNameSession(id: string) {
  return fetchJSON<{ session_id: string; name: string }>(`/api/sessions/${id}/auto-name`, { method: "POST" })
}

// ── Agent ──

export function sendAgentMessage(message: string, sessionId?: string) {
  return fetchJSON<AgentResponse>("/api/agent", {
    method: "POST",
    body: JSON.stringify({ message, session_id: sessionId }),
  })
}

export function deepResearch(task: string, sessionId?: string, maxIterations?: number) {
  return fetchJSON<DeepResearchResult>("/api/deep-research", {
    method: "POST",
    body: JSON.stringify({ task, session_id: sessionId, max_iterations: maxIterations }),
  })
}

// ── Memories ──

export function getMemories(params?: { pinned?: boolean; active?: boolean; tag?: string; search?: string }) {
  const qs = new URLSearchParams()
  if (params?.pinned !== undefined) qs.set("pinned", String(params.pinned))
  if (params?.active !== undefined) qs.set("active", String(params.active))
  if (params?.tag) qs.set("tag", params.tag)
  if (params?.search) qs.set("search", params.search)
  const q = qs.toString()
  return fetchJSON<Memory[]>(`/api/memories${q ? "?" + q : ""}`)
}

export function getActiveMemories() {
  return fetchJSON<Memory[]>("/api/memories/active")
}

export function createMemory(content: string, tags?: string[], source: "auto" | "manual" = "manual") {
  return fetchJSON<Memory>("/api/memories", {
    method: "POST",
    body: JSON.stringify({ content, tags, source }),
  })
}

export function updateMemory(id: string, data: { content?: string; tags?: string[]; pinned?: boolean }) {
  return fetchJSON<Memory>(`/api/memories/${id}`, { method: "PATCH", body: JSON.stringify(data) })
}

export function deleteMemory(id: string) {
  return fetchJSON<{ deleted: true }>(`/api/memories/${id}`, { method: "DELETE" })
}

export function toggleMemoryPin(id: string) {
  return fetchJSON<Memory>(`/api/memories/${id}/pin`, { method: "POST" })
}

// ── Tasks ──

export function getTasks(status?: string) {
  const qs = status ? `?status=${status}` : ""
  return fetchJSON<Task[]>(`/api/tasks${qs}`)
}

export function createTask(data: { title: string; description?: string; session_id?: string; priority?: string }) {
  return fetchJSON<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) })
}

export function submitTask(data: { title: string; description?: string; session_id?: string; priority?: string; run_immediately?: boolean }) {
  return fetchJSON<Task>("/api/tasks/submit", { method: "POST", body: JSON.stringify(data) })
}

export function executeTask(id: string) {
  return fetchJSON<{ task_id: string; status: string }>(`/api/tasks/${id}/execute`, { method: "POST" })
}

export function cancelTask(id: string) {
  return fetchJSON<{ task_id: string; status: string }>(`/api/tasks/${id}/cancel`, { method: "POST" })
}

export function getStaleTasks(hours = 48) {
  return fetchJSON<Task[]>(`/api/tasks/stale?hours=${hours}`)
}

export function getRunningTasks() {
  return fetchJSON<{ task_id: string; started_at: string; status: string }[]>("/api/tasks/running")
}

export function getSilenceReport(hours = 48) {
  return fetchJSON<{ report: string }>(`/api/tasks/silence-report?hours=${hours}`)
}

export function getTask(id: string) {
  return fetchJSON<Task>(`/api/tasks/${id}`)
}

export function updateTask(id: string, status?: string, phase?: string) {
  const qs = new URLSearchParams()
  if (status) qs.set("status", status)
  if (phase) qs.set("phase", phase)
  return fetchJSON<Task>(`/api/tasks/${id}?${qs.toString()}`, { method: "PATCH" })
}

// ── Notes ──

export function getNotes(sessionId?: string) {
  const qs = sessionId ? `?session_id=${sessionId}` : ""
  return fetchJSON<Note[]>(`/api/notes${qs}`)
}

export function createNote(data: { title: string; content?: string; session_id?: string }) {
  return fetchJSON<Note>("/api/notes", { method: "POST", body: JSON.stringify(data) })
}

export function getNote(id: string) {
  return fetchJSON<Note>(`/api/notes/${id}`)
}

export function updateNote(id: string, data: { title?: string; content?: string }) {
  return fetchJSON<Note>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) })
}

export function deleteNote(id: string) {
  return fetchJSON<{ deleted: true }>(`/api/notes/${id}`, { method: "DELETE" })
}

// ── Gallery ──

export function getGallery(limit = 50, offset = 0) {
  return fetchJSON<GalleryItem[]>(`/api/gallery?limit=${limit}&offset=${offset}`)
}

export function deleteGalleryItem(id: string) {
  return fetchJSON<{ deleted: true }>(`/api/gallery/${id}`, { method: "DELETE" })
}

// ── Skills ──

export function getSkills(tag?: string, search?: string) {
  const qs = new URLSearchParams()
  if (tag) qs.set("tag", tag)
  if (search) qs.set("search", search)
  const q = qs.toString()
  return fetchJSON<Skill[]>(`/api/skills${q ? "?" + q : ""}`)
}

export function getRelevantSkills(q: string) {
  return fetchJSON<Skill[]>(`/api/skills/relevant?q=${encodeURIComponent(q)}`)
}

export function createSkill(data: { name: string; content: string; tags?: string[] }) {
  return fetchJSON<Skill>("/api/skills", { method: "POST", body: JSON.stringify(data) })
}

export function getSkill(id: string) {
  return fetchJSON<Skill>(`/api/skills/${id}`)
}

export function updateSkill(id: string, content: string) {
  return fetchJSON<Skill>(`/api/skills/${id}`, { method: "PATCH", body: JSON.stringify({ content }) })
}

export function toggleSkillPin(id: string) {
  return fetchJSON<{ id: string; pinned: boolean }>(`/api/skills/${id}/pin`, { method: "POST" })
}

export function getSkillVersions(id: string) {
  return fetchJSON<SkillVersion[]>(`/api/skills/${id}/versions`)
}

export function rollbackSkill(id: string, version: number) {
  return fetchJSON<Skill>(`/api/skills/${id}/rollback?version=${version}`, { method: "POST" })
}

// ── Cookbook ──

export function getCookbookTemplates(tag?: string, search?: string) {
  const qs = new URLSearchParams()
  if (tag) qs.set("tag", tag)
  if (search) qs.set("search", search)
  const q = qs.toString()
  return fetchJSON<CookbookTemplate[]>(`/api/cookbook/templates${q ? "?" + q : ""}`)
}

export function createCookbookTemplate(data: { name: string; prompt: string; description?: string; variables?: string[]; tags?: string[] }) {
  return fetchJSON<CookbookTemplate>("/api/cookbook/templates", { method: "POST", body: JSON.stringify(data) })
}

export function useCookbookTemplate(id: string) {
  return fetchJSON<{ used: true }>(`/api/cookbook/templates/${id}/use`, { method: "POST" })
}

// ── Plugins ──

export function getPlugins(installedOnly = false) {
  return fetchJSON<Plugin[]>(`/api/plugins?installed_only=${installedOnly}`)
}

export function suggestPlugins(q: string) {
  return fetchJSON<unknown>(`/api/plugins/suggest?q=${encodeURIComponent(q)}`)
}

export function installPlugin(name: string) {
  return fetchJSON<{ installed: boolean; name: string; install_command: string }>(`/api/plugins/${name}/install`, { method: "POST" })
}

// ── Notifications ──

export function getNotifications() {
  return fetchJSON<Notification[]>("/api/notifications")
}

// ── Health ──

export function healthCheck() {
  return fetchJSON<{ status: string; version: string }>("/api/health")
}

// ── Config ──

export interface Config {
  model: string
  keys: {
    DEEPSEEK_API_KEY: string
    OPENAI_API_KEY: string
    OPENROUTER_API_KEY: string
    ANTHROPIC_API_KEY: string
  }
}

export interface ConfigUpdate {
  model?: string
  DEEPSEEK_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

export function getConfig() {
  return fetchJSON<Config>("/api/config")
}

export function saveConfig(data: ConfigUpdate) {
  return fetchJSON<Config>("/api/config", {
    method: "POST",
    body: JSON.stringify(data),
  })
}
