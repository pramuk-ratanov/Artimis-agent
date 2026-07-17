# Artimis Backlog

Status after the 2026-07-17 fix pass (branch: concept/artimis-stability-ux-redesign).

## Canonical deployment — DECIDED

**`http://100.95.117.9:7002` is the canonical instance.**
- Runs as user-level systemd service `artimis-dev.service` (auto-restart on crash,
  starts on boot via lingering, 2G memory cap).
- Code: `/home/hermes/workspace/artimis-agent`, venv at `.venv/`, DB at `~/.artimis/`.
- Manage: `systemctl --user restart artimis-dev` / `journalctl --user -u artimis-dev`.

**Legacy instance**: systemd `artimis.service` on port 7001 runs as root from
`/root/.artimis/agent` with its own database. Retirement requires root action by Pramuk:
`systemctl disable --now artimis` after confirming nothing on 7001 is needed.
The two databases have drifted; 7002 is authoritative.

## Done (2026-07-17)

- API key + origin security middleware (browser UI exempt via Origin/Referer check,
  non-browser clients need `ARTIMIS_API_KEY`). Verified live matrix: UI 200, foreign
  origin 403, keyless curl 401, valid key 200.
- Code-split: main bundle 1417KB → 347KB (444KB → 100KB gzip). Canvas + Statistics lazy-load.
- Auto-name fires backend-side after first exchange (both agent paths); API-created
  sessions no longer stall at "New Chat".
- audit.py authenticates with the API key and deletes its test session (20/20 pass).
- Harness Lab panel uses the typed api client.
- Light theme ("Peec") with Theme-panel toggle, localStorage persistence, `?theme=` URL
  override. Body font now Geist Variable; Share Tech Mono kept for logo/labels/composer/code.
- Sidebar grouped: WORKSPACE / KNOWLEDGE / SYSTEM. Flask icon for Harness Lab.
- Home: hero-first layout. Card pulse-glow now hover/focus-only + reduced-motion safe.

## Remaining

1. **Retire the root 7001 instance** (needs root; see above).
2. **Skills-ingest and models endpoints have no UI** (`POST /api/skills/ingest`,
   `GET /api/models/*`) — document as API-only or surface in Settings.
3. **Home-state quick actions are static** — could be personalized from usage patterns.
4. **Self-hosted Sandpack bundler** for fully-offline Canvas privacy
   (`VITE_SANDPACK_BUNDLER_URL`), see canvas-architecture-problem.md.
