#!/usr/bin/env python3
"""
MCP shopping client: discover any UCP merchant and browse, cart, checkout via tools.

Set MERCHANT_URL to connect to a merchant, or use discover_merchant(url) first.

Checkout flow (x402 crypto payments):
  1. checkout()                  – creates a session; returns wallet_address + order_total
  2. <user signs x402 payment>   – user signs an EIP-3009 USDC authorisation in their wallet
                                   and provides the base64 X-PAYMENT string
  3. complete_checkout(x_payment) – posts the signed payment; returns order confirmation
"""

import base64
import concurrent.futures
import json
import os
import re
import time
import uuid
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "Aaroh",
    instructions="Shopping assistant for UCP merchants. Discover a merchant first, then browse and shop.",
)

# Module-level state: connected merchant and cart
_merchant_base_url: str | None = os.environ.get("MERCHANT_URL", "").rstrip("/") or None
_merchant_profile: dict[str, Any] | None = None
_cart: list[dict[str, Any]] = []  # [{ "product_id", "title", "price", "quantity" }]
_checkout_session_id: str | None = None

# NEAR configuration for cart persistence
_near_account_id: str | None = os.environ.get("NEAR_ACCOUNT_ID")
_near_network: str = os.environ.get("NEAR_NETWORK", "testnet")
_near_rpc_url: str = (
    "https://rpc.mainnet.near.org" if _near_network == "mainnet"
    else "https://rpc.testnet.near.org"
)


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


def _sync_cart_to_near() -> dict[str, Any] | None:
    """Sync current cart to NEAR storage. Returns error dict if fails, None if success."""
    if not _near_account_id:
        return None  # Silently skip if NEAR not configured

    if not _cart:
        # Empty cart - still sync to clear on NEAR
        cart_data = {
            "items": [],
            "merchant_url": _merchant_base_url or "",
            "updated_at": int(time.time() * 1_000_000_000),  # nanoseconds
        }
    else:
        # Format cart items for NEAR contract
        cart_data = {
            "items": [
                {
                    "product_id": item["product_id"],
                    "quantity": item["quantity"],
                    "merchant_name": _merchant_profile.get("merchant", {}).get("name", "") if _merchant_profile else "",
                    "title": item.get("title", ""),
                    "price": item.get("price", 0.0),
                }
                for item in _cart
            ],
            "merchant_url": _merchant_base_url or "",
            "updated_at": int(time.time() * 1_000_000_000),
        }

    # Call NEAR contract via JSON-RPC
    # Use NEAR_CONTRACT_ID if set, otherwise default to account_id
    contract_id = os.environ.get("NEAR_CONTRACT_ID", _near_account_id)

    rpc_payload = {
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract_id,
            "method_name": "save_cart",
            "args_base64": base64.b64encode(
                json.dumps({"cart": cart_data}).encode()
            ).decode(),
        },
    }

    try:
        timeout = httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0)
        with httpx.Client(timeout=timeout) as client:
            response = client.post(_near_rpc_url, json=rpc_payload)
            response.raise_for_status()
            result = response.json()

            if "error" in result:
                return {
                    "error": f"NEAR RPC error: {result['error'].get('message', 'Unknown error')}"
                }

            return None  # Success

    except Exception as e:
        # Log but don't fail the cart operation
        print(f"Warning: Failed to sync cart to NEAR: {e}")
        return None  # Don't propagate NEAR errors to user


