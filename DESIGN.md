# ARTIMIS — Complete Frontend Design Brief

> **Handoff document.** Feed this to an AI agent designer. Self-contained. Non-negotiable: not generic. Every decision traces to the actual backend.

---

## 0. What Artimis Is

A local-first AI agent workspace. Combines a persistent agent loop (like Hermes) with a rich workspace UI (like Odysseus). Runs on a laptop, one command to install, zero external services, SQLite only.

**Personality:** A thinking partner, not a yes-machine. Precise, quietly confident, a little warm. Never cute, never corporate-bland, never a cold terminal.

**Brand lineage:** Sub-brand of Vital Signals. Inherits charcoal + sky-blue signal DNA. Sky-blue is a signal, not decoration.

**The user:** A power-operator. Multiple businesses (freight-forwarding logistics marketing + web studio). Values systematic frameworks and practical outcomes. Uses the agent to think, not just execute.

---

## 1. Backend Architecture (What You're Building Against)

### 1.1 Server

```
FastAPI + Uvicorn
Port: 7001
No auth (local-first, single-user)
Serves static React build from web/dist/ at root
CORS: wide open (localhost)
```

### 1.2 Database (SQLite, WAL mode, `~/.artimis/artimis.db`)

11 tables. All IDs are UUID4 strings. Foreign keys with CASCADE/SET NULL.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `sessions` | Chat/agent sessions | id, name, mode (agent/chat), model, status (active/archived/background), created_at, updated_at |
| `messages` | Conversation turns | id (auto), session_id (FK), role (user/assistant/tool/system), content, tool_calls (JSON), created_at |
| `memories` | Persistent memory | id, content, tags (JSON), pinned (0/1), use_count, source (auto/manual), active (0/1), created_at |
| `skills` | Procedural knowledge | id, name, version, content, file_path, tags (JSON), use_count, pinned (0/1), auto_updated (0/1), active (0/1) |
| `skill_versions` | Skill history for rollback | id (auto), skill_id (FK), version, content, created_at |
| `tasks` | Background task execution | id, session_id (FK), title, description, status (pending/in_progress/paused/completed/cancelled), phase (triage/research/execution/review/complete), phase_data (JSON), priority (low/medium/high), research_gated, retry_count, max_retries, last_activity |
| `notes` | Documents | id, session_id (FK), title, content, version_count |
| `gallery` | Generated images | id, session_id (FK), prompt, file_path, thumbnail_path, width, height, model, quality_pass (0/1) |
| `cookbook_templates` | Prompt templates | id, name, description, prompt, variables (JSON), tags (JSON), use_count |
| `plugins` | Plugin registry | id, name, description, version, installed (0/1), available (0/1), capabilities (JSON), install_path |
| `user_patterns` | Behavior analytics | id (auto), pattern_type, pattern_data (JSON), detected_at |

### 1.3 Agent Engine

**Agent loop** (`artimis/engine/agent.py` — `run_agent()`):

```
1. Select provider (DeepSeek → OpenAI → Anthropic fallback)
2. Load system prompt
3. Inject brain context (relevant memories + skills → scored, sorted, appended to system prompt)
4. Build conversation (system + history + user message)
5. Loop (max 10 iterations):
   a. LLM call with 5 tool schemas, tool_choice="auto", temp=0.7
   b. If tool calls → execute tools (web_search, read_file, write_file, memory_search, memory_save) → append results → continue
   c. If final response → run intelligence pipeline → return
6. Intelligence pipeline (three tiers):
   T1: Format check (rule-based, every message — table/list/code/JSON/email/short-answer validators)
   T2: Drift detection (LLM, every 3rd message — topic shift/contradiction/goal change/repetition)
   T3: Self-critique (LLM, final output — scores 1-10, classifies critical/major/minor issues)
7. Auto-name session from first exchange (LLM)
```

**5 tools available to the agent:**
| Tool | What it does |
|------|-------------|
| `web_search` | DuckDuckGo Lite scraping, 5 results max |
| `read_file` | Local filesystem read, 5000 char cap |
| `write_file` | Create files with parent directories |
| `memory_search` | DB search across memories (keyword) |
| `memory_save` | Save a memory with optional tags |

