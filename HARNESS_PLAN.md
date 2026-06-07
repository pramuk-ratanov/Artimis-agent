# Meta-Harness for Artimis — Integration Plan

## What The Repos Are

**Stanford `meta-harness`**: Research framework. Treats the *harness code* around a model (memory config, retrieval logic, tool setup) as an optimization target. An outer agent loop proposes improvements, validates them, keeps evidence.

**SuperagenticAI `metaharness`**: CLI implementation of the paper. Runs a coding agent (Codex) to improve harness artifacts. Stores prompts, candidates, validation results on disk for auditability.

**What Artimis already has**: Self-critique with regeneration, three-tier intelligence, curiosity engine for cross-session patterns, tiered memory, skills, tool reliability.

**What Artimis needs**: The outer optimization loop — systematically improving its OWN harness based on evidence, not just one-off corrections.

## The Goal

Artimis becomes: "A local-first, self-hosted AI agent that grows with you. Learns from every interaction, critiques its own output, regenerates weak responses, and surfaces cross-session patterns automatically."

Every word of this is already partially true. The meta-harness integration makes "grows with you" and "learns from every interaction" systematic rather than ad hoc.

## Phase 1: Harness Snapshot & Versioning

Artimis' harness is:
- System prompt (system_prompt.py)
- Tool definitions (tools.py schemas + handlers)
- Brain config (relevance scoring, context budget)
- Skills (procedural knowledge)
- Active memories

**Step 1.1**: Add `harness` table to DB
  - id, version, component, content, created_at, source (manual/auto/experiment), metrics

**Step 1.2**: Add `POST /api/harness/snapshot` — captures current state
**Step 1.3**: Add `GET /api/harness/versions` — lists all snapshots
**Step 1.4**: Add `POST /api/harness/rollback` — restores a previous version
**Step 1.5**: Harness panel in UI — shows version history, diffs

## Phase 2: Experiment Runner

The outer loop from metaharness:

1. Agent identifies a weakness (from critique scores, user corrections, failed tasks)
2. Agent proposes a harness change (prompt edit, new skill, memory config)
3. Agent validates against saved test cases
4. If score improves → apply and snapshot
5. If score degrades → discard, log evidence

**Step 2.1**: Add `harness_experiments` table
  - id, hypothesis, change_type, before_snapshot_id, after_snapshot_id, test_results, outcome (applied/rejected), created_at

**Step 2.2**: Add `test_cases` table
  - id, input_message, expected_behavior, created_at

**Step 2.3**: Add `POST /api/harness/experiment` — runs a proposal through validation
**Step 2.4**: Add `GET /api/harness/experiments` — lists experiment history
**Step 2.5**: Agent tool: `propose_harness_improvement` — agent can trigger self-improvement

## Phase 3: Auto-Self-Improvement Trigger

**Step 3.1**: After every N low-scoring critiques, agent automatically:
  - Creates a hypothesis: "My responses scored below 6/10 on X. Hypothesis: adjusting Y will improve."
  - Creates a test case from the failing interaction
  - Proposes a harness change
  - Runs validation
  - Applies or rejects

**Step 3.2**: Curiosity engine extended to detect harness-level patterns
  - "You've been corrected on factual errors 5 times this week. Consider stricter web-search rules."

## Phase 4: Harness Lab UI

A new tool panel: "Harness Lab"
- Current harness state with version number
- Experiment history with pass/fail indicators
- Test case manager (add/edit/delete)
- One-click "Run Self-Improvement" button
- Diff viewer for harness changes

## Implementation Priority

1. DB tables (harness, harness_experiments, test_cases) — foundation
2. Snapshot/versioning API — capture current state
3. Harness Lab UI panel — visibility
4. Experiment runner — the core loop
5. Auto-trigger — closes the loop
