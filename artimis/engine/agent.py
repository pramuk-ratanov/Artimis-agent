"""
Artimis Agent — Core Agent Loop
OpenAI-compatible API client with tool calling. Works with DeepSeek, OpenAI, Anthropic, and any compatible provider.
"""

import json
import os
import logging
from typing import Optional
from datetime import datetime

from openai import OpenAI

from artimis.engine.system_prompt import SYSTEM_PROMPT
from artimis.engine.tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger("artimis.agent")

# Load env vars from ~/.hermes/.env if it exists
_ENV_FILE = os.path.expanduser("~/.hermes/.env")
if os.path.exists(_ENV_FILE):
    with open(_ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and val and key not in os.environ:
                    os.environ[key] = val

# Default model
DEFAULT_MODEL = os.getenv("ARTIMIS_MODEL", "deepseek-v4-pro")


def _get_client() -> OpenAI:
    """Get an OpenAI-compatible client using available API keys."""
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if deepseek_key:
        return OpenAI(api_key=deepseek_key, base_url="https://api.deepseek.com/v1")

    if openai_key:
        return OpenAI(api_key=openai_key)

    if anthropic_key:
        return OpenAI(
            api_key=anthropic_key,
            base_url="https://openrouter.ai/api/v1"
        )

    raise RuntimeError(
        "No API key found. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
    )


def run_agent(
    user_message: str,
    session_id: Optional[str] = None,
    model: Optional[str] = None,
    conversation_history: Optional[list] = None,
    max_iterations: int = 10,
) -> dict:
    """
    Run the Artimis agent loop.

    Args:
        user_message: The user's message.
        session_id: The session ID for context injection.
        model: Override the default model.
        conversation_history: Previous messages to include for context.
        max_iterations: Maximum tool-calling iterations.

    Returns:
        dict with keys: response, tool_calls_made, iterations, model_used
    """
    client = _get_client()
    model_name = model or DEFAULT_MODEL

    # Build messages array
    messages = []

    # System prompt
    system_content = SYSTEM_PROMPT

    # Inject Brain context (relevant memories + skills)
    if session_id:
        try:
            from artimis.engine.brain import process_user_message
            brain_context = process_user_message(session_id, user_message)
            if brain_context:
                system_content += brain_context
        except Exception:
            pass  # Brain injection is best-effort

    messages.append({"role": "system", "content": system_content})

    # Add conversation history if provided
    if conversation_history:
        messages.extend(conversation_history)

    # Add the user message
    messages.append({"role": "user", "content": user_message})

    tool_calls_made = 0

    # Agent loop
    for iteration in range(max_iterations):
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return {
                "response": f"I encountered an error: {str(e)}",
                "tool_calls_made": tool_calls_made,
                "iterations": iteration,
                "model_used": model_name,
                "error": str(e),
            }

        choice = response.choices[0]
        msg = choice.message

        # If the model wants to call tools
        if msg.tool_calls:
            # Add the assistant message with tool calls
            assistant_msg = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_msg)

            # Execute each tool
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info(f"Tool call: {tool_name}({json.dumps(tool_args)[:200]})")
                result = execute_tool(tool_name, tool_args)
                tool_calls_made += 1

                # Add tool result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

            continue  # Loop back to LLM with tool results

        # If the model responded with text (no tool calls)
        response_text = msg.content or ""

        # Intelligence checks (best-effort, don't block on failures)
        intelligence_notes = []
        try:
            from artimis.engine.intelligence import check_format, self_critique, detect_drift
            fmt = check_format(user_message, response_text)
            if fmt:
                intelligence_notes.append(f"Format note: {fmt['why']}")

            critique = self_critique(user_message, response_text)
            if not critique["passed"]:
                issues = [i["check"] for i in critique["issues"]]
                intelligence_notes.append(f"Quality notes: {', '.join(issues)}")

            drift = detect_drift(user_message)
            if drift:
                intelligence_notes.append(f"Drift note: {drift}")
        except Exception:
            pass

        return {
            "response": response_text,
            "tool_calls_made": tool_calls_made,
            "iterations": iteration + 1,
            "model_used": model_name,
            "intelligence": intelligence_notes if intelligence_notes else None,
        }

    # Max iterations reached
    return {
        "response": "I reached the maximum number of steps without completing the task. Can you simplify or clarify what you need?",
        "tool_calls_made": tool_calls_made,
        "iterations": max_iterations,
        "model_used": model_name,
    }
