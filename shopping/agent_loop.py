"""AI-powered agentic shopping loop."""

import json
import logging
import os
import time
from typing import Any, Callable

from google import genai
from google.genai import errors as gerrors
from google.genai import types as gtypes

from shopping.session import ShoppingSession
from shopping.tools import AGENT_TOOLS, dispatch_tool

log = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

EmitFn = Callable[[dict], None]


def run_shopping_agent(
    task: str,
    available_merchants: list[dict] | None = None,
    agent_id: int | None = None,
    emit: EmitFn | None = None,
    agent_private_key: str | None = None,
) -> dict[str, Any]:
    """Drive AI through a full shopping task autonomously.

    Args:
        task:                Natural-language shopping instruction.
        available_merchants: List of {"name": str, "url": str} dicts the agent can shop at.
        agent_id:            EIP-8004 agentId to include in identity headers.
        emit:                Optional callback for real-time event streaming.

    Returns:
        {"success": bool, "result": str, "order": dict | None}
    """
    from shopping.evm import agent_address  # late import — may raise if key not set
    from eth_account import Account as _Account

    def _emit(event: dict) -> None:
        if emit:
            emit(event)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    client = genai.Client(api_key=api_key)
    session = ShoppingSession(default_merchant_url=None, agent_id=agent_id, emit=emit, agent_private_key=agent_private_key)

    # Determine display address (prefer per-agent key, fall back to global env var)
    if agent_private_key:
        try:
            display_addr = _Account.from_key(agent_private_key).address
        except Exception:
            display_addr = "unknown"
    else:
        try:
            display_addr = agent_address()
        except RuntimeError:
            display_addr = "unknown"

    id_desc = f"EIP-8004 agentId={agent_id}" if agent_id is not None else "no on-chain identity"
    extra = os.environ.get("AGENT_INSTRUCTIONS", "").strip()

    merchants_desc = ""
    if available_merchants:
        lines = "\n".join(f"  - {m['name']}: {m['url']}" for m in available_merchants)
        merchants_desc = f"\n\nAvailable merchants (call discover_merchant with the URL first):\n{lines}"

    base_system = (
        f"You are an autonomous shopping agent. Ethereum address: {display_addr} ({id_desc}). "
        "You hold USDC on Ethereum Sepolia and pay for purchases autonomously via x402. "
        "Complete the shopping task efficiently: discover the right merchant, find the product, "
        "add it to cart, and call checkout_and_pay. Do not ask for confirmation — just execute. "
        f"After a successful checkout, briefly summarise the purchase.{merchants_desc}"
    )
    system = f"{base_system}\n\n{extra}" if extra else base_system

    function_declarations = [
        gtypes.FunctionDeclaration(
            name=t["name"],
            description=t["description"],
            parameters=t["input_schema"],
        )
        for t in AGENT_TOOLS
    ]
    gemini_tools = [gtypes.Tool(function_declarations=function_declarations)]

    contents: list[gtypes.Content] = [
        gtypes.Content(role="user", parts=[gtypes.Part(text=task)])
    ]

    for _ in range(20):
        _emit({"type": "thinking"})
        for attempt in range(4):
            try:
                response = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=gtypes.GenerateContentConfig(
                        system_instruction=system,
                        tools=gemini_tools,
                    ),
                )
                break
            except gerrors.ClientError as e:
                if e.code == 429 and attempt < 3:
                    # Parse retryDelay from error details if available
                    retry_delay = 60
                    try:
                        details = e.details.get("error", {}).get("details", [])
                        for d in details:
                            if d.get("@type", "").endswith("RetryInfo"):
                                delay_str = d.get("retryDelay", "60s")
                                retry_delay = int(delay_str.rstrip("s")) + 2
                                break
                    except Exception:
                        pass
                    _emit({"type": "thinking", "text": f"Rate limited — retrying in {retry_delay}s"})
                    log.warning("429 rate limit hit, retrying in %ds", retry_delay)
                    time.sleep(retry_delay)
                else:
                    raise

        candidate = response.candidates[0]
        contents.append(gtypes.Content(role="model", parts=candidate.content.parts))

        fn_calls = [p for p in candidate.content.parts if p.function_call]

        if not fn_calls:
            text = " ".join(
                p.text for p in candidate.content.parts if hasattr(p, "text") and p.text
            )
            _emit({"type": "text", "text": text})
            return {"success": True, "result": text, "order": None}

        response_parts: list[gtypes.Part] = []
        last_order = None

        for part in fn_calls:
            name = part.function_call.name
            args = dict(part.function_call.args)
            _emit({"type": "tool_call", "tool": name, "args": args})

            result_str = dispatch_tool(session, name, args)
            _emit({"type": "tool_result", "tool": name, "result": result_str[:600]})

            response_parts.append(
                gtypes.Part.from_function_response(name=name, response={"result": result_str})
            )
            if name == "checkout_and_pay":
                try:
                    data = json.loads(result_str)
                    if data.get("success"):
                        last_order = data.get("order")
                except Exception:
                    pass

        contents.append(gtypes.Content(role="user", parts=response_parts))

        if last_order is not None:
            continue  # let Gemini produce a final summary

    return {"success": False, "result": "Agent loop exceeded max iterations.", "order": None}