def _restore_cart_from_near() -> dict[str, Any] | None:
    """Restore cart from NEAR storage. Returns cart data or None."""
    if not _near_account_id:
        return None

    # Use NEAR_CONTRACT_ID if set, otherwise default to account_id
    contract_id = os.environ.get("NEAR_CONTRACT_ID", _near_account_id)

    rpc_payload = {
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract_id,
            "method_name": "get_cart",
            "args_base64": base64.b64encode(b"{}").decode(),
        },
    }

    try:
        timeout = httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0)
        with httpx.Client(timeout=timeout) as client:
            response = client.post(_near_rpc_url, json=rpc_payload)
            response.raise_for_status()
            result = response.json()

            if "error" in result:
                return None

            # Decode result from base64
            result_bytes = base64.b64decode(result["result"]["result"])
            cart_data = json.loads(result_bytes.decode())

            return cart_data if cart_data else None

    except Exception as e:
        print(f"Warning: Failed to restore cart from NEAR: {e}")
        return None


def _probe_merchant(url: str) -> dict[str, Any] | None:
    """Probe a single URL for a UCP discovery profile. Returns None on any failure.

    Uses aggressive timeouts (connect=1s, read=3s) so parallel port scanning
    across 10 candidates completes in at most ~3 seconds wall-clock time.
    """
    url = url.rstrip("/")
    try:
        timeout = httpx.Timeout(connect=1.0, read=3.0, write=1.0, pool=1.0)
        with httpx.Client(timeout=timeout) as client:
            r = client.get(f"{url}/.well-known/ucp")
            r.raise_for_status()
            profile = r.json()
    except Exception:
        return None
    # Must look like a UCP profile — avoids false positives from other HTTP services
    if not isinstance(profile.get("ucp"), dict):
        return None
    merchant = profile.get("merchant") or {}
    cats_raw: str = merchant.get("product_categories", "") or ""
    categories = [c.strip() for c in cats_raw.split(",") if c.strip()]
    handlers = profile.get("payment", {}).get("handlers", [])
    return {
        "name": merchant.get("name", url),
        "url": url,
        "product_categories": categories,
        "payment_handler_ids": [h.get("id", "") for h in handlers if h.get("id")],
    }


def _candidate_urls() -> list[str]:
    """Build the deduplicated list of merchant URLs to probe.

    Sources (in priority order):
    1. MERCHANT_URLS env var — comma/space-separated base URLs
    2. Fallback: localhost:8000–8009
    Always includes the currently connected merchant (_merchant_base_url) if set.
    """
    raw_env = os.environ.get("MERCHANT_URLS", "").strip()
    if raw_env:
        urls = [u.rstrip("/") for u in re.split(r"[,\s]+", raw_env) if u.strip()]
    else:
        urls = [f"http://localhost:{port}" for port in range(8000, 8010)]
    url_set: set[str] = set(urls)
    if _merchant_base_url:
        url_set.add(_merchant_base_url.rstrip("/"))
    return list(url_set)


# ---- Tools ----


@mcp.tool()
def discover_merchant(merchant_url: str) -> str:
    """Connect to a UCP merchant by URL. Fetches /.well-known/ucp and stores the merchant for browsing and checkout.

    Call this first with the merchant's base URL (e.g. http://localhost:8000).
    """
    global _merchant_base_url, _merchant_profile, _cart
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

    # Automatically restore cart from NEAR if configured and cart is empty
    restored_items = 0
    if _near_account_id and not _cart:
        cart_data = _restore_cart_from_near()
        if cart_data and cart_data.get("items"):
            # Restore cart items
            for item in cart_data["items"]:
                _cart.append({
                    "product_id": item["product_id"],
                    "title": item.get("title", ""),
                    "price": item.get("price", 0.0),
                    "quantity": item["quantity"],
                })
            restored_items = len(_cart)

    response = {
        "success": True,
        "merchant": {
            "name": name,
            "base_url": _merchant_base_url,
            "capabilities": [c.get("name", "") for c in cap],
            "payment_handlers": [h.get("id", "") for h in handlers],
            "product_categories": categories or None,
        },
        "message": "You can now use browse_categories, search_products, get_product, add_to_cart, etc.",
    }

    if restored_items > 0:
        response["cart_restored"] = True
        response["restored_items"] = restored_items
        response["message"] += f" (Restored {restored_items} item(s) from your previous session)"

    return json.dumps(response)


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
            "price_usd": p["price"] / 100,
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
            "price_usd": p["price"] / 100,
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
            # Sync to NEAR after cart modification
            _sync_cart_to_near()
            return view_cart()
    _cart.append({
        "product_id": p["id"],
        "title": p["title"],
        "price": p["price"],
        "quantity": quantity,
    })
    # Sync to NEAR after cart modification
    _sync_cart_to_near()
    return view_cart()


