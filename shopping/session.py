"""ShoppingSession — stateful cart + UCP merchant interaction.

Shared by the autonomous agent (agent.py) and the MCP server (mcp_client.py).
The autonomous agent uses checkout() + submit_payment() for a two-step x402 flow.
The MCP client calls checkout() + complete_checkout(x_payment) where the
human provides the signed x_payment header.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import uuid
from typing import Any, Callable

import httpx

from shopping.evm import USDC_BASE_SEPOLIA, agent_address, build_x_payment, build_x_payment_with_key

log = logging.getLogger(__name__)

# Base Sepolia block explorer (matches x402 default network eip155:84532)
_BASE_SEPOLIA_TX_EXPLORER = "https://sepolia.basescan.org/tx"

# Type alias for the optional event emitter callback used by the agent
EmitFn = Callable[[dict], None]


def _is_plausible_evm_tx_hash(token: str | None) -> bool:
    if not token or not isinstance(token, str):
        return False
    s = token.strip()
    if not s or s == "x402_settled":
        return False
    if s.startswith("0x"):
        s = s[2:]
    return len(s) == 64 and all(c in "0123456789abcdefABCDEF" for c in s)


def _tx_hash_from_complete_response(
    response: httpx.Response,
    body: dict[str, Any] | None,
) -> str | None:
    """Read settlement tx from x402 PAYMENT-RESPONSE header (canonical) or body x402_transaction."""
    header_val = response.headers.get("payment-response") or response.headers.get(
        "PAYMENT-RESPONSE"
    )
    if header_val and str(header_val).strip():
        try:
            raw = base64.b64decode(str(header_val).strip())
            settlement = json.loads(raw.decode("utf-8"))
            tx = settlement.get("transaction")
            if isinstance(tx, str) and _is_plausible_evm_tx_hash(tx):
                return tx.strip()
        except (json.JSONDecodeError, ValueError, OSError) as e:
            log.warning("x402 PAYMENT-RESPONSE decode failed: %s", e)
    if isinstance(body, dict):
        x402_tx = body.get("x402_transaction")
        if isinstance(x402_tx, str) and _is_plausible_evm_tx_hash(x402_tx):
            return x402_tx.strip()
    if not isinstance(body, dict):
        log.warning("checkout complete: no JSON body for tx extraction")
    else:
        log.warning(
            "checkout complete: no tx in PAYMENT-RESPONSE or x402_transaction (keys=%s)",
            list(body.keys())[:25],
        )
    return None


def _tx_explorer_url(tx_hash: str | None) -> str | None:
    if not tx_hash or not _is_plausible_evm_tx_hash(tx_hash):
        return None
    h = tx_hash.strip()
    return f"{_BASE_SEPOLIA_TX_EXPLORER}/{h}"


def _canonical_json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


class ShoppingSession:
    """Holds merchant context, cart, and checkout state for one shopping flow."""

    def __init__(
        self,
        default_merchant_url: str | None = None,
        agent_id: int | None = None,
        emit: EmitFn | None = None,
        agent_private_key: str | None = None,
        extra_discovery_urls: list[str] | None = None,
    ):
        self.merchant_base_url: str | None = (
            (default_merchant_url or os.environ.get("MERCHANT_URL", "")).rstrip("/") or None
        )
        self.extra_discovery_urls: list[str] = [
            str(u).strip().rstrip("/") for u in (extra_discovery_urls or []) if str(u or "").strip()
        ]
        self.merchant_profile: dict[str, Any] | None = None
        self.cart: list[dict[str, Any]] = []
        self.checkout_session_id: str | None = None
        self.agent_id = agent_id
        self._emit = emit  # optional: called with event dicts for monitoring
        self._agent_private_key = agent_private_key  # server-side only; never from browser
        # checkout_session_id -> {"accepts_entry": dict, "total_cents": int}
        self._x402_requirements: dict[str, dict[str, Any]] = {}

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

    def _request_signature(self, body_bytes: bytes) -> str:
        """EIP-191 personal_sign over SHA256(body) when agent key exists; else browser placeholder."""
        if not self._agent_private_key:
            return "browser"
        from eth_account import Account as _Account
        from eth_account.messages import encode_defunct

        digest = hashlib.sha256(body_bytes).digest()
        message = encode_defunct(primitive=digest)
        signed = _Account.from_key(self._agent_private_key).sign_message(message)
        return f"eip191-sha256=0x{signed.signature.hex()}"

    def _ucp_headers(self, body_bytes: bytes = b"") -> dict[str, str]:
        addr = self._agent_address()
        if addr:
            agent_id_part = f";erc8004={self.agent_id}" if self.agent_id is not None else ""
            profile = f'profile="evm:{addr}{agent_id_part}"'
        else:
            profile = 'profile="ucp-agent"'
        return {
            "UCP-Agent": profile,
            "Request-Signature": self._request_signature(body_bytes),
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
                    r = c.get(
                        f"{self.merchant_base_url}/.well-known/ucp",
                        headers=self._ucp_headers(b""),
                    )
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
                r = c.get(f"{url}/.well-known/ucp", headers=self._ucp_headers(b""))
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
            "_ui": {"type": "merchant-info"},
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
                r = c.get(
                    f"{self.merchant_base_url}/catalogue",
                    headers=self._ucp_headers(b""),
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Failed to load catalogue: {e}"})
        products = data.get("products", [])
        by_cat: dict[str, int] = {}
        for p in products:
            cat = p.get("category") or "general"
            by_cat[cat] = by_cat.get(cat, 0) + 1
        return json.dumps({
            "_ui": {"type": "category-list"},
            "categories": [{"name": c, "count": n} for c, n in sorted(by_cat.items())],
        })

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
                r = c.get(
                    f"{self.merchant_base_url}/products",
                    params=params,
                    headers=self._ucp_headers(b""),
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Search failed: {e}"})
        items = data.get("products", [])
        products = [
            {
                "id": p["id"],
                "title": p["title"],
                "price": p["price"],
                "price_usd": p["price"] / 100,
                "category": p.get("category"),
                "description": (p.get("description") or "")[:200],
                "image_url": p.get("image_url"),
                "origin_state": p.get("origin_state"),
                "artisan_name": p.get("artisan_name"),
            }
            for p in items
        ]
        return json.dumps({
            "_ui": {"type": "product-grid"},
            "products": products,
        })

    def get_product(self, product_id: str) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(
                    f"{self.merchant_base_url}/products/{product_id}",
                    headers=self._ucp_headers(b""),
                )
                r.raise_for_status()
                p = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Product not found: {e}"})
        return json.dumps({
            "_ui": {"type": "product-detail"},
            "product": {
                "id": p["id"],
                "title": p["title"],
                "price": p["price"],
                "price_usd": p["price"] / 100,
                "category": p.get("category"),
                "description": p.get("description"),
                "image_url": p.get("image_url"),
                "origin_state": p.get("origin_state"),
                "artisan_name": p.get("artisan_name"),
            },
        })

    def add_to_cart(self, product_id: str, quantity: int = 1) -> str:
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if quantity < 1:
            return json.dumps({"error": "Quantity must be at least 1."})
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(
                    f"{self.merchant_base_url}/products/{product_id}",
                    headers=self._ucp_headers(b""),
                )
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
            return json.dumps({
                "_ui": {"type": "cart"},
                "items": [],
                "total_cents": 0,
                "total_paise": 0,
                "message": "Cart is empty.",
            })
        total_cents = 0
        items = []
        for item in self.cart:
            line_total = item["price"] * item["quantity"]
            total_cents += line_total
            price = item["price"]
            items.append({
                "product_id": item["product_id"],
                "title": item["title"],
                "quantity": item["quantity"],
                "price_cents": price,
                "line_total_cents": line_total,
                "price_paise": price,
                "line_total_paise": line_total,
            })
        return json.dumps({
            "_ui": {"type": "cart"},
            "items": items,
            "total_cents": total_cents,
            "total_paise": total_cents,
        })

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

    def _cart_summary(self) -> dict[str, Any]:
        """Structured cart snapshot for post-checkout UI (no _ui wrapper)."""
        if not self.cart:
            return {"items": [], "total_cents": 0}
        total_cents = 0
        items: list[dict[str, Any]] = []
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
        return {"items": items, "total_cents": total_cents}

    @staticmethod
    def get_checkout_status(merchant_url: str, checkout_session_id: str) -> str:
        """Query a merchant for the current status of a checkout session.

        Used by MCP clients and mirrored by the consumer status proxy for UI hydration.
        """
        base = merchant_url.rstrip("/")
        url = f"{base}/checkout-sessions/{checkout_session_id}"
        try:
            with httpx.Client(timeout=10.0) as c:
                headers = {
                    "UCP-Agent": 'profile="browser"',
                    "Request-Signature": "browser",
                    "Idempotency-Key": str(uuid.uuid4()),
                    "Request-Id": str(uuid.uuid4()),
                    "Content-Type": "application/json",
                }
                r = c.get(url, headers=headers)
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Failed to get checkout status: {e}"})

        status = data.get("status", "unknown")
        order = data.get("order") or {}
        order_id = order.get("id") if isinstance(order, dict) else None
        completed_statuses = frozenset({"completed", "complete_in_progress"})
        return json.dumps({
            "checkout_session_id": checkout_session_id,
            "status": status,
            "completed": status in completed_statuses,
            "order_id": order_id,
        })

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
        body_bytes = _canonical_json_bytes(payload)
        self._log("info", "Creating checkout session…")
        try:
            with httpx.Client(timeout=15.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions",
                    content=body_bytes,
                    headers={**self._ucp_headers(body_bytes), "Content-Type": "application/json"},
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
            "merchant_url": self.merchant_base_url,
        })

    def complete_checkout(self, x_payment: str) -> str:
        """Submit a human-signed x402 payment to finalise the order (MCP flow)."""
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if not self.checkout_session_id:
            return json.dumps({"error": "No active checkout session. Call checkout() first."})
        self._log("info", "Submitting payment…")
        body_bytes = b"{}"
        result: dict[str, Any] = {}
        response: httpx.Response | None = None
        try:
            with httpx.Client(timeout=20.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions/{self.checkout_session_id}/complete",
                    content=body_bytes,
                    headers={
                        **self._ucp_headers(body_bytes),
                        "X-PAYMENT": x_payment,
                        "Content-Type": "application/json",
                    },
                )
                response = r
                if r.status_code == 402:
                    body = r.json()
                    detail = body.get("detail", body)
                    return json.dumps({"error": "Payment rejected.", "detail": detail})
                r.raise_for_status()
                parsed = r.json()
                result = parsed if isinstance(parsed, dict) else {}
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Complete checkout failed: {e}"})
        self._log("info", "Order confirmed!")
        order_info = result.get("order") if isinstance(result.get("order"), dict) else {}
        tx_hash = (
            _tx_hash_from_complete_response(response, result)
            if response is not None
            else None
        )
        if tx_hash:
            self._log("info", f"Blockchain proof (tx): {tx_hash[:12]}…{tx_hash[-10:]}")
        return json.dumps({
            "_ui": {"type": "order-confirmation"},
            "order": result,
            "order_id": order_info.get("id"),
            "order_url": order_info.get("permalink_url"),
            "tx_hash": tx_hash,
            "tx_url": _tx_explorer_url(tx_hash),
            "cart_summary": self._cart_summary(),
        })

    def autonomous_checkout_request_payment(self) -> str:
        """Create checkout session and fetch x402 payment requirements (HTTP 402) from merchant.

        Autonomous agent flow — call submit_payment next with the returned checkout_session_id.
        """
        err = self._require_merchant()
        if err:
            return json.dumps(err)
        if not self.cart:
            return json.dumps({"error": "Cart is empty. Add items first."})

        payload = self._build_checkout_payload()
        body_bytes = _canonical_json_bytes(payload)
        self._log("info", "Creating checkout session (autonomous x402 step 1)…")
        try:
            with httpx.Client(timeout=15.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions",
                    content=body_bytes,
                    headers={**self._ucp_headers(body_bytes), "Content-Type": "application/json"},
                )
                r.raise_for_status()
                checkout_data = r.json()
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Checkout creation failed: {e}"})

        sid = checkout_data.get("id")
        self.checkout_session_id = sid
        totals = checkout_data.get("totals", [])
        total_cents = next((t.get("amount", 0) for t in totals if t.get("type") == "total"), 0)

        complete_body = b"{}"
        try:
            with httpx.Client(timeout=10.0) as c:
                probe = c.post(
                    f"{self.merchant_base_url}/checkout-sessions/{sid}/complete",
                    content=complete_body,
                    headers={**self._ucp_headers(complete_body), "Content-Type": "application/json"},
                )
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Could not request payment requirements: {e}"})

        if probe.status_code != 402:
            return json.dumps({
                "error": "Expected HTTP 402 Payment Required from merchant complete endpoint.",
                "status_code": probe.status_code,
                "checkout_session_id": sid,
                "hint": "Ensure merchant has MERCHANT_WALLET or discovery wallet configured for x402.",
            })

        body = probe.json()
        payment_required = body.get("detail", body)
        if not isinstance(payment_required, dict):
            return json.dumps({"error": "Malformed 402 response", "checkout_session_id": sid})

        accepts = payment_required.get("accepts") or []
        if not accepts:
            return json.dumps({"error": "402 response missing accepts[]", "checkout_session_id": sid})

        accepts_entry = accepts[0]
        pay_to = accepts_entry.get("payTo")
        amount_micro = accepts_entry.get("amount") or accepts_entry.get("maxAmountRequired")
        if not pay_to or amount_micro is None:
            return json.dumps({"error": "Invalid accepts[0] entry (payTo/amount)", "checkout_session_id": sid})

        self._x402_requirements[sid] = {
            "accepts_entry": accepts_entry,
            "total_cents": total_cents,
        }

        self._log("info", f"x402: pay {int(amount_micro) / 1_000_000:.2f} USDC → {pay_to[:10]}…")
        return json.dumps({
            "_ui": {"type": "x402-payment-required"},
            "x402": "payment_required",
            "checkout_session_id": sid,
            "order_total_cents": total_cents,
            "pay_to": pay_to,
            "amount_micro_usdc": str(amount_micro),
            "network": accepts_entry.get("network"),
            "asset": accepts_entry.get("asset"),
            "message": "Call submit_payment with this checkout_session_id to sign and complete payment.",
        })

    def submit_payment(self, checkout_session_id: str) -> str:
        """Sign x402 EIP-3009 payload and POST complete with X-PAYMENT (autonomous agent step 2)."""
        err = self._require_merchant()
        if err:
            return json.dumps(err)

        req = self._x402_requirements.get(checkout_session_id)
        if not req:
            return json.dumps({
                "error": "No stored payment requirements for this session. Call checkout first.",
                "checkout_session_id": checkout_session_id,
            })

        accepts_entry = req["accepts_entry"]
        pay_to = accepts_entry.get("payTo")
        raw_amt = accepts_entry.get("amount") or accepts_entry.get("maxAmountRequired")
        if not pay_to or raw_amt is None:
            return json.dumps({"error": "Stored payment requirements incomplete", "checkout_session_id": checkout_session_id})
        amount_micro_usdc = int(str(raw_amt))

        self._log(
            "info",
            f"Signing x402 payment: {amount_micro_usdc / 1_000_000:.2f} USDC → {pay_to[:10]}…",
        )
        try:
            if self._agent_private_key:
                x_payment = build_x_payment_with_key(self._agent_private_key, pay_to, amount_micro_usdc)
            else:
                x_payment = build_x_payment(pay_to, amount_micro_usdc)
        except RuntimeError as e:
            return json.dumps({"error": str(e)})

        body_bytes = b"{}"
        result: dict[str, Any] = {}
        response: httpx.Response | None = None
        try:
            with httpx.Client(timeout=20.0) as c:
                r = c.post(
                    f"{self.merchant_base_url}/checkout-sessions/{checkout_session_id}/complete",
                    content=body_bytes,
                    headers={
                        **self._ucp_headers(body_bytes),
                        "X-PAYMENT": x_payment,
                        "Content-Type": "application/json",
                    },
                )
                response = r
                if r.status_code == 402:
                    b = r.json()
                    detail = b.get("detail", b)
                    return json.dumps({"error": "Payment rejected by merchant.", "detail": detail})
                r.raise_for_status()
                parsed = r.json()
                result = parsed if isinstance(parsed, dict) else {}
        except httpx.HTTPError as e:
            return json.dumps({"error": f"Complete checkout failed: {e}"})

        del self._x402_requirements[checkout_session_id]
        self._log("info", f"Order confirmed! Paid {amount_micro_usdc / 1_000_000:.2f} USDC")
        order_info = result.get("order") if isinstance(result.get("order"), dict) else {}
        tx_hash = (
            _tx_hash_from_complete_response(response, result)
            if response is not None
            else None
        )
        if tx_hash:
            self._log("info", f"Blockchain proof (tx): {tx_hash[:12]}…{tx_hash[-10:]}")
        return json.dumps({
            "_ui": {"type": "order-confirmation"},
            "success": True,
            "order": result,
            "order_id": order_info.get("id"),
            "order_url": order_info.get("permalink_url"),
            "tx_hash": tx_hash,
            "tx_url": _tx_explorer_url(tx_hash),
            "cart_summary": self._cart_summary(),
            "paid_usdc": amount_micro_usdc / 1_000_000,
            "merchant_wallet": pay_to,
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
