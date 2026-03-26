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

import concurrent.futures
import json
import os
import re
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

from shopping.session import ShoppingSession

mcp = FastMCP(
    "Aaroh",
    instructions="Shopping assistant for UCP merchants. Discover a merchant first, then browse and shop.",
)

# Single session instance shared across all MCP tool calls
_session = ShoppingSession()


# ── Merchant discovery helpers ────────────────────────────────────────────────


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
    Always includes the currently connected merchant if set.
    """
    raw_env = os.environ.get("MERCHANT_URLS", "").strip()
    if raw_env:
        urls = [u.rstrip("/") for u in re.split(r"[,\s]+", raw_env) if u.strip()]
    else:
        urls = [f"http://localhost:{port}" for port in range(8000, 8010)]
    url_set: set[str] = set(urls)
    if _session.merchant_base_url:
        url_set.add(_session.merchant_base_url)
    return list(url_set)


# ── Tools ─────────────────────────────────────────────────────────────────────


@mcp.tool()
def discover_merchant(merchant_url: str) -> str:
    """Connect to a UCP merchant by URL. Fetches /.well-known/ucp and stores the merchant for browsing and checkout.

    Call this first with the merchant's base URL (e.g. http://localhost:8000).
    """
    return _session.discover_merchant(merchant_url)


@mcp.tool()
def browse_categories() -> str:
    """List product categories and counts from the connected merchant (from /catalogue)."""
    return _session.browse_categories()


@mcp.tool()
def search_products(query: str = "", category: str | None = None) -> str:
    """Search products by keyword and optional category. Returns product list as JSON."""
    return _session.search_products(query=query, category=category)


@mcp.tool()
def get_product(product_id: str) -> str:
    """Get full product details by ID."""
    return _session.get_product(product_id)


@mcp.tool()
def add_to_cart(product_id: str, quantity: int = 1) -> str:
    """Add a product to the cart. Use the product ID from search or get_product."""
    return _session.add_to_cart(product_id, quantity)


@mcp.tool()
def view_cart() -> str:
    """Show current cart with line items and totals."""
    return _session.view_cart()


@mcp.tool()
def update_cart(product_id: str, quantity: int) -> str:
    """Update quantity for a product in the cart. Use 0 to remove."""
    return _session.update_cart(product_id, quantity)


@mcp.tool()
def remove_from_cart(product_id: str) -> str:
    """Remove a product from the cart."""
    return _session.remove_from_cart(product_id)


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


@mcp.tool()
def checkout() -> str:
    """Create a checkout session. The payment UI is rendered automatically in the browser — do NOT ask the user for any payment string or confirmation. Just present the checkout details and the browser handles the rest."""
    return _session.checkout()


@mcp.tool()
def complete_checkout(x_payment: str) -> str:
    """Complete the checkout by submitting a signed x402 EIP-3009 payment proof.

    After checkout() returns the wallet_address and order_total, the user signs a USDC
    EIP-3009 authorisation in their EVM wallet and receives a base64 X-PAYMENT string.
    Pass that string here to finalise the order.

    x_payment: base64-encoded X-PAYMENT value produced by the user's EVM wallet.
    """
    return _session.complete_checkout(x_payment)


if __name__ == "__main__":
    mcp.run(transport="stdio")