**Background tasks** (`artimis/engine/task_runner.py`):
- Multi-phase pipeline: triage → research → execution → review → complete
- Each phase saves intermediate results to `phase_data` (JSON column)
- Background execution via daemon threads
- Silence detection (tasks idle >48h flagged)
- Pause/resume across restarts

**Notifications** (`artimis/engine/notifications.py`):
- Polling-based (30s interval)
- Checks: task completions, stale tasks, silence
- Webhook dispatch (HTTP POST, 5s timeout)
- `GET /api/notifications` returns latest 20

**Brain** (`artimis/engine/brain.py`):
- Memory relevance: exact phrase (+0.4), word overlap (+0.3 proportional), pinned (+0.2), use count (+0.01/use max 0.1), recency (+0.1 linear decay over 7 days)
- Identity triggers ("who am i") pull all identity/fact/preference/project memories
- Active tracking: memories in context get `active=1` → UI renders with highlight
- Auto-memory creation: 5 regex patterns for identity/fact/preference/project/explicit commands
- Skills: versioned, rollback, pin-to-lock, keyword-matched for relevance

### 1.4 Critical Backend Gaps the Frontend Must Handle

- **No SSE/streaming.** `StreamingResponse` is imported but never used. Agent responses come as complete JSON AFTER the full agent loop finishes. For "streaming feel" in UI, the frontend must simulate it.
- **No auth.** No login screen needed. Skip it.
- **No WebSocket.** All real-time is polling-based.
- **Agent is synchronous.** `POST /api/agent` blocks until done (can be slow — 5-60 seconds for complex queries). Frontend must show meaningful loading/thinking states.
- **Tasks run in background threads.** No push notification when a task completes. Frontend must poll `GET /api/notifications` periodically.
- **Deep Research is also synchronous.** `POST /api/deep-research` blocks until the full pipeline completes (can be 60-180 seconds).

---

## 2. Complete API Surface

Every endpoint the frontend needs. Request/response shapes are real.

### 2.1 Sessions

```
GET    /api/sessions                              → [{id, name, mode, model, status, created_at, updated_at, message_count?, ...}]
POST   /api/sessions           {mode, model?}     → {id, name, mode, ...}
GET    /api/sessions/{id}                         → {session} | 404
PATCH  /api/sessions/{id}      ?name=string       → {session}
DELETE /api/sessions/{id}                         → {deleted: true}
GET    /api/sessions/{id}/messages  ?limit=100&offset=0  → [{id, role, content, tool_calls, created_at}]
POST   /api/sessions/{id}/messages  {content}     → {session_id, role:"assistant", content, tool_calls_made, iterations, model_used}
POST   /api/sessions/{id}/auto-name               → {session_id, name}
GET    /api/sessions/{id}/orientation  ?q=string  → {orientation: string}
```

### 2.2 Agent

```
POST   /api/agent              {message, session_id?}  → {response, session_id, tool_calls_made, model_used, intelligence?, critique?}
POST   /api/deep-research      {task, session_id?, max_iterations?}  → {task, synthesis, confidence, iterations, retrieval_count, gaps}
```

### 2.3 Memories

```
GET    /api/memories           ?pinned=&active=&tag=&search=  → [{id, content, tags, pinned, use_count, source, active, created_at}]
GET    /api/memories/active                                   → [{memory}]  (active=1 only)
POST   /api/memories           {content, tags?, source?}      → {memory}
PATCH  /api/memories/{id}      {content?, tags?, pinned?}     → {memory} | 404
DELETE /api/memories/{id}                                     → {deleted: true}
POST   /api/memories/{id}/pin                                 → toggle, returns {memory}
```

### 2.4 Tasks

