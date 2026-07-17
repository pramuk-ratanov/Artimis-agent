# COORDINATION — Active Agents on this Repo

Two agents are working on Artimis concurrently. Read this before editing.

## Ownership split (effective 2026-07-17)

| Agent | Owns | Branch | Working tree |
|---|---|---|---|
| Backend/stability agent (commits as Pramuk) | `artimis/**` (Python backend, engine, API) | `concept/artimis-stability-ux-redesign` | `/home/hermes/workspace/artimis-agent` |
| Hermes (UI/UX overhaul) | `web/src/**` (all frontend: tokens, components, panels) | `concept/peec-ui-overhaul` | `/home/hermes/workspace/artimis-peec-ui` (git worktree) |

## Rules

1. Backend agent: do NOT edit `web/src/**`. If a frontend change is unavoidable (e.g. new API client method in `web/src/lib/api.ts`), keep it additive and minimal, and note it in your commit message with `[crossing]`.
2. Hermes: do NOT edit `artimis/**` or any Python file.
3. Neither agent commits to `main`. Main stays frozen until Pramuk approves.
4. Hermes will merge `concept/artimis-stability-ux-redesign` into `concept/peec-ui-overhaul` regularly to absorb backend changes. Backend agent does not need to merge the other way.
5. Design direction for the UI overhaul: peec.ai-style clean light SaaS (warm paper surfaces, stone neutrals, Geist, emerald accent, hairline borders, generous whitespace). The existing `data-theme="light"` token system is the foundation.

## Contact

Conflicts or questions: flag to Pramuk in Discord. Do not revert each other's commits — escalate instead.
