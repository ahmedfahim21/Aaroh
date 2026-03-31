"""Gemini tool definitions and dispatcher shared by agent.py and mcp_client.py."""

import json
from typing import Any

from shopping.merchant_discovery import find_merchant_json, list_merchants_json
from shopping.session import ShoppingSession

# ── Tool schema lists ─────────────────────────────────────────────────────────

# Tools available to the autonomous agent
AGENT_TOOLS: list[dict] = [
    {
        "name": "list_merchants",
        "description": (
            "List UCP merchants reachable from MERCHANT_URL / MERCHANT_URLS in the environment, "
            "plus any base URLs pinned for this task (dispatch). "
            "Probes each base URL for /.well-known/ucp. Optional category filters product_categories."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional: substring match on merchant product_categories",
                },
            },
        },
    },
    {
        "name": "find_merchant",
        "description": (
            "Find merchants by name or product category substring; if exactly one match, "
            "connects automatically. If zero or multiple matches, use discover_merchant(url) "
            "with a URL from the response."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "e.g. store name or category keyword"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "discover_merchant",
        "description": (
            "Connect to a UCP merchant by base URL (fetch /.well-known/ucp). "
            "Call after list_merchants or when you already know the URL. "
            "Required before browse/search/cart/checkout if not yet connected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "merchant_url": {
                    "type": "string",
                    "description": "Merchant base URL without trailing slash",
                }
            },
            "required": ["merchant_url"],
        },
    },
    {
        "name": "browse_categories",
        "description": "List product categories from the connected merchant.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_products",
        "description": "Search products by keyword and/or category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword search"},
                "category": {"type": "string", "description": "Filter by category"},
            },
        },
    },
    {
        "name": "get_product",
        "description": "Get full details for a product by ID.",
        "input_schema": {
            "type": "object",
            "properties": {"product_id": {"type": "string"}},
            "required": ["product_id"],
        },
    },
    {
        "name": "add_to_cart",
        "description": "Add a product to the cart.",
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string"},
                "quantity": {"type": "integer", "default": 1},
            },
            "required": ["product_id"],
        },
    },
    {
        "name": "view_cart",
        "description": "Show current cart contents and total.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "checkout",
        "description": (
            "Create a checkout session and retrieve x402 payment requirements (HTTP 402) from the merchant. "
            "Returns pay_to, amount in micro-USDC, and checkout_session_id. "
            "You MUST then call submit_payment with that checkout_session_id to sign and pay."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "submit_payment",
        "description": (
            "Sign the x402 EIP-3009 USDC authorization with the agent wallet and complete checkout. "
            "Call only after checkout() returned payment requirements."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "checkout_session_id": {
                    "type": "string",
                    "description": "checkout_session_id from the prior checkout() tool result",
                },
            },
            "required": ["checkout_session_id"],
        },
    },
    {
        "name": "verify_transaction",
        "description": (
            "Verify a Base Sepolia transaction by hash using eth_getTransactionReceipt. "
            "Use after submit_payment to confirm settlement."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tx_hash": {"type": "string", "description": "0x-prefixed transaction hash"},
            },
            "required": ["tx_hash"],
        },
    },
    {
        "name": "check_agent_reputation",
        "description": (
            "Read ERC-8004 ReputationRegistry summary for an agent identity. "
            "Useful before transacting with unknown counterparties."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "integer", "description": "EIP-8004 agent ID"},
                "tag1": {"type": "string", "description": "Primary tag", "default": "starred"},
                "tag2": {"type": "string", "description": "Secondary tag", "default": "session"},
            },
            "required": ["agent_id"],
        },
    },
]


def dispatch_tool(session: ShoppingSession, tool_name: str, tool_input: dict[str, Any]) -> str:
    """Route a tool call to the appropriate ShoppingSession method."""
    match tool_name:
        case "list_merchants":
            return list_merchants_json(
                tool_input.get("category") or None,
                connected_base_url=session.merchant_base_url,
                extra_base_urls=session.extra_discovery_urls,
            )
        case "find_merchant":
            return find_merchant_json(
                tool_input["query"],
                lambda url: session.discover_merchant(url),
                connected_base_url=session.merchant_base_url,
                extra_base_urls=session.extra_discovery_urls,
            )
        case "discover_merchant":
            return session.discover_merchant(tool_input["merchant_url"])
        case "browse_categories":
            return session.browse_categories()
        case "search_products":
            return session.search_products(
                query=tool_input.get("query", ""),
                category=tool_input.get("category"),
            )
        case "get_product":
            return session.get_product(tool_input["product_id"])
        case "add_to_cart":
            return session.add_to_cart(tool_input["product_id"], int(tool_input.get("quantity", 1)))
        case "view_cart":
            return session.view_cart()
        case "checkout":
            return session.autonomous_checkout_request_payment()
        case "submit_payment":
            return session.submit_payment(tool_input["checkout_session_id"])
        case "verify_transaction":
            return session.verify_transaction(tool_input["tx_hash"])
        case "check_agent_reputation":
            return session.check_agent_reputation(
                int(tool_input["agent_id"]),
                str(tool_input.get("tag1", "starred")),
                str(tool_input.get("tag2", "session")),
            )
        case _:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