@mcp.tool()
def view_cart() -> str:
    """Show current cart with line items and totals."""
    if not _cart:
        return json.dumps({"_ui": {"type": "cart"}, "items": [], "total_cents": 0, "message": "Your cart is empty."})
    total_cents = 0
    items = []
    for item in _cart:
        line_total = item["price"] * item["quantity"]
        total_cents += line_total
        items.append({
            "product_id": item["product_id"],
            "title": item["title"],
            "quantity": item["quantity"],
            "price_cents": item["price"],
            "line_total_cents": line_total,
        })
    return json.dumps({"_ui": {"type": "cart"}, "items": items, "total_cents": total_cents})


@mcp.tool()
def update_cart(product_id: str, quantity: int) -> str:
    """Update quantity for a product in the cart. Use 0 to remove."""
    for i, item in enumerate(_cart):
        if item["product_id"] == product_id:
            if quantity <= 0:
                _cart.pop(i)
            else:
                item["quantity"] = quantity
            # Sync to NEAR after cart modification
            _sync_cart_to_near()
            return view_cart()
    return json.dumps({"error": f"Product {product_id!r} not in cart."})


@mcp.tool()
def remove_from_cart(product_id: str) -> str:
    """Remove a product from the cart."""
    return update_cart(product_id, 0)


@mcp.tool()
def restore_cart_from_near() -> str:
    """Restore cart from NEAR blockchain storage. Useful if you want to recover your cart from a previous session."""
    global _cart

    if not _near_account_id:
        return json.dumps({
            "error": "NEAR not configured. Set NEAR_ACCOUNT_ID environment variable.",
            "current_cart": _cart,
        })

    cart_data = _restore_cart_from_near()

    if not cart_data or not cart_data.get("items"):
        return json.dumps({
            "message": "No cart found in NEAR storage.",
            "current_cart": _cart,
        })

    # Restore cart items from NEAR
    _cart.clear()
    for item in cart_data["items"]:
        _cart.append({
            "product_id": item["product_id"],
            "title": item.get("title", ""),
            "price": item.get("price", 0.0),
            "quantity": item["quantity"],
        })

    return json.dumps({
        "success": True,
        "message": f"Restored {len(_cart)} item(s) from NEAR storage.",
        "merchant_url": cart_data.get("merchant_url", ""),
        "cart": _cart,
    })


@mcp.tool()
def list_merchants(category: str | None = None) -> str:
    """Discover running UCP merchants without knowing their URLs upfront.

    Reads MERCHANT_URLS environment variable (comma- or space-separated base URLs).
    If not set, scans localhost ports 8000–8009. Also includes the currently
    connected merchant if one is active.

    Args:
        category: Optional keyword filter. Only merchants whose product_categories
                  contains this substring (case-insensitive) are returned.
                  Pass None to list all discovered merchants.
    """
    urls = _candidate_urls()
    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(len(urls), 1)) as pool:
        for result in pool.map(_probe_merchant, urls):
            if result is not None:
                results.append(result)

    if category:
        q = category.lower()
        results = [r for r in results if q in ", ".join(r["product_categories"]).lower()]

    results.sort(key=lambda r: r["name"].lower())

    response: dict[str, Any] = {"merchants": results, "count": len(results)}
    if category:
        response["filtered_by"] = category
    if not results:
        response["message"] = (
            f"No merchants found matching '{category}'."
            if category
            else "No running UCP merchants found. Set MERCHANT_URLS or start a merchant server on localhost:8000–8009."
        )
    return json.dumps(response)