```
GET    /api/tasks               ?status=                        → [{id, title, description, status, phase, priority, session_id, phase_data, ...}]
POST   /api/tasks               {title, description?, session_id?, priority?}  → {task}
POST   /api/tasks/submit        {title, description?, session_id?, priority?, run_immediately?}  → {task}
POST   /api/tasks/{id}/execute                                                → {task_id, status:"running"}
POST   /api/tasks/{id}/cancel                                                 → {task_id, status:"cancelled"}
GET    /api/tasks/stale         ?hours=48                                     → [{task}]
GET    /api/tasks/running                                                      → [{task_id, started_at, status}]
GET    /api/tasks/silence-report  ?hours=48                                   → {report: string}
GET    /api/tasks/{id}                                                         → {task} | 404
PATCH  /api/tasks/{id}          ?status=&phase=                               → {task}
```

### 2.5 Notes

```
GET    /api/notes               ?session_id=      → [{id, title, content, session_id, version_count, created_at}]
POST   /api/notes               {title, content?, session_id?}  → {note}
GET    /api/notes/{id}                                           → {note} | 404
PATCH  /api/notes/{id}          {title?, content?}               → {note}
DELETE /api/notes/{id}                                           → {deleted: true}
```

### 2.6 Gallery

```
GET    /api/gallery             ?limit=50&offset=0  → [{id, prompt, file_path, thumbnail_path, width, height, model, quality_pass, created_at}]
DELETE /api/gallery/{id}                            → {deleted: true}
```

### 2.7 Skills

```
GET    /api/skills              ?tag=&search=      → [{id, name, version, content, tags, use_count, pinned, active, ...}]
GET    /api/skills/relevant     ?q=                → [{skill}]
POST   /api/skills              {name, content, tags?}  → {skill}
GET    /api/skills/{id}                              → {skill} | 404
PATCH  /api/skills/{id}         {content}            → {skill}
POST   /api/skills/{id}/pin                          → toggle, {id, pinned: bool}
GET    /api/skills/{id}/versions                     → [{skill_version}]
POST   /api/skills/{id}/rollback  ?version=int       → {skill}
```

### 2.8 Cookbook

```
GET    /api/cookbook/templates                    ?tag=&search=  → [{id, name, prompt, description, variables, tags, use_count}]
POST   /api/cookbook/templates                    {name, prompt, description?, variables?, tags?}  → {template}
POST   /api/cookbook/templates/{id}/use                                       → {used: true}
```

### 2.9 Plugins

```
GET    /api/plugins             ?installed_only=false  → [{id, name, description, version, installed, available, capabilities}]
GET    /api/plugins/suggest     ?q=                    → suggestion result
POST   /api/plugins/{name}/install                     → {installed, name, install_command}
```

### 2.10 Models

```
GET    /api/models/hardware                           → hardware detection data
GET    /api/models/recommend                          → model recommendations
GET    /api/models/installed                          → {ollama_installed, models}
POST   /api/models/download     {model_name, method?} → download result
```

### 2.11 Notifications

```
GET    /api/notifications                             → [{type, task_id, title, message, timestamp}]
POST   /api/notifications/webhooks  {url}             → {webhooks: "registered"}
DELETE /api/notifications/webhooks  {url}             → {webhooks: "removed"}
```

### 2.12 Health

```
GET    /api/health                                    → {status: "ok", version: "0.1.0"}
```

---

## 3. Design System

### 3.1 Design Authority: Impeccable (pbakaus/impeccable)

This design system follows the Impeccable skill. Every rule below traces to its references. The skill's absolute bans are non-negotiable.

### 3.2 Register: Product UI

Artimis is a **product interface** — an AI workspace. Not a marketing page. Not a brand surface. The product register rules apply:

- One font family is often right. System fonts permitted.
- Fixed rem scale, not fluid clamp.
- Tighter scale ratio (1.125-1.2).
- Restrained color by default.
- Accent for primary actions, selection, state indicators only.
- Motion conveys state, not decoration. 150-250ms on most transitions.
- No orchestrated page-load sequences.
- Standard navigation patterns expected.
- Density is legitimate.

### 3.3 Color Tokens (OKLCH)

