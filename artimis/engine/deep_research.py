"""
Artimis Agent — Deep Research Engine

Multi-role research pipeline based on established human + AI agent frameworks:
    Planner → Retriever → Verifier → Synthesizer

Architecture from the deep-research report:
    1. Task decomposition into subquestions with source classes and verification criteria
    2. Broad retrieval across multiple source types
    3. Claim-level verification with evidence classification
    4. Synthesis into a research memo with findings, inferences, disagreements, uncertainty
    5. Iteration loop — gaps trigger re-retrieval
    6. Provenance tracking — every claim carries a citation
"""

import json
import logging
from typing import Optional

logger = logging.getLogger("artimis.deep_research")


def run_direct_llm(prompt: str, system_prompt: Optional[str] = None) -> str:
    """Helper to run a non-agentic, deterministic LLM call to avoid recursion and tools overhead."""
    try:
        from artimis.engine.agent import _get_client, DEFAULT_MODEL
        model_name = DEFAULT_MODEL
        client = _get_client(model_name)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.2, # Low temperature ensures high consistency
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"Direct LLM call failed: {e}")
        raise


# ─── Phase 1: Planner ───────────────────────────────────────

PLANNER_PROMPT = """You are a research planner. Decompose the task into subquestions.

For each subquestion, specify:
- why it matters
- best source classes (web search, academic, industry reports, news, documentation, etc.)
- how to verify
- what conflicting evidence would look like
- when to stop searching

Output as JSON:
{
  "overall_approach": "one sentence summary of research approach",
  "subquestions": [
    {
      "question": "specific research question",
      "why_matters": "relevance to the main task",
      "source_classes": ["web", "news", "academic"],
      "verification_criteria": "how to confirm this is true",
      "conflict_signal": "what would disprove this",
      "stop_condition": "when enough evidence is gathered"
    }
  ],
  "out_of_scope": ["what NOT to research"],
  "quality_criteria": "what makes a good answer to the original task"
}

Do not draft conclusions yet. Only plan the investigation."""


def plan_research(task: str) -> dict:
    """Decompose a research task into subquestions and source strategy."""
    response = run_direct_llm(
        system_prompt=PLANNER_PROMPT,
        prompt=f"Task: {task}"
    )

    # Try to parse JSON from response
    try:
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            plan = json.loads(response[start:end])
            return plan
    except (json.JSONDecodeError, KeyError):
        pass

    return {
        "overall_approach": response[:200],
        "subquestions": [
            {"question": task, "source_classes": ["web"], "verification_criteria": "check multiple sources"}
        ],
        "out_of_scope": [],
        "quality_criteria": "accurate and well-sourced",
    }


# ─── Phase 2: Retriever ─────────────────────────────────────

def retrieve_for_subquestion(subquestion: dict) -> list[dict]:
    """Search for evidence on a single subquestion safely and synchronously."""
    question = subquestion.get("question", "")
    source_classes = subquestion.get("source_classes", ["web"])

    results = []

    for source_class in source_classes[:3]:
        search_query = f"{question}"
        if source_class == "news":
            search_query += " news latest"

        # Execute search tool synchronously and securely without running a nested agent
        try:
            from artimis.engine.tools import execute_tool
            search_data = execute_tool("web_search", {"query": search_query})
        except Exception as e:
            search_data = json.dumps({"error": str(e)})

        # Extract and format findings using direct non-agentic LLM
        prompt = f"""Search Query: {search_query}
Raw Search Results:
{search_data[:12000]}

Please extract the top 3 most relevant results with URLs and key findings.
Format each exactly as:

SOURCE: [title]
URL: [url]
KEY FINDINGS: [2-3 bullet points]
CREDIBILITY: [high/medium/low with reason]"""

        summary = run_direct_llm(
            system_prompt="You are a precise search results analyst. Your job is to extract and summarize key findings from raw search data.",
            prompt=prompt
        )

        results.append({
            "question": question,
            "source_class": source_class,
            "raw_response": summary,
            "tool_calls": 1,
        })

    return results


# ─── Phase 3: Verifier ──────────────────────────────────────

VERIFIER_PROMPT = """You are a research verifier. Review the retrieved evidence and classify each claim.

For each claim found in the evidence:
- classify as: supported, contradicted, or unresolved
- cite the strongest available evidence (source and URL)
- note the source type and why it is or is not authoritative
- list the main counterevidence
- flag hidden assumptions

Output as JSON:
{
  "claims": [
    {
      "claim": "the specific claim",
      "classification": "supported|contradicted|unresolved",
      "best_evidence": "source and URL",
      "source_authority": "why trustworthy or not",
      "counterevidence": "opposing evidence if any",
      "hidden_assumptions": "unstated premises"
    }
  ],
  "overall_confidence": "high|medium|low",
  "major_gaps": ["missing evidence or unanswered questions"],
  "needs_more_research": true/false,
  "missing_questions": ["questions that still need investigation"]
}

Be rigorous. Flag weak sources."""


