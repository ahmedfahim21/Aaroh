"""Gemini tool definitions and dispatcher shared by agent.py and mcp_client.py."""

import json
from typing import Any

from shopping.session import ShoppingSession

# ── Tool schema lists ─────────────────────────────────────────────────────────

# Tools available to the autonomous agent
AGENT_TOOLS: list[dict] = [
    {
        "name": "discover_merchant",
        "description": "Connect to a UCP merchant by URL. Call this first before browsing or buying.",
        "input_schema": {
            "type": "object",
            "properties": {
                "merchant_url": {"type": "string", "description": "Merchant base URL, e.g. http://localhost:8000"}
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
        "name": "checkout_and_pay",
        "description": (
            "Create a checkout session and autonomously pay via x402 (EIP-3009 USDC on Base Sepolia). "
            "The agent signs with its EIP-8004 identity wallet — no human needed. "
            "Call this once the cart has all desired items."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def dispatch_tool(session: ShoppingSession, tool_name: str, tool_input: dict[str, Any]) -> str:
    """Route a tool call to the appropriate ShoppingSession method."""
    match tool_name:
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
        case "checkout_and_pay":
            return session.checkout_and_pay()
        case _:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