```
Signal (sky-blue — the ONLY accent, ~10% of surface):
  signal-200:  oklch(0.85 0.05 240)
  signal-300:  oklch(0.75 0.08 240)
  signal-400:  oklch(0.65 0.10 240)  ← primary interactive accent
  signal-500:  oklch(0.55 0.12 240)  ← default signal
  signal-600:  oklch(0.45 0.10 240)  ← primary fill
  signal-700:  oklch(0.35 0.08 240)

Surfaces (charcoal with 0.005 chroma toward signal):
  surface-0:   oklch(0.06 0.005 240)   ← app background
  surface-1:   oklch(0.10 0.005 240)   ← sidebar, composer
  surface-2:   oklch(0.14 0.005 240)   ← cards, hovered rows
  surface-3:   oklch(0.18 0.005 240)   ← borders, dividers
  surface-4:   oklch(0.22 0.005 240)   ← control fills
  surface-5:   oklch(0.26 0.005 240)   ← scrollbars

Ink:
  ink-primary:    oklch(0.95 0 0)
  ink-secondary:  oklch(0.70 0 0)
  ink-muted:      oklch(0.45 0 0)
  ink-faint:      oklch(0.25 0 0)

Semantic (reserved for real state, never decoration):
  ok:       oklch(0.65 0.15 145)
  warn:     oklch(0.70 0.15 75)
  error:    oklch(0.55 0.18 25)
```

### 3.4 Typography

