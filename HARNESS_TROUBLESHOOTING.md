# Meta-Harness — Troubleshooting & Mitigations

## Risk 1: Experiment validation is unreliable
**Problem**: How do we know if a harness change is "better"? Automatic test cases may not capture real quality.
**Fix**: 
- Primary metric = critique score delta. Only apply if score improves by >= 1 point across 3+ test cases.
- Test cases come from user corrections — when user says "wrong, answer is X", that's a test case.
- All changes are reversible (rollback to previous snapshot).

## Risk 2: Circular self-improvement
**Problem**: A broken agent can't fix itself. The proposer is the same model.
**Fix**:
- Use a DIFFERENT model for harness experiments (e.g., use OpenRouter/Claude for proposals, DeepSeek for chat).
- Harness changes are limited to single-component edits (one prompt paragraph, one tool config).
- Every change creates a snapshot before applying — instant rollback on failure.

## Risk 3: Harness changes break ongoing conversations
**Problem**: Mid-session prompt changes could confuse the agent.
**Fix**:
- Harness changes are versioned per session. Active sessions keep their version.
- New sessions pick up the latest harness. Old sessions are frozen.
- Critical failures (agent returns empty/garbage 3x in a row) auto-rollback.

## Risk 4: DB bloat from full snapshots
**Problem**: Storing the entire system prompt + tools every snapshot adds up.
**Fix**:
- Store diffs, not full text. Only store full snapshot on major versions.
- Auto-compact: keep last 10 snapshots + 1 per week older.

## Risk 5: Auto-trigger infinite loops
**Problem**: Agent keeps proposing changes that fail, wasting tokens.
**Fix**:
- Max 1 auto-experiment per hour.
- Require 3+ low-score critiques (< 6/10) before triggering.
- 3 consecutive rejected proposals → silence for 24h.

## Risk 6: LLM hallucinates harness changes
**Problem**: Agent proposes nonsensical prompt changes.
**Fix**:
- Validation step: proposed change must produce valid JSON/markdown matching expected schema.
- Diff must be parseable. Can't remove critical sections.
- Minimum content length check on new prompt version.

## Implementation Sequence

1. DB: harness_snapshots, harness_experiments, test_cases tables
2. API: POST /api/harness/snapshot, GET /api/harness/versions, POST /api/harness/rollback
3. API: POST /api/harness/experiment, GET /api/harness/experiments
4. Agent tool: propose_harness_improvement, validate_experiment
5. UI: Harness Lab panel
6. Auto-trigger: critique-score-based experiment scheduling
