# Artimis Backlog

Priority order. Source: full functional audit 2026-07-17 (19/19 live checks passed, 10/10 pytest, build green).

## Blocked on Pramuk decision

1. **Single canonical deployment.** Two instances exist with separate code and separate databases:
   - systemd `artimis.service` on port 7001, running as root from `/root/.artimis/agent`
   - dev workspace on port 7002 from `/home/hermes/workspace/artimis-agent`
   Pick one. Until then the databases and code drift apart.

2. **Set `ARTIMIS_API_KEY` + `ARTIMIS_ALLOWED_ORIGINS`** on the canonical instance.
   Verified live: `/api/config` is origin-guarded (403 from foreign origin) but all data
   endpoints (`/api/memories`, `/api/sessions`, `/api/tasks`, `/api/files`) answer 200 to
   any client that can reach the port. Server binds `0.0.0.0`. Contained by Tailscale today;
   exposed if the public IP:port is reachable.

## Engineering (unblocked)

3. **Code-split the Sandpack bundle.** Main JS chunk is 1.4MB (444KB gzip) after the canvas
   migration. Lazy-load the canvas panel so chat stays fast.

4. **Auto-name sessions created via API.** Auto-naming only fires from the frontend, so
   API/agent-created sessions stay "New Chat" forever. Move the trigger backend-side.

5. **audit.py cleanup.** The script leaves its test sessions in the DB. Delete what it creates.

6. **Harness Lab panel** uses raw `fetch` instead of the typed `api.ts` client. Align it.

7. **No UI for skills-ingest or models endpoints** (`POST /api/skills/ingest`,
   `GET /api/models/*`). Either surface them or document as API-only.

## UX direction (Peec AI reference, from audit)

8. Body/UI font → Geist Variable (already in deps); keep Share Tech Mono for logo/labels/code.
9. Light theme variant of the token system (currently charcoal-only).
10. Sidebar IA: 10 flat tools → grouped (Workspace / Knowledge / System). Fix duplicate
    Wrench icon on Skills + Harness Lab.
11. Home state: hero-first layout instead of equal-weight bento.
12. Reserve card pulse-glow for active states, not ambient decoration.