**One family:** System font stack. `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Loads instantly. No layout shift. No Inter.

**Mono (code/telemetry only):** JetBrains Mono, Fira Code, SF Mono.

**Fixed rem scale (product UI):**

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display (greeting) | 1.75rem | 600 | `-0.02em` tracking, `line-height: 1.15` |
| Heading | 1.125rem | 600 | `line-height: 1.3` |
| Body | 0.9375rem | 400 | `line-height: 1.6` |
| Label | 0.75rem | 500 | UI labels, nav |
| Caption | 0.75rem | 400 | Timestamps, metadata |
| Code | 0.8125rem | 400 | Mono, code blocks only |

Body text rules:
- `max-width: 65ch` on prose containers
- Light-on-dark compensation: bump line-height 0.05, add 0.01em letter-spacing
- Only JetBrains Mono for `code`, `pre`, `kbd`, telemetry labels

### 3.5 Radius Scale

`6px` controls · `8px` cards/rows · `10px` composer · Never `rounded-full` on containers. Dots/avatars excepted.

### 3.6 Motion

- `cubic-bezier(0.16, 1, 0.3, 1)` — expo-out. No bounce. No elastic.
- Message stream-in: `fade + translateY(4px)`, 200ms
- Hover: border-color + subtle bg, 150ms
- Signal dot: breathing opacity 4s cycle (idle) / pulse 1.2s (thinking/streaming)
- Caret blink: `step-end` infinite (hard on/off, no fade)
- Active press: `scale(0.98)`
- Respect `prefers-reduced-motion`: instant state changes, no animation

### 3.7 Focus

- `:focus { outline: none }` — hide for mouse
- `:focus-visible { outline: 2px solid oklch(0.55 0.12 240); outline-offset: 2px }` — show for keyboard
- Visible on every interactive element
- Targets ≥ 36px touch areas

### 3.8 Absolute Bans (from Impeccable — non-negotiable)

- Side-stripe borders: `border-left` or `border-right` > 1px as colored accent
- Gradient text: `background-clip: text` + gradient
- Glassmorphism as default
- Hero-metric template (big number + small label + stats)
- Identical card grids (same icon+heading+text repeated)
- Tiny uppercase tracked eyebrow above every section (`[ ARTIMIS ]`)
- Numbered section markers as default scaffolding
- Text that overflows its container
- 1px border + box-shadow ≥16px on same element
- `border-radius: 32px+` on cards/sections/inputs
- Hand-drawn/sketchy SVG illustrations
- `repeating-linear-gradient` stripe backgrounds
- Marketing buzzwords (streamline/empower/supercharge/leverage/unleash)
- Bounce or elastic easing
- Layout-property animation (width/height/top/left/margins)
- Pure black/gray — always tint neutrals toward brand hue
- Inter/Roboto/Open Sans as default (system fonts OK for product UI per register)
- Gray text on colored backgrounds

---

## 4. Component Architecture

### 4.1 App Shell

```
┌──────────────────────────────────────────────────────┐
│  SIDEBAR (264px)     │  MAIN PANEL                    │
│  ┌─────────────────┐ │                                │
│  │ ○ Artimis       │ │  [route-dependent content]     │
│  │                 │ │                                │
│  │ + New Chat      │ │                                │
│  │                 │ │                                │
│  │ Chats        ▾  │ │                                │
│  │  ├ New Chat     │ │                                │
│  │  └ ...          │ │                                │
│  │                 │ │                                │
│  │ Tools           │ │                                │
│  │  Intelligence   │ │                                │
│  │  Memories       │ │                                │
│  │  Deep Research  │ │                                │
│  │  Gallery        │ │                                │
│  │  Notes          │ │                                │
│  │  Tasks          │ │                                │
│  │  Skills         │ │                                │
│  │  Theme          │ │                                │
│  │                 │ │                                │
│  │ ─────────────── │ │                                │
│  │ ○ admin    ⚙    │ │                                │
│  └─────────────────┘ │                                │
│                      ├────────────────────────────────┤
│                      │  COMPOSER                      │
│                      │  > Message Artimis...    Send  │
│                      └────────────────────────────────┘
└──────────────────────────────────────────────────────┘
```

Grid: `display: grid; grid-template-columns: 264px 1fr`. Sidebar `surface-1` background. Main `surface-0`. No gap-border trick — use solid border-right on sidebar.

### 4.2 Sidebar

**Header:** Living signal dot (breathing sky-blue, reflects AI state: idle/thinking/streaming/error) + "Artimis" in signal-400, weight 600, 1.125rem.

**New Chat button:** Full width, Plus icon + "New Chat", creates new session via `POST /api/sessions` then navigates.

**Chats section:** Collapsible. Lists sessions from `GET /api/sessions`. Active session gets `surface-2` background + signal-400 icon color. No colored left-border. Group by project folder.

**Tools section:** Phosphor icons (regular weight). Active tool gets `surface-2` background + signal-400 icon color. Clicking a tool opens its panel in main area.

**Footer:** User avatar + "admin" + settings gear. Top rule border.

**State to handle:** sidebar scroll overflow, collapsed chats, project folders ± empty states.

### 4.3 Routes (Client-Side)

No router library needed unless SPA grows large. Use simple state-based rendering:

| State | What renders in main panel |
|-------|---------------------------|
| `activeTool === null && activeChat.messages.length === 0` | **Home state** |
| `activeTool === null && activeChat.messages.length > 0` | **Chat view** |
| `activeTool === "intelligence"` | **Intelligence panel** |
| `activeTool === "memories"` | **Memories panel** |
| `activeTool === "deep-research"` | **Deep Research panel** |
| `activeTool === "gallery"` | **Gallery panel** |
| `activeTool === "notes"` | **Notes panel** |
| `activeTool === "tasks"` | **Tasks panel** |
| `activeTool === "skills"` | **Skills panel** |
| `activeTool === "theme"` | **Theme panel** |

### 4.4 Home State

**What renders when there are no messages and no tool selected.**

```
         Good morning.
         
    ┌──────────────────────────────────────┐
    │ ◉  Research deeply                   │
    │    Multi-source investigation with    │
    │    citations and gap detection        │
    └──────────────────────────────────────┘
    
    ┌──────────────────┐ ┌──────────────────┐
    │ ⚖  Pressure-test │ │  💡 Plan something │
    │    Challenge      │ │    Structured      │
    │    assumptions    │ │    breakdown       │
    └──────────────────┘ └──────────────────┘
