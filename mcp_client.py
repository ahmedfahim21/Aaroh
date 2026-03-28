#!/usr/bin/env python3
"""
MCP shopping client: discover any UCP merchant and browse, cart, checkout via tools.

Configure MERCHANT_URL and/or MERCHANT_URLS (comma-separated base URLs) for list_merchants /
find_merchant, or use discover_merchant(url) with a known base URL.

Checkout flow (x402 crypto payments):
  1. checkout()                  – creates a session; returns wallet_address + order_total
  2. <user signs x402 payment>   – user signs an EIP-3009 USDC authorisation in their wallet
                                   and provides the base64 X-PAYMENT string
  3. complete_checkout(x_payment) – posts the signed payment; returns order confirmation
"""

from mcp.server.fastmcp import FastMCP

from shopping.merchant_discovery import find_merchant_json, list_merchants_json
from shopping.session import ShoppingSession

mcp = FastMCP(
    "Aaroh",
    instructions="Shopping assistant for UCP merchants. Discover a merchant first, then browse and shop.",
)

# Single session instance shared across all MCP tool calls
_session = ShoppingSession()


# ── Tools ─────────────────────────────────────────────────────────────────────


@mcp.tool()
def discover_merchant(merchant_url: str) -> str:
    """Connect to a UCP merchant by URL. Fetches /.well-known/ucp and stores the merchant for browsing and checkout.

    Call this after list_merchants / find_merchant, or when you already know the base URL.
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
    """Discover UCP merchants configured via MERCHANT_URL / MERCHANT_URLS (probes /.well-known/ucp).

    Also includes the currently connected merchant URL if any.

    Args:
        category: Optional keyword filter on product_categories from discovery profiles.
    """
    return list_merchants_json(category, connected_base_url=_session.merchant_base_url)


@mcp.tool()
def find_merchant(query: str) -> str:
    """Find and auto-connect to a UCP merchant by name or product category (see list_merchants).

    - Exactly 1 match: auto-connects via discover_merchant(url).
    - 0 matches: returns error with all discovered merchants listed.
    - 2+ matches: returns the ambiguous list; use discover_merchant(url) to pick one.

    Args:
        query: Search term, e.g. "candles", "artisan", "home decor".
    """
    return find_merchant_json(
        query,
        discover_merchant,
        connected_base_url=_session.merchant_base_url,
    )


@mcp.tool()
def checkout() -> str:
    """Create a checkout session. The payment UI is rendered automatically in the browser — do NOT ask the user for any payment string or confirmation. Just present the checkout details and the browser handles the rest."""
    return _session.checkout()


@mcp.tool()
def get_checkout_status(merchant_url: str, checkout_session_id: str) -> str:
    """Check the current status of a checkout session on a UCP merchant (e.g. after the user paid in the browser)."""
    return ShoppingSession.get_checkout_status(merchant_url, checkout_session_id)


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
