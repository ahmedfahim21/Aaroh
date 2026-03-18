"""ShoppingSession — stateful cart + UCP merchant interaction.

Shared by the autonomous agent (agent.py) and the MCP server (mcp_client.py).
The agent calls checkout_and_pay() for autonomous x402 payment.
The MCP client calls checkout() + complete_checkout(x_payment) where the
human provides the signed x_payment header.
"""

import json
import logging
import os
import uuid
from typing import Any, Callable

import httpx

from shopping.evm import USDC_BASE_SEPOLIA, agent_address, build_x_payment, build_x_payment_with_key

log = logging.getLogger(__name__)

# Type alias for the optional event emitter callback used by the agent
EmitFn = Callable[[dict], None]


class ShoppingSession:
    """Holds merchant context, cart, and checkout state for one shopping flow."""

    def __init__(
        self,
        default_merchant_url: str | None = None,
        agent_id: int | None = None,
        emit: EmitFn | None = None,
        agent_private_key: str | None = None,
    ):
        self.merchant_base_url: str | None = (
            (default_merchant_url or os.environ.get("MERCHANT_URL", "")).rstrip("/") or None
        )
        self.merchant_profile: dict[str, Any] | None = None
        self.cart: list[dict[str, Any]] = []
        self.checkout_session_id: str | None = None
        self.agent_id = agent_id
        self._emit = emit  # optional: called with event dicts for monitoring
        self._agent_private_key = agent_private_key  # per-agent derived key (takes priority)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _log(self, level: str, msg: str) -> None:
        if self._emit:
            self._emit({"type": "log", "level": level, "msg": msg})

    def _agent_address(self) -> str | None:
        if self._agent_private_key:
            from eth_account import Account as _Account
            return _Account.from_key(self._agent_private_key).address
        try:
            return agent_address()
        except RuntimeError:
            return None

    def _ucp_headers(self) -> dict[str, str]:
        addr = self._agent_address()
        if addr:
            agent_id_part = f";erc8004={self.agent_id}" if self.agent_id is not None else ""
            profile = f'profile="evm:{addr}{agent_id_part}"'
        else:
            profile = 'profile="ucp-agent"'
        return {
            "UCP-Agent": profile,
            "Request-Signature": "agent-auto",
            "Idempotency-Key": str(uuid.uuid4()),
            "Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        }

    def _require_merchant(self) -> dict | None:
        if not self.merchant_base_url:
            return {"error": "No merchant connected. Use discover_merchant(url) first."}
        if not self.merchant_profile:
            self._auto_discover()
        return None

    def _auto_discover(self) -> None:
        if self.merchant_base_url:
            try:
                with httpx.Client(timeout=10.0) as c:
                    r = c.get(f"{self.merchant_base_url}/.well-known/ucp")
                    r.raise_for_status()
                    self.merchant_profile = r.json()
            except Exception:
                pass

    def _merchant_wallet(self) -> str | None:
        handlers = (self.merchant_profile or {}).get("payment", {}).get("handlers", [])
        for h in handlers:
            if h.get("id") == "evm" and isinstance(h.get("config"), dict):
                return h["config"].get("wallet_address")
        return None

    # ── Tool implementations ──────────────────────────────────────────────────

    def discover_merchant(self, merchant_url: str) -> str:
        url = merchant_url.rstrip("/")
        self._log("info", f"Connecting to merchant {url}")
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{url}/.well-known/ucp")
                r.raise_for_status()
                self.merchant_profile = r.json()
                self.merchant_base_url = url
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Failed to discover merchant at {url}: {e}"})
        handlers = self.merchant_profile.get("payment", {}).get("handlers", [])
        name = self.merchant_profile.get("merchant", {}).get("name", "Merchant")
        categories = self.merchant_profile.get("merchant", {}).get("product_categories", "")
        self._log("info", f"Connected to {name}")
        return json.dumps({
            "success": True,
            "merchant": {
                "name": name,
                "base_url": url,
                "payment_handlers": [h.get("id") for h in handlers],
                "product_categories": categories or None,
            },
        })

    def browse_categories(self) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{self.merchant_base_url}/catalogue")
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Failed to load catalogue: {e}"})
        products = data.get("products", [])
        by_cat: dict[str, int] = {}
        for p in products:
            cat = p.get("category") or "general"
            by_cat[cat] = by_cat.get(cat, 0) + 1
        return json.dumps({"categories": [{"name": c, "count": n} for c, n in sorted(by_cat.items())]})

    def search_products(self, query: str = "", category: str | None = None) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        params: dict[str, str] = {}
        if query:
            params["q"] = query
        if category:
            params["category"] = category
        self._log("info", f"Searching products: query={query!r} category={category!r}")
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{self.merchant_base_url}/products", params=params)
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Search failed: {e}"})
        items = data.get("products", [])
        products = [
            {
                "id": p["id"],
                "title": p["title"],
                "price_usd": p["price"] / 100,
                "category": p.get("category"),
                "description": (p.get("description") or "")[:200],
            }
            for p in items
        ]
        return json.dumps({"products": products})

    def get_product(self, product_id: str) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{self.merchant_base_url}/products/{product_id}")
                r.raise_for_status()
                p = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Product not found: {e}"})
        return json.dumps({
            "product": {
                "id": p["id"],
                "title": p["title"],
                "price_usd": p["price"] / 100,
                "category": p.get("category"),
                "description": p.get("description"),
            }
        })

    def add_to_cart(self, product_id: str, quantity: int = 1) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if quantity < 1:
            return json.dumps({"error": "Quantity must be at least 1."})
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{self.merchant_base_url}/products/{product_id}")
                r.raise_for_status()
                p = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Product not found: {e}"})
        for item in self.cart:
            if item["product_id"] == product_id:
                item["quantity"] += quantity
                self._log("info", f"Updated cart: {item['title']} ×{item['quantity']}")
                return self.view_cart()
        self.cart.append({
            "product_id": p["id"],
            "title": p["title"],
            "price": p["price"],
            "quantity": quantity,
        })
        self._log("info", f"Added to cart: {p['title']} ×{quantity} @ ${p['price']/100:.2f}")
        return self.view_cart()

    def view_cart(self) -> str:
        if not self.cart:
            return json.dumps({"items": [], "total_cents": 0, "message": "Cart is empty."})
        total_cents = 0
        items = []
        for item in self.cart:
            line_total = item["price"] * item["quantity"]
            total_cents += line_total
            items.append({
                "product_id": item["product_id"],
                "title": item["title"],
                "quantity": item["quantity"],
                "price_cents": item["price"],
                "line_total_cents": line_total,
            })
        return json.dumps({"items": items, "total_cents": total_cents})

    def update_cart(self, product_id: str, quantity: int) -> str:
        for i, item in enumerate(self.cart):
            if item["product_id"] == product_id:
                if quantity <= 0:
                    self.cart.pop(i)
                else:
                    item["quantity"] = quantity
                return self.view_cart()
        return json.dumps({"error": f"Product {product_id!r} not in cart."})

    def remove_from_cart(self, product_id: str) -> str:
        return self.update_cart(product_id, 0)

    def checkout(self) -> str:
        """Create a checkout session. Returns session_id, order_total, wallet_address.

        Used by MCP client — human provides the signed x_payment separately.
        """
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if not self.cart:
            return json.dumps({"error": "Cart is empty. Add items first."})

        payload = self._build_checkout_payload()
        self._log("info", "Creating checkout session…")
        try:
            with httpx.Client(timeout=15.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions",
                    json=payload,
                    headers=self._ucp_headers(),
                )
                r.raise_for_status()
                checkout_data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Checkout failed: {e}"})

        self.checkout_session_id = checkout_data.get("id")
        totals = checkout_data.get("totals", [])
        total_amount = next((t.get("amount", 0) for t in totals if t.get("type") == "total"), 0)
        wallet_address = self._merchant_wallet()
        self._log("info", f"Checkout session {self.checkout_session_id} — total ${total_amount/100:.2f}")
        return json.dumps({
            "_ui": {"type": "checkout"},
            "checkout_session_id": self.checkout_session_id,
            "order_total": total_amount,
            "wallet_address": wallet_address,
            "message": (
                "Sign an EIP-3009 USDC authorisation in your EVM wallet for the amount above, "
                "then call complete_checkout(x_payment) with the resulting base64 X-PAYMENT string."
            ),
        })

    def complete_checkout(self, x_payment: str) -> str:
        """Submit a human-signed x402 payment to finalise the order (MCP flow)."""
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if not self.checkout_session_id:
            return json.dumps({"error": "No active checkout session. Call checkout() first."})
        self._log("info", "Submitting payment…")
        try:
            with httpx.Client(timeout=20.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions/{self.checkout_session_id}/complete",
                    headers={**self._ucp_headers(), "X-PAYMENT": x_payment},
                )
                if r.status_code == 402:
                    return json.dumps({"error": "Payment rejected.", "detail": r.json()})
                r.raise_for_status()
                result = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Complete checkout failed: {e}"})
        self._log("info", "Order confirmed!")
        return json.dumps({"_ui": {"type": "order-confirmation"}, "order": result})

    def checkout_and_pay(self) -> str:
        """Create checkout session AND autonomously sign+submit x402 (agent flow).

        Signs the EIP-3009 USDC transfer with the agent's private key.
        """
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if not self.cart:
            return json.dumps({"error": "Cart is empty. Add items first."})

        payload = self._build_checkout_payload()
        self._log("info", "Creating checkout session…")
        try:
            with httpx.Client(timeout=15.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions",
                    json=payload,
                    headers=self._ucp_headers(),
                )
                r.raise_for_status()
                checkout_data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Checkout creation failed: {e}"})

        self.checkout_session_id = checkout_data.get("id")
        totals = checkout_data.get("totals", [])
        total_cents = next((t.get("amount", 0) for t in totals if t.get("type") == "total"), 0)

        merchant_wallet = self._merchant_wallet()
        amount_micro_usdc = total_cents * 10_000  # cents → USDC micro-units

        # Probe 402 if merchant wallet not in discovery profile
        if not merchant_wallet:
            try:
                with httpx.Client(timeout=10.0) as c:
                    probe = c.post(
                        f"{self.merchant_base_url}/checkout-sessions/{self.checkout_session_id}/complete",
                        headers=self._ucp_headers(),
                    )
                    if probe.status_code == 402:
                        accepts = probe.json().get("accepts", [])
                        if accepts:
                            merchant_wallet = accepts[0].get("payTo")
                            req_amount = accepts[0].get("maxAmountRequired")
                            if req_amount:
                                amount_micro_usdc = int(req_amount)
            except Exception as exc:
                log.warning("Payment probe failed: %s", exc)

        if not merchant_wallet:
            return json.dumps({
                "error": "Could not determine merchant wallet address for x402 payment.",
                "checkout_session_id": self.checkout_session_id,
                "order_total_cents": total_cents,
            })

        self._log("info", f"Signing x402 payment: {amount_micro_usdc / 1_000_000:.2f} USDC → {merchant_wallet[:10]}…")
        try:
            if self._agent_private_key:
                x_payment = build_x_payment_with_key(self._agent_private_key, merchant_wallet, amount_micro_usdc)
            else:
                x_payment = build_x_payment(merchant_wallet, amount_micro_usdc)
        except RuntimeError as e:
            return json.dumps({"error": str(e)})

        try:
            with httpx.Client(timeout=20.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions/{self.checkout_session_id}/complete",
                    headers={**self._ucp_headers(), "X-PAYMENT": x_payment},
                )
                if r.status_code == 402:
                    return json.dumps({"error": "Payment rejected by merchant.", "detail": r.json()})
                r.raise_for_status()
                result = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Complete checkout failed: {e}"})

        self._log("info", f"Order confirmed! Paid {amount_micro_usdc / 1_000_000:.2f} USDC")
        return json.dumps({
            "success": True,
            "order": result,
            "paid_usdc": amount_micro_usdc / 1_000_000,
            "merchant_wallet": merchant_wallet,
            "agent_wallet": self._agent_address(),
            "agent_erc8004_id": self.agent_id,
        })

    # ── Private ───────────────────────────────────────────────────────────────

    def _build_checkout_payload(self) -> dict[str, Any]:
        handlers = (self.merchant_profile or {}).get("payment", {}).get("handlers", [])
        if not handlers:
            handlers = [{"id": "evm", "name": "org.ethereum.evm", "version": "2026-01-11", "config": {}}]
        line_items = [
            {
                "item": {"id": item["product_id"], "title": item["title"], "price": item["price"]},
                "quantity": item["quantity"],
            }
            for item in self.cart
        ]
        fulfillment = {
            "methods": [
                {
                    "type": "shipping",
                    "destinations": [
                        {
                            "id": "dest_1",
                            "street_address": "123 Agent Lane",
                            "address_locality": "San Francisco",
                            "address_region": "CA",
                            "postal_code": "94102",
                            "address_country": "US",
                        }
                    ],
                    "selected_destination_id": "dest_1",
                    "groups": [
                        {
                            "id": "group_1",
                            "line_item_ids": [],
                            "options": [
                                {
                                    "id": "std",
                                    "title": "Standard Shipping",
                                    "totals": [{"type": "total", "amount": 500}],
                                }
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
            "payment": {"handlers": handlers, "instruments": [], "selected_instrument_id": None},
            "fulfillment": fulfillment,
        }