```

- **Greeting:** Time-aware ("Good morning." / "Good afternoon." / "Good evening."). Display weight 600, 1.75rem.
- **Asymmetric layout:** One full-width card (research) + two half-width cards below. NOT a 3-column identical grid.
- **Cards:** `surface-2` background, 1px `surface-3` border, 8px radius. Hover: border → signal-400, bg → `surface-3`.
- **Research deeply** → navigates to Deep Research tool.
- **Pressure-test / Plan something** → sends pre-filled message to the agent.

No "Welcome to Artimis" copy. No three identical cards. No eyebrow labels. No emojis.

### 4.5 Chat View

**What renders when a conversation has messages.**

Messages are differentiated by **alignment and typography**, not bubbles, not left-border accents, not role labels.

- **User messages:** Right-aligned. `ink-secondary` color. Standard body type.
- **Assistant messages:** Left-aligned. `ink-primary` color. Standard body type. Markdown rendered (headings, bold, code, tables, lists, blockquotes).
- **System messages:** Full-width, `surface-1` background, 1px `surface-3` border, italic, `ink-muted`.
- **Timestamps:** Above messages, `caption` size, `ink-muted`. Right-aligned for user, left for assistant.
- **Loading/thinking:** Italic "Thinking..." in `ink-muted`. When streaming simulation active, show blinking caret in signal-500.
- **Hover affordances:** On assistant turns only — copy/retry/save buttons appear on hover. `ink-muted` → `ink-secondary` on hover.
- **Tool calls:** If `tool_calls` array present in message data, render as collapsible inline panel below the message: mono header `▸ web_search · 3 results`, expandable body with source details.

**Streaming simulation:** Since the backend returns complete JSON (no SSE), break the response text into chunks and render progressively with a 15-30ms stagger to feel like streaming. This is a frontend-only effect — the complete response is already in memory.

**Auto-scroll:** Smooth scroll to bottom on new messages. Don't scroll if user has manually scrolled up (check `scrollTop` vs `scrollHeight`).

**Message submission flow:**
1. User types, presses Enter or clicks Send.
2. Immediately render user message right-aligned.
3. Set loading state, show "Thinking..." with signal pulse.
4. `POST /api/agent` with `{message, session_id}`.
5. On success: set signal to streaming, progressively render response text, then set to idle.
6. On error: set signal to error (3s), render system message with error text.

### 4.6 Composer (Input Bar)

**Always visible at bottom of main panel.** Not inside the scrollable area.

```
┌──────────────────────────────────────────────┐
│ > Message Artimis...                 Send    │
└──────────────────────────────────────────────┘
```

- Background: `surface-1`. Border: 1px `surface-3`. Radius: 8px.
- Focus: border → signal-500, subtle ring `0 0 0 1px signal-500/0.25`.
- `>` prefix: JetBrains Mono, signal-400, non-interactive.
- Input: system font, 0.9375rem, `caret-color: signal-500`. Placeholder: `ink-muted`.
- Send button: when text present → signal-600 fill, ink-primary text, armed. When empty → `ink-muted`, transparent. Press: `scale(0.98)`.
- No Enter kbd hint in the composer bar (violates eyebrow ban — keep it clean).

### 4.7 Tool Panels

Each tool panel renders when `activeTool` matches. Simple data display panels — the backend does the heavy lifting.

**Intelligence panel:**
- `GET /api/memories/active` → list of active memories (those injected into current context)
- `GET /api/skills` → list of skills
- Each item: content preview, tags, pin status, use count
- Active items have signal-400 left indicator (subtle, 1px)

**Memories panel:**
- `GET /api/memories` → full memory list
- Search/filter by tag and content
- Create new memory: inline form → `POST /api/memories`
- Edit: inline edit → `PATCH /api/memories/{id}`
- Pin toggle: `POST /api/memories/{id}/pin`
- Delete with confirmation

**Deep Research panel:**
- Input for research task
- `POST /api/deep-research` trigger button
- Loading state: show phase progress (Plan → Retrieve → Verify → Synthesize) with spinner per phase
- Result display: rendered markdown memo with findings, inferences, citations, confidence

**Gallery panel:**
- `GET /api/gallery` → image grid
- Thumbnail cards with prompt excerpt
- Quality-passed images get subtle signal-400 border
- Click to expand full-size
- Delete with confirmation

**Notes panel:**
- `GET /api/notes` → note list, filterable by session
- Create new note: `POST /api/notes`
- Edit: rich text or markdown → `PATCH /api/notes/{id}`
- Version count display

**Tasks panel:**
- `GET /api/tasks` → task list, filterable by status
- Status columns: pending, in_progress, paused, completed, cancelled
- Phase indicator per task
- Execute/pause/cancel actions
- Silence report display
- Auto-poll running tasks for status updates

**Skills panel:**
- `GET /api/skills` → skill list
- Version history per skill: `GET /api/skills/{id}/versions`
- Rollback: `POST /api/skills/{id}/rollback`
- Pin toggle
- Create new skill: `POST /api/skills`

**Theme panel:**
- Show the color palette as swatches
- Display typography scale
- "This is the only theme. The interface is the content."

### 4.8 Command Palette (⌘K / Ctrl+K)

- Overlay: `position: fixed`, dark backdrop `oklch(0 0 0 / 0.5)`
- Panel: `surface-2`, 1px `surface-3` border, signal ring on open, 520px wide, centered
- Search input: system font, filters actions by label
- Actions list: keyboard-navigable (↑↓), Enter to select, Escape to close
- Each item: Phosphor icon + label + optional shortcut kbd badge
- Default actions: New Chat, recent chats (from `GET /api/sessions`), all tools

### 4.9 Living Signal (State Indicator)

A small 7px circle next to the "Artimis" wordmark in the sidebar.

| State | Visual | When |
|-------|--------|------|
| **idle** | `signal-500`, breathing opacity 4s cycle | Default, agent waiting |
| **thinking** | `signal-400`, pulse 1.2s | Agent loop running, tools executing |
| **streaming** | `signal-300`, pulse 1.2s | Response text being rendered |
| **error** | `error` color, static | Agent call failed |

### 4.10 Intro Screen

Brief typewriter animation on first load (not every navigation):
- Black background
- "Artimis" typed out in display weight, system font, 2.75rem
- Subtitle: "A thinking partner, not a yes-machine" fades in after
- Auto-dismisses after 800ms
- Click to skip
- Never shows again during session

---

## 5. State Management

No external state library. React `useState` + `useCallback` is sufficient for this surface area.

**Core state:**
```typescript
sessions: Session[]          // from GET /api/sessions
activeSessionId: string      // current session
messages: Message[]          // current session messages
activeTool: string | null    // which tool panel is open
isLoading: boolean           // agent call in flight
signalState: SignalState     // idle | thinking | streaming | error
paletteOpen: boolean         // Cmd+K palette
notifications: Notification[] // from GET /api/notifications (polled)
```

**Polling:**
- Notifications: `GET /api/notifications` every 30s
- Running tasks: `GET /api/tasks/running` every 15s when tasks panel is open
- Session list: `GET /api/sessions` on sidebar mount and after new chat creation

**Data flow pattern:**
1. Component mounts → fetch data from API → set state → render
2. User action → optimistic UI update → API call → reconcile with response
3. Error → revert optimistic update → show error state

---

## 6. Implementation Sequence (Build Order)

### Phase 1: Shell + Skeleton (do these first, in order)

1. **App layout grid** — sidebar + main area, 264px fixed sidebar, system font, charcoal bg
2. **Sidebar** — header with signal dot, New Chat button, Chats section (collapsible, session list), Tools section (icon list), admin footer. Wire to state, no API calls yet.
3. **Composer** — input bar at bottom, Send button armed/disabled states, Enter to submit
4. **Home state** — greeting + asymmetric suggestion cards
5. **Chat view** — message rendering with markdown, user/assistant alignment, timestamps, loading state, auto-scroll
6. **API integration** — `POST /api/agent`, `GET/POST /api/sessions`, wire real data

### Phase 2: Agent Flow

7. **Message submission flow** — user message → loading → agent response → streaming simulation → render
8. **Error handling** — API unavailable, timeout, signal error state
9. **Session management** — create, switch, auto-name, delete
10. **Streaming simulation** — progressive text reveal from complete JSON response

### Phase 3: Tool Panels

11. **Intelligence panel** — active memories + skills display
12. **Memories panel** — CRUD, search, pin toggle
13. **Deep Research panel** — task input, phase progress, result display
14. **Gallery panel** — image grid, quality filter
15. **Notes panel** — CRUD, session filter
16. **Tasks panel** — status columns, execute/pause/cancel, silence report
17. **Skills panel** — CRUD, version history, rollback, pin
18. **Theme panel** — swatches, type scale

### Phase 4: Polish

19. **Command palette** — ⌘K, keyboard navigation, search
20. **Living signal** — wire to actual agent states (idle/thinking/streaming/error)
21. **Notification polling** — background poll every 30s, badge count
22. **Intro screen** — typewriter animation
23. **Motion audit** — ensure all transitions 150-250ms, no bounce, reduced-motion safe
24. **Contrast audit** — verify ink-primary on surface-0 passes 4.5:1

---

## 7. Technology Stack

```
React 19 + TypeScript
Vite (build tool)
Tailwind CSS v4 (utility classes)
Framer Motion (intro screen + subtle animations — keep minimal)
@phosphor-icons/react (icon library — one family, regular weight)
```

No shadcn/ui. No Radix. No component library. Build components from scratch — they're simple enough.

---

## 8. File Structure

```
web/
├── src/
│   ├── index.css                  # All design tokens + global styles
│   ├── App.tsx                    # Root layout + state + routing
│   ├── main.tsx                   # React entry
│   ├── components/
│   │   ├── intro-screen.tsx       # Typewriter intro
│   │   ├── artimis-sidebar.tsx    # Sidebar with nav + tools
│   │   ├── home-state.tsx         # Greeting + suggestion cards
│   │   ├── living-signal.tsx      # State-indicator dot
│   │   ├── command-palette.tsx    # ⌘K palette + actions builder
│   │   ├── telemetry-strip.tsx    # Optional top status bar
│   │   ├── launch-console.tsx     # Optional command cells
│   │   └── ui/
│   │       ├── chat-ui.tsx        # Message list + composer
│   │       └── typewriter.tsx     # Typewriter effect
│   └── lib/
│       └── api.ts                 # Fetch wrappers for all endpoints
```

---

## 9. Acceptance Checklist

- [ ] Palette is charcoal + sky-blue only. Zero red, zero purple, zero second hue.
- [ ] One font family throughout (system font stack). No Inter, no Archivo, no Google Fonts.
- [ ] No side-stripe colored borders anywhere.
- [ ] No eyebrow labels (`[ ARTIMIS ]`, `// CHATS`, etc.) on messages or cards.
- [ ] Home state is asymmetric (1 wide + 2 half cards). Not a 3-column identical grid.
- [ ] Chat messages differentiated by alignment + color only. No bubbles, no left-borders.
- [ ] Living signal reflects idle/thinking/streaming/error states.
- [ ] Composer has armed SEND (signal fill when text present, muted when empty).
- [ ] ⌘K command palette: open, search, keyboard-navigate, select, close.
- [ ] All API endpoints have fetch wrappers. Error states handled.
- [ ] Streaming simulation on agent responses (progressive text reveal).
- [ ] Notification polling runs in background.
- [ ] Motion 150-250ms, expo-out easing, no bounce, reduced-motion safe.
- [ ] Focus rings visible on keyboard navigation (outline-offset 2px).
- [ ] Body text contrast ≥4.5:1. Touch targets ≥36px.
- [ ] Scrollbar styled (6px, surface-5 handle).
- [ ] TypeScript 0 errors. Build under 2s.

---

## 10. What "Not Generic" Means Here

Every design decision traces to Artimis's specific backend:

- **Asymmetric home cards** because Deep Research is the heaviest tool and deserves the widest affordance
- **Streaming simulation** because the backend has no SSE — the frontend must fake it with progressive rendering
- **No bubbles** because the Impeccable skill bans side-stripes and the product register bans decorative chat chrome
- **System font** because there's no brand font loading to slow the workspace down — speed is a feature
- **264px sidebar** because 11 tools need space — narrower than Odysseus (which has fewer) but wider than minimal
- **Signal dot** because the agent has real states (idle/thinking/streaming/error) that need a persistent, at-a-glance indicator — status is information, not decoration
- **Notification polling** because the backend uses polling-based notifications with no push/SSE capability
- **Phase progress in Deep Research** because the pipeline is sequential (Plan→Retrieve→Verify→Synthesize) and takes 60-180s — users need to see where they are
- **Phosphor icons** because one consistent icon family across 11 tools reads as intentional, not scattered

Nothing is decorative. Everything maps to data.
