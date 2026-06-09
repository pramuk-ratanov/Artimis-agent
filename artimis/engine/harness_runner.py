"""
Artimis Agent — Harness Runner
Self-improvement loop: polls harness_experiments, runs test cases against
proposed prompt modifications, and applies/rejects based on score delta.
"""

import logging
import threading
import time
from typing import Optional

from artimis.db.schema import get_db, generate_id, now as db_now

logger = logging.getLogger("artimis.harness")

# Lock to prevent concurrent validation runs
_harness_lock = threading.Lock()
# Whether the background thread is running
_running = False
_thread: Optional[threading.Thread] = None


class HarnessRunner:
    """
    Background thread that polls for pending experiments, runs test cases,
    and applies or rejects prompt modifications based on score delta.
    """

    def __init__(self, interval_seconds: int = 60):
        self.interval = interval_seconds

    def start(self):
        """Start the harness runner background thread (daemon)."""
        global _running, _thread
        if _running:
            logger.warning("HarnessRunner already running — skipping duplicate start")
            return
        _running = True
        _thread = threading.Thread(target=self._poll_loop, daemon=True, name="harness-runner")
        _thread.start()
        logger.info("HarnessRunner started — polling every %ds", self.interval)

    def stop(self):
        """Signal the harness runner to stop (cooperative). Thread is daemon so it
        will terminate with the process regardless."""
        global _running
        _running = False

    def _poll_loop(self):
        """Main polling loop. Runs until _running is set to False."""
        while _running:
            try:
                self._process_pending()
            except Exception:
                logger.exception("HarnessRunner poll iteration crashed — will retry")
            # Sleep in small chunks so we can exit promptly on shutdown
            slept = 0
            while _running and slept < self.interval:
                time.sleep(1)
                slept += 1

    def _process_pending(self):
        """Find and process all pending experiments, one at a time, under a lock."""
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM harness_experiments WHERE outcome = 'pending' ORDER BY created_at ASC"
            ).fetchall()
        finally:
            conn.close()

        if not rows:
            return

        for row in rows:
            exp = dict(row)
            with _harness_lock:
                # Re-check the experiment is still pending (another runner might have
                # processed it between our query and acquiring the lock).
                conn2 = get_db()
                try:
                    current = conn2.execute(
                        "SELECT outcome FROM harness_experiments WHERE id = ?",
                        (exp["id"],),
                    ).fetchone()
                    if not current or current["outcome"] != "pending":
                        continue  # Already handled
                finally:
                    conn2.close()

                try:
                    self._process_one(exp)
                except Exception:
                    logger.exception(
                        "HarnessRunner failed processing experiment %s", exp["id"]
                    )
                    # Mark the experiment as error so it doesn't block the queue
                    self._mark_experiment_error(exp["id"], str(Exception))

    def _process_one(self, exp: dict):
        """Process a single pending experiment."""
        exp_id = exp["id"]
        hypothesis = exp.get("hypothesis", "")
        component = exp.get("component", "system_prompt")

        logger.info("HarnessRunner processing experiment %s: %s", exp_id[:8], hypothesis[:120])

        # 1. Load all test cases
        conn = get_db()
        try:
            test_rows = conn.execute(
                "SELECT * FROM test_cases ORDER BY use_count ASC, created_at ASC"
            ).fetchall()
        finally:
            conn.close()

        if not test_rows:
            logger.warning("No test cases available — rejecting experiment %s", exp_id[:8])
            self._mark_experiment_rejected(exp_id, "No test cases available", 0, 0)
            return

        test_cases = [dict(r) for r in test_rows]

        # 2. Take a snapshot of the current system_prompt before testing
        from artimis.engine.system_prompt import SYSTEM_PROMPT as _sp_module

        original_prompt = str(_sp_module)  # copy

        # 3. Compute baseline scores (current system prompt)
        baseline_scores = []
        for tc in test_cases:
            score = self._run_test_case(tc, original_prompt)
            if score is not None:
                baseline_scores.append(score)

        if not baseline_scores:
            self._mark_experiment_rejected(exp_id, "All test cases failed to produce scores (baseline)", 0, 0)
            return

        avg_baseline = sum(baseline_scores) / len(baseline_scores)
        logger.info("Experiment %s baseline avg score: %.2f", exp_id[:8], avg_baseline)

        # 4. Construct proposed prompt
        proposed_prompt = self._build_proposed_prompt(original_prompt, hypothesis)

        # 5. Compute proposed scores
        proposed_scores = []
        for tc in test_cases:
            score = self._run_test_case(tc, proposed_prompt)
            if score is not None:
                proposed_scores.append(score)

        if not proposed_scores:
            self._mark_experiment_rejected(exp_id, "All test cases failed to produce scores (proposed)", avg_baseline, 0)
            return

        avg_proposed = sum(proposed_scores) / len(proposed_scores)
        logger.info("Experiment %s proposed avg score: %.2f", exp_id[:8], avg_proposed)

        delta = avg_proposed - avg_baseline

        # 6. Apply or reject
        if avg_proposed > avg_baseline:
            self._apply_experiment(exp_id, exp, proposed_prompt, avg_baseline, avg_proposed, delta)
        else:
            self._mark_experiment_rejected(exp_id, None, avg_baseline, avg_proposed)

    def _run_test_case(self, tc: dict, system_prompt: str) -> Optional[float]:
        """
        Run a single test case through the agent with the given system prompt.
        Returns the self_critique overall_score, or None on failure.
        """
        from artimis.engine.agent import run_agent
        from artimis.engine.intelligence import self_critique
        from artimis.engine import system_prompt as sp_module

        input_msg = tc.get("input_message", "")
        if not input_msg:
            return None

        # Temporarily swap the module-level SYSTEM_PROMPT so run_agent uses it
        saved = sp_module.SYSTEM_PROMPT
        sp_module.SYSTEM_PROMPT = system_prompt
        try:
            result = run_agent(
                user_message=input_msg,
                session_id=None,  # Don't persist test runs
                max_iterations=3,  # Limit tool-calling for test speed
            )
        finally:
            sp_module.SYSTEM_PROMPT = saved

        response_text = result.get("response", "")
        if result.get("error"):
            logger.debug("Test case failed with error: %s", result["error"])
            return None

        # Run self-critique to get a numerical score
        try:
            critique = self_critique(input_msg, response_text)
            score = critique.get("overall_score", 5)
            return float(score)
        except Exception:
            logger.debug("self_critique failed for test case — defaulting to 5")
            return 5.0

    def _build_proposed_prompt(self, original: str, hypothesis: str) -> str:
        """Append the hypothesis as a refinement instruction to the system prompt."""
        refinement = (
            f"\n\n## SELF-IMPROVEMENT EXPERIMENT\n"
            f"The following hypothesis is being tested against real user queries. "
            f"Integrate this guidance into your thinking:\n\n"
            f"**Hypothesis**: {hypothesis}\n\n"
            f"**Instruction**: Apply this refinement to improve the quality, specificity, "
            f"and actionability of your responses."
        )
        return original + refinement

    def _apply_experiment(
        self,
        exp_id: str,
        exp: dict,
        proposed_prompt: str,
        score_before: float,
        score_after: float,
        delta: float,
    ):
        """Mark the experiment as applied, persist the new prompt, and update runtime."""
        import json
        from artimis.engine import system_prompt as sp_module

        logger.info(
            "APPLYING experiment %s — score improved from %.2f → %.2f (+%.2f)",
            exp_id[:8], score_before, score_after, delta,
        )

        conn = get_db()
        try:
            # Determine new version number
            max_ver = conn.execute(
                "SELECT COALESCE(MAX(version), 0) FROM harness_snapshots WHERE component = ?",
                (exp.get("component", "system_prompt"),),
            ).fetchone()[0]
            new_version = max_ver + 1

            # Create a harness_snapshot with the new prompt
            snap_id = generate_id()
            conn.execute(
                """INSERT INTO harness_snapshots (id, version, component, content, source, metrics_json, created_at)
                   VALUES (?, ?, ?, ?, 'experiment', ?, ?)""",
                (
                    snap_id,
                    new_version,
                    exp.get("component", "system_prompt"),
                    proposed_prompt,
                    json.dumps({
                        "score_before": score_before,
                        "score_after": score_after,
                        "delta": delta,
                        "experiment_id": exp_id,
                    }),
                    db_now(),
                ),
            )

            # Update the experiment record
            conn.execute(
                """UPDATE harness_experiments
                   SET outcome = 'applied', after_version = ?, score_before = ?,
                       score_after = ?, completed_at = ?
                   WHERE id = ?""",
                (new_version, score_before, score_after, db_now(), exp_id),
            )

            conn.commit()
        finally:
            conn.close()

        # Update the runtime SYSTEM_PROMPT so future agent calls use the new prompt
        sp_module.SYSTEM_PROMPT = proposed_prompt
        logger.info("Runtime SYSTEM_PROMPT updated to version %d", new_version)

    def _mark_experiment_rejected(
        self,
        exp_id: str,
        error_message: Optional[str],
        score_before: float,
        score_after: float,
    ):
        """Mark the experiment as rejected with optional error message."""
        logger.info(
            "REJECTING experiment %s (before=%.2f, after=%.2f)%s",
            exp_id[:8],
            score_before,
            score_after,
            f" — {error_message}" if error_message else "",
        )

        conn = get_db()
        try:
            conn.execute(
                """UPDATE harness_experiments
                   SET outcome = 'rejected', score_before = ?, score_after = ?,
                       error_message = ?, completed_at = ?
                   WHERE id = ?""",
                (score_before, score_after, error_message, db_now(), exp_id),
            )
            conn.commit()
        finally:
            conn.close()

    def _mark_experiment_error(self, exp_id: str, error_message: str):
        """Mark an experiment as errored (unexpected failure during processing)."""
        logger.error("Experiment %s errored: %s", exp_id[:8], error_message)
        conn = get_db()
        try:
            conn.execute(
                """UPDATE harness_experiments
                   SET outcome = 'error', error_message = ?, completed_at = ?
                   WHERE id = ?""",
                (error_message[:500], db_now(), exp_id),
            )
            conn.commit()
        finally:
            conn.close()


def start_harness_runner(interval_seconds: int = 60):
    """Convenience function to create and start a HarnessRunner."""
    runner = HarnessRunner(interval_seconds=interval_seconds)
    runner.start()
    return runner