@mcp.tool()
def find_merchant(query: str) -> str:
    """Find and auto-connect to a UCP merchant by name or product category.

    Probes all known/configured merchant URLs (same as list_merchants) and
    matches the query against both merchant name and product categories
    (case-insensitive substring).

    - Exactly 1 match: auto-connects via discover_merchant(url).
    - 0 matches: returns error with all discovered merchants listed.
    - 2+ matches: returns the ambiguous list; use discover_merchant(url) to pick one.

    Args:
        query: Search term, e.g. "candles", "artisan", "home decor".
    """
    urls = _candidate_urls()
    all_results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(len(urls), 1)) as pool:
        for result in pool.map(_probe_merchant, urls):
            if result is not None:
                all_results.append(result)
    all_results.sort(key=lambda r: r["name"].lower())

    q = query.lower()
    matches = [
        r for r in all_results
        if q in r["name"].lower() or q in ", ".join(r["product_categories"]).lower()
    ]

    if len(matches) == 1:
        return discover_merchant(matches[0]["url"])

    def _slim(r: dict[str, Any]) -> dict[str, Any]:
        return {"name": r["name"], "url": r["url"], "product_categories": r["product_categories"]}

    if len(matches) == 0:
        return json.dumps({
            "error": f"No merchants found matching '{query}'.",
            "all_merchants": [_slim(r) for r in all_results],
            "suggestion": "Call discover_merchant(url) with a URL above, or try list_merchants().",
        })

    return json.dumps({
        "error": f"Multiple merchants match '{query}'. Please choose one.",
        "matches": [_slim(r) for r in matches],
        "suggestion": "Call discover_merchant(url) with the URL of your preferred merchant.",
    })


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
    # Fulfillment: placeholder address and standard shipping so complete can succeed
    fulfillment = {
        "methods": [
            {
                "type": "shipping",
                "destinations": [
                    {
                        "id": "dest_1",
                        "street_address": "123 Demo St",
                        "address_locality": "Anytown",
                        "address_region": "CA",
                        "postal_code": "90210",
                        "address_country": "US",
                    }
                ],
                "selected_destination_id": "dest_1",
                "groups": [
                    {
                        "id": "group_1",
                        "line_item_ids": [],
                        "options": [
                            {"id": "std", "title": "Standard Shipping", "totals": [{"type": "total", "amount": 500}]}
                        ],
                        "selected_option_id": "std",
                    }
                ],
            }
        ]
    }
    return {
        "currency": "USD",
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
        "message": (
            "Sign an EIP-3009 USDC authorisation in your EVM wallet for the amount above, "
            "then call complete_checkout(x_payment) with the resulting base64 X-PAYMENT string."
        ),
    })


@mcp.tool()
def complete_checkout(x_payment: str) -> str:
    """Complete the checkout by submitting a signed x402 EIP-3009 payment proof.

    After checkout() returns the wallet_address and order_total, the user signs a USDC
    EIP-3009 authorisation in their EVM wallet and receives a base64 X-PAYMENT string.
    Pass that string here to finalise the order.

    x_payment: base64-encoded X-PAYMENT value produced by the user's EVM wallet.
    """
    err = _require_merchant()
    if err:
        return json.dumps(err)
    if not _checkout_session_id:
        return json.dumps({"error": "No active checkout session. Call checkout() first."})
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(
                f"{_merchant_base_url}/checkout-sessions/{_checkout_session_id}/complete",
                headers={**_ucp_headers(), "X-PAYMENT": x_payment},
            )
            if r.status_code == 402:
                return json.dumps({"error": "Payment rejected by merchant.", "detail": r.json()})
            r.raise_for_status()
            result = r.json()
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Complete checkout failed: {e}"})
    return json.dumps({"_ui": {"type": "order-confirmation"}, "order": result})


if __name__ == "__main__":
    mcp.run(transport="stdio")