def verify_evidence(retrieval_results: list[dict]) -> dict:
    """Verify claims across all retrieved evidence."""
    evidence_text = "\n\n---\n\n".join([
        f"SUBQUESTION: {r['question']}\nSOURCE CLASS: {r['source_class']}\n{r['raw_response']}"
        for r in retrieval_results
    ])

    response = run_direct_llm(
        system_prompt=VERIFIER_PROMPT,
        prompt=f"EVIDENCE TO VERIFY:\n\n{evidence_text[:8000]}"
    )

    try:
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
    except (json.JSONDecodeError, KeyError):
        pass

    return {
        "claims": [],
        "overall_confidence": "low",
        "major_gaps": ["Could not parse verification output"],
        "needs_more_research": True,
        "missing_questions": [],
    }


# ─── Phase 4: Synthesizer ───────────────────────────────────

SYNTHESIZER_PROMPT = """Write a research memo with these sections:

## FINDINGS (directly supported by sources)
- Fact 1 [Source: URL]
- Fact 2 [Source: URL]

## INFERENCES (that go beyond the sources)
- What patterns emerge across sources
- What the data implies (but doesn't directly state)

## DISAGREEMENTS (across sources)
- Where sources conflict
- Which source is more credible and why

## CONFIDENCE & UNCERTAINTY
- Overall confidence: high/medium/low
- Key uncertainties
- What would change the conclusion

## IMPLICATIONS
- What this means for the original task/question
- Actionable insights

## OPEN QUESTIONS
- What remains unanswered
- What further research would improve the answer

Every substantive claim must carry a citation in [Source: URL] format."""


def synthesize_research(verification: dict, retrieval_results: list[dict], original_task: str) -> str:
    """Synthesize verified evidence into a research memo."""
    evidence_summary = json.dumps({
        "verified_claims": verification.get("claims", []),
        "confidence": verification.get("overall_confidence", "unknown"),
        "gaps": verification.get("major_gaps", []),
    }, indent=2)

    context = f"""ORIGINAL TASK: {original_task}

VERIFICATION RESULTS:
{evidence_summary}

Write a comprehensive research memo based on the verified evidence above."""

    response = run_direct_llm(
        system_prompt=SYNTHESIZER_PROMPT,
        prompt=context
    )

    return response


# ─── Full Pipeline ──────────────────────────────────────────

def deep_research(
    task: str,
    session_id: Optional[str] = None,
    max_iterations: int = 2,
) -> dict:
    """
    Run the full deep research pipeline.

    Args:
        task: The research question or task
        session_id: Session context for memory injection
        max_iterations: How many times to loop (re-plan if gaps found)

    Returns:
        dict with: plan, retrieval_results, verification, synthesis, iterations
    """
    logger.info(f"Starting deep research: {task[:100]}...")

    all_retrieval = []
    final_verification = {}
    final_synthesis = ""
    iterations = 0
    plan = {}

    for iteration in range(max_iterations):
        iterations = iteration + 1
        logger.info(f"Deep research iteration {iterations}/{max_iterations}")

        # Phase 1: Plan (only on first iteration)
        if iteration == 0:
            plan = plan_research(task)
            subquestions = plan.get("subquestions", [{"question": task, "source_classes": ["web"]}])
            if not subquestions:
                subquestions = [{"question": task, "source_classes": ["web"]}]
        else:
            # Re-plan based on gaps from previous verification
            gaps = final_verification.get("missing_questions", [])
            if not gaps:
                break
            subquestions = [{"question": g, "source_classes": ["web"]} for g in gaps[:3]]

        # Phase 2: Retrieve
        retrieval_results = []
        for sq in subquestions[:5]:  # Max 5 subquestions per iteration
            evidence = retrieve_for_subquestion(sq)
            retrieval_results.extend(evidence)

        all_retrieval.extend(retrieval_results)

        # Phase 3: Verify
        final_verification = verify_evidence(all_retrieval)

        # Check if we need more research
        if not final_verification.get("needs_more_research", False):
            break

    # Phase 4: Synthesize
    final_synthesis = synthesize_research(final_verification, all_retrieval, task)

    return {
        "task": task,
        "plan": plan,
        "retrieval_count": len(all_retrieval),
        "verification": final_verification,
        "synthesis": final_synthesis,
        "iterations": iterations,
        "confidence": final_verification.get("overall_confidence", "unknown"),
        "gaps": final_verification.get("major_gaps", []),
    }


# ─── Quick Deep Research (lighter, for chat interface) ──────

def quick_deep_research(task: str, session_id: Optional[str] = None) -> str:
    """
    Lighter version for direct chat responses.
    Runs one iteration of plan → retrieve → verify → synthesize.
    """
    results = deep_research(task, session_id, max_iterations=1)
    return results["synthesis"]
