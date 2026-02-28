#!/usr/bin/env python3
"""
MCP shopping client: discover any UCP merchant and browse, cart, checkout via tools.

Set MERCHANT_URL to connect to a merchant, or use discover_merchant(url) first.
"""

import json
import os
import uuid
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "Artisan Commerce",
    instructions="Shopping assistant for UCP merchants. Discover a merchant first, then browse and shop.",
)

# Module-level state: connected merchant and cart
_merchant_base_url: str | None = os.environ.get("MERCHANT_URL", "").rstrip("/") or None
_merchant_profile: dict[str, Any] | None = None
_cart: list[dict[str, Any]] = []  # [{ "product_id", "title", "price", "quantity" }]
_checkout_session_id: str | None = None


def _auto_discover():
    """Auto-discover merchant if MERCHANT_URL is set."""
    global _merchant_profile
    if _merchant_base_url and not _merchant_profile:
        try:
            with httpx.Client(timeout=10.0) as client:
                r = client.get(f"{_merchant_base_url}/.well-known/ucp")
                r.raise_for_status()
                _merchant_profile = r.json()
        except Exception:
            pass  # Will be fetched on first explicit call


def _require_merchant() -> dict[str, Any] | None:
    """Returns error dict if no merchant; None if OK."""
    if not _merchant_base_url:
        return {
            "error": "No merchant connected. Use discover_merchant(url) first, or set the MERCHANT_URL environment variable."
        }
    # Auto-discover profile if not already fetched
    _auto_discover()
    return None


def _ucp_headers() -> dict[str, str]:
    return {
        "UCP-Agent": 'profile="https://agent.example/mcp-commerce"',
        "Request-Signature": "mcp-demo",
        "Idempotency-Key": str(uuid.uuid4()),
        "Request-Id": str(uuid.uuid4()),
        "Content-Type": "application/json",
    }


# ---- Tools ----


@mcp.tool()
def discover_merchant(merchant_url: str) -> str:
    """Connect to a UCP merchant by URL. Fetches /.well-known/ucp and stores the merchant for browsing and checkout.

    Call this first with the merchant's base URL (e.g. http://localhost:8000).
    """
    global _merchant_base_url, _merchant_profile
    url = merchant_url.rstrip("/")
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{url}/.well-known/ucp")
            r.raise_for_status()
            _merchant_profile = r.json()
            _merchant_base_url = url
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Failed to discover merchant at {url}: {e}"})
    cap = _merchant_profile.get("ucp", {}).get("capabilities", [])
    handlers = _merchant_profile.get("payment", {}).get("handlers", [])
    name = _merchant_profile.get("merchant", {}).get("name", "Merchant")
    categories = _merchant_profile.get("merchant", {}).get("product_categories", "")
    return json.dumps({
        "success": True,
        "merchant": {
            "name": name,
            "base_url": _merchant_base_url,
            "capabilities": [c.get("name", "") for c in cap],
            "payment_handlers": [h.get("id", "") for h in handlers],
            "product_categories": categories or None,
        },
        "message": "You can now use browse_categories, search_products, get_product, add_to_cart, etc.",
    })


@mcp.tool()
def browse_categories() -> str:
    """List product categories and counts from the connected merchant (from /catalogue)."""
    err = _require_merchant()
    if err:
        return json.dumps(err)
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{_merchant_base_url}/catalogue")
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Failed to load catalogue: {e}"})
    products = data.get("products", [])
    by_cat: dict[str, int] = {}
    for p in products:
        cat = p.get("category") or "general"
        by_cat[cat] = by_cat.get(cat, 0) + 1
    categories = [{"name": c, "count": by_cat[c]} for c in sorted(by_cat.keys())]
    return json.dumps({"categories": categories} if categories else {"categories": [], "message": "No categories found."})


@mcp.tool()
def search_products(query: str = "", category: str | None = None) -> str:
    """Search products by keyword and optional category. Returns product list as JSON."""
    err = _require_merchant()
    if err:
        return json.dumps(err)
    params: dict[str, str] = {}
    if query:
        params["q"] = query
    if category:
        params["category"] = category
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{_merchant_base_url}/products", params=params)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Search failed: {e}"})
    items = data.get("products", [])
    if not items:
        return json.dumps({"_ui": {"type": "product-grid"}, "products": [], "message": "No products found."})
    products = []
    for p in items:
        products.append({
            "id": p["id"],
            "title": p["title"],
            "price": p["price"],
            "price_rs": p["price"] / 100,
            "category": p.get("category"),
            "origin_state": p.get("origin_state"),
            "artisan_name": p.get("artisan_name"),
            "image_url": p.get("image_url"),
            "description": (p.get("description") or "")[:200],
        })
    return json.dumps({"_ui": {"type": "product-grid"}, "products": products})


