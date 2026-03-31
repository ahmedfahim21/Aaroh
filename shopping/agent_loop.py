"""AI-powered agentic shopping loop."""

import json
import logging
import os
from typing import Any, Callable

from google import genai
from google.genai import errors as gerrors
from google.genai import types as gtypes

from shopping.retry_utils import with_retry
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
    consumer_agent_id: str | None = None,
    agent_private_key: str | None = None,
) -> dict[str, Any]:
    """Drive AI through a full shopping task autonomously.

    Args:
        task:                Natural-language shopping instruction.
        available_merchants: List of {"name": str, "url": str} dicts the agent can shop at.
        agent_id:            EIP-8004 agentId to include in identity headers.
        emit:                Optional callback for real-time event streaming.
        consumer_agent_id:   UUID of consumer app Agent row — loads encrypted key server-side.
        agent_private_key:   Optional explicit key (e.g. demo / tests only).

    Returns:
        {"success": bool, "result": str, "order": dict | None}
    """
    from shopping.evm import agent_address  # late import — may raise if key not set
    from eth_account import Account as _Account

    from shopping.keys import load_agent_private_key as load_stored_agent_key

    def _emit(event: dict) -> None:
        if emit:
            emit(event)

    resolved_key: str | None = agent_private_key
    if consumer_agent_id and not resolved_key:
        resolved_key = load_stored_agent_key(consumer_agent_id)
        if not resolved_key:
            raise RuntimeError(
                f"No server-side key for agent id {consumer_agent_id!r}. "
                "Create the agent via POST /agents or set AGENT_PRIVATE_KEY for demo mode."
            )

    api_key = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set")
    client = genai.Client(api_key=api_key)
    pinned_urls = [str(m["url"]).strip() for m in (available_merchants or []) if m.get("url")]
    session = ShoppingSession(
        default_merchant_url=None,
        agent_id=agent_id,
        emit=emit,
        agent_private_key=resolved_key,
        extra_discovery_urls=pinned_urls or None,
    )

    if resolved_key:
        try:
            display_addr = _Account.from_key(resolved_key).address
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
        merchants_desc = (
            f"\n\nPreferred merchants (call discover_merchant with the correct URL first):\n{lines}"
        )
    else:
        merchants_desc = (
            "\n\nNo merchant URL was pinned in the UI. Do NOT ask the user for a URL. "
            "Start with list_merchants() to discover configured stores, or find_merchant(query) "
            "when the user names a store or category. Then call discover_merchant(url) before browsing. "
            "If the user message contains an explicit http(s) base URL, you may discover_merchant "
            "with that URL directly. If list_merchants reports missing configuration, say operators "
            "must set MERCHANT_URL and/or MERCHANT_URLS on the agent—do not ask the human for URLs."
        )

    base_system = (
        f"You are an autonomous shopping agent. Ethereum address: {display_addr} ({id_desc}). "
        "You hold USDC on Base Sepolia and pay for purchases autonomously via x402. "
        "Never ask the human for merchant URLs, missing info, or confirmation—only use tools and complete the task. "
        "Typical flow: list_merchants or find_merchant → discover_merchant → search/add_to_cart → "
        "checkout() → submit_payment. "
        "After a successful submit_payment, briefly summarise the purchase."
        f"{merchants_desc}"
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

    # Last successful submit_payment payload (includes order, tx_url, cart_summary, etc.)
    completed_purchase: dict[str, Any] | None = None

    for _ in range(20):
        _emit({"type": "thinking"})

        def _on_gemini_retry(attempt: int, exc: BaseException, delay_s: float) -> None:
            if isinstance(exc, gerrors.ClientError) and exc.code == 429:
                _emit(
                    {
                        "type": "thinking",
                        "text": f"Rate limited — retrying in {int(delay_s)}s",
                    }
                )
            else:
                _emit(
                    {
                        "type": "thinking",
                        "text": f"Transient API error — retrying in {delay_s:.1f}s",
                    }
                )

        def _generate() -> Any:
            return client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=gtypes.GenerateContentConfig(
                    system_instruction=system,
                    tools=gemini_tools,
                ),
            )

        response = with_retry(
            _generate,
            on_retry=_on_gemini_retry,
        )

        candidate = response.candidates[0]
        contents.append(gtypes.Content(role="model", parts=candidate.content.parts))

        fn_calls = [p for p in candidate.content.parts if p.function_call]

        if not fn_calls:
            text = " ".join(
                p.text for p in candidate.content.parts if hasattr(p, "text") and p.text
            )
            _emit({"type": "text", "text": text})
            return {"success": True, "result": text, "order": completed_purchase}

        response_parts: list[gtypes.Part] = []
        last_order = None

        for part in fn_calls:
            name = part.function_call.name
            args = dict(part.function_call.args)
            _emit({"type": "tool_call", "tool": name, "args": args})

            result_str = dispatch_tool(session, name, args)
            result_data: dict[str, Any] | None = None
            try:
                parsed_result = json.loads(result_str)
                if isinstance(parsed_result, dict) and "_ui" in parsed_result:
                    result_data = parsed_result
            except Exception:
                pass

            event_payload = {"type": "tool_result", "tool": name, "result": result_str[:600]}
            if result_data is not None:
                event_payload["result_data"] = result_data
            _emit(event_payload)

            response_parts.append(
                gtypes.Part.from_function_response(name=name, response={"result": result_str})
            )
            if name == "submit_payment":
                try:
                    data = json.loads(result_str)
                    if data.get("success") and isinstance(data, dict):
                        last_order = data.get("order")
                        completed_purchase = data
                except Exception:
                    pass

        contents.append(gtypes.Content(role="user", parts=response_parts))

        if last_order is not None:
            continue  # let Gemini produce a final summary

    return {"success": False, "result": "Agent loop exceeded max iterations.", "order": completed_purchase}