@mcp.tool()
def get_product(product_id: str) -> str:
    """Get full product details by ID."""
    err = _require_merchant()
    if err:
        return json.dumps(err)
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{_merchant_base_url}/products/{product_id}")
            r.raise_for_status()
            p = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Product not found or error: {e}"})
    return json.dumps({
        "_ui": {"type": "product-detail"},
        "product": {
            "id": p["id"],
            "title": p["title"],
            "price": p["price"],
            "price_rs": p["price"] / 100,
            "category": p.get("category"),
            "origin_state": p.get("origin_state"),
            "artisan_name": p.get("artisan_name"),
            "image_url": p.get("image_url"),
            "description": p.get("description"),
        },
    })


@mcp.tool()
def add_to_cart(product_id: str, quantity: int = 1) -> str:
    """Add a product to the cart. Use the product ID from search or get_product."""
    err = _require_merchant()
    if err:
        return json.dumps(err)
    if quantity < 1:
        return json.dumps({"error": "Quantity must be at least 1."})
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{_merchant_base_url}/products/{product_id}")
            r.raise_for_status()
            p = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Product not found: {e}"})
    for item in _cart:
        if item["product_id"] == product_id:
            item["quantity"] += quantity
            return view_cart()
    _cart.append({
        "product_id": p["id"],
        "title": p["title"],
        "price": p["price"],
        "quantity": quantity,
    })
    return view_cart()


@mcp.tool()
def view_cart() -> str:
    """Show current cart with line items and totals."""
    if not _cart:
        return json.dumps({"_ui": {"type": "cart"}, "items": [], "total_paise": 0, "message": "Your cart is empty."})
    total_paise = 0
    items = []
    for item in _cart:
        line_total = item["price"] * item["quantity"]
        total_paise += line_total
        items.append({
            "product_id": item["product_id"],
            "title": item["title"],
            "quantity": item["quantity"],
            "price_paise": item["price"],
            "line_total_paise": line_total,
        })
    return json.dumps({"_ui": {"type": "cart"}, "items": items, "total_paise": total_paise})


@mcp.tool()
def update_cart(product_id: str, quantity: int) -> str:
    """Update quantity for a product in the cart. Use 0 to remove."""
    for i, item in enumerate(_cart):
        if item["product_id"] == product_id:
            if quantity <= 0:
                _cart.pop(i)
            else:
                item["quantity"] = quantity
            return view_cart()
    return json.dumps({"error": f"Product {product_id!r} not in cart."})


@mcp.tool()
def remove_from_cart(product_id: str) -> str:
    """Remove a product from the cart."""
    return update_cart(product_id, 0)


def _build_create_payload() -> dict[str, Any]:
    handlers = (_merchant_profile or {}).get("payment", {}).get("handlers", [])
    if not handlers:
        handlers = [{"id": "evm", "name": "org.ethereum.evm", "version": "2026-01-11", "config": {}}]
    line_items = [
        {
            "item": {"id": item["product_id"], "title": item["title"], "price": item["price"]},
            "quantity": item["quantity"],
        }
        for item in _cart
    ]
    # Fulfillment: default Indian address and standard shipping so complete can succeed
    fulfillment = {
        "methods": [
            {
                "type": "shipping",
                "destinations": [
                    {
                        "id": "dest_1",
                        "street_address": "123 Demo St",
                        "address_locality": "Mumbai",
                        "address_region": "MH",
                        "postal_code": "400001",
                        "address_country": "IN",
                    }
                ],
                "selected_destination_id": "dest_1",
                "groups": [
                    {
                        "id": "group_1",
                        "line_item_ids": [],
                        "options": [
                            {"id": "std-in", "title": "Standard Shipping (India)", "totals": [{"type": "total", "amount": 5000}]}
                        ],
                        "selected_option_id": "std-in",
                    }
                ],
            }
        ]
    }
    return {
        "currency": "INR",
        "line_items": line_items,
        "payment": {
            "handlers": handlers,
            "instruments": [],
            "selected_instrument_id": None,
        },
        "fulfillment": fulfillment,
    }


@mcp.tool()
def checkout() -> str:
    """Create a checkout session and return the merchant EVM wallet address and order total for payment."""
    err = _require_merchant()
    if err:
        return json.dumps(err)
    if not _cart:
        return json.dumps({"error": "Cart is empty. Add items first."})
    global _checkout_session_id
    payload = _build_create_payload()
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                f"{_merchant_base_url}/checkout-sessions",
                json=payload,
                headers=_ucp_headers(),
            )
            r.raise_for_status()
            checkout_data = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Checkout failed: {e}"})
    _checkout_session_id = checkout_data.get("id")
    totals = checkout_data.get("totals", [])
    total_amount = 0
    for t in totals:
        if t.get("type") == "total":
            total_amount = t.get("amount", 0)
            break
    handlers = (_merchant_profile or {}).get("payment", {}).get("handlers", [])
    wallet_address = None
    for h in handlers:
        if h.get("id") == "evm" and isinstance(h.get("config"), dict):
            wallet_address = h["config"].get("wallet_address", wallet_address)
    return json.dumps({
        "_ui": {"type": "checkout"},
        "checkout_session_id": _checkout_session_id,
        "order_total": total_amount,
        "wallet_address": wallet_address,
        "message": "Send payment to the wallet address above.",
    })


if __name__ == "__main__":
    mcp.run(transport="stdio")
