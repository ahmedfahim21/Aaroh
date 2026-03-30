"""Dynamic x402 payment verification for the checkout complete endpoint.

Instead of a static price in ASGI middleware, this module reads the exact cart
total from the checkout session and builds per-request payment requirements.
The client signs a USDC EIP-3009 authorization for that exact amount, sends it
in the X-PAYMENT header, and this module verifies + settles with the facilitator.

Environment variables:
    MERCHANT_WALLET      – EVM address that receives payment (enables x402 when set)
    X402_NETWORK         – EIP-155 chain ID string, default "eip155:84532" (Base Sepolia)
    X402_FACILITATOR_URL – Facilitator endpoint, default https://x402.org/facilitator
"""

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any

USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

import httpx
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


def _merchant_wallet_from_discovery_profile() -> str:
    """Read EVM wallet from discovery profile payment handler config."""
    try:
        import config  # noqa: PLC0415

        profile_path: Path = config._discovery_profile_path()
        with profile_path.open(encoding="utf-8") as f:
            profile = json.load(f)

        handlers = profile.get("payment", {}).get("handlers", []) or []
        for handler in handlers:
            if handler.get("id") != "evm":
                continue
            wallet = (handler.get("config") or {}).get("wallet_address", "")
            if isinstance(wallet, str) and wallet and "{{" not in wallet:
                return wallet
    except Exception:
        # Keep checkout robust even if discovery profile read fails.
        pass
    return ""


def resolve_merchant_wallet() -> str:
    """Resolve merchant wallet with env override, then discovery profile fallback."""
    env_wallet = os.environ.get("MERCHANT_WALLET", "").strip()
    if env_wallet and "{{" not in env_wallet:
        return env_wallet
    return _merchant_wallet_from_discovery_profile()


def x402_enabled() -> bool:
    """Return True when merchant wallet is configured."""
    return bool(resolve_merchant_wallet())


def _is_non_empty_tx_hash(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not s:
        return False
    hex_part = s[2:] if s.startswith("0x") else s
    return len(hex_part) == 64 and all(c in "0123456789abcdefABCDEF" for c in hex_part)


async def handle_x402_checkout(
    request: Request,
    checkout_id: str,
    total_minor_units: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run the x402 payment flow for a checkout.

    Called at the start of complete_checkout when x402 is enabled.  Builds
    payment requirements from the exact cart total so the client signs the
    right USDC amount rather than a fixed configured price.

    Flow:
        1. No X-PAYMENT header → raise HTTPException(402) with X-PAYMENT-REQUIRED.
        2. X-PAYMENT present → verify with facilitator → settle on-chain.
        3. Verified → return EVM instrument + canonical SettlementResponse body.

    Args:
        request:           FastAPI request (reads the X-PAYMENT header).
        checkout_id:       UCP checkout session ID (used as resource identifier).
        total_minor_units: Cart total in smallest currency unit (USD cents).
                           Converted to USDC micro-units (6 decimals) for x402.

    Returns:
        (instrument_dict, settlement_response_dict).
        settlement_response_dict matches x402 SettlementResponse (for PAYMENT-RESPONSE header).

    Raises:
        HTTPException(402): Payment absent, invalid, or settlement failed.

    """
    merchant_wallet = resolve_merchant_wallet()
    if not merchant_wallet:
        raise HTTPException(
            status_code=500,
            detail=(
                "Merchant wallet not configured. Set payment.handlers[].config.wallet_address "
                "in discovery_profile.json (preferred) or MERCHANT_WALLET env var."
            ),
        )
    network = os.environ.get("X402_NETWORK", "eip155:84532")
    facilitator_url = os.environ.get(
        "X402_FACILITATOR_URL", "https://x402.org/facilitator"
    )

    # Convert to USDC micro-units (6 decimal places).
    # Checkout totals are stored as USD cents (1 USD = 100 units).
    # 1 USDC = 1_000_000 micro-USDC → cents × 10_000 = micro-USDC.
    amount_usdc_micro = str(total_minor_units * 10_000)

    accepts_entry: dict[str, Any] = {
        "scheme": "exact",
        "network": network,
        "payTo": merchant_wallet,
        "amount": amount_usdc_micro,
        "asset": USDC_BASE_SEPOLIA,
        "maxTimeoutSeconds": 300,
        "extra": {
            "name": "USDC",
            "version": "2",
            "assetTransferMethod": "eip3009",
        },
    }
    payment_required_body = {
        "x402Version": 2,
        "accepts": [accepts_entry],
        "error": "",
    }

    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        # No payment header — return 402 with per-session requirements.
        encoded = base64.b64encode(
            json.dumps(payment_required_body).encode()
        ).decode()
        raise HTTPException(
            status_code=402,
            detail=payment_required_body,
            headers={"X-PAYMENT-REQUIRED": encoded},
        )

    # Decode the signed payment payload the client sent back.
    try:
        payment_payload = json.loads(base64.b64decode(x_payment + "=="))
    except Exception as exc:
        raise HTTPException(
            status_code=402,
            detail=f"Malformed X-PAYMENT header: {exc}",
        ) from exc

    # Verify with facilitator.
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        verify_resp = await client.post(
            f"{facilitator_url}/verify",
            json={
                "x402Version": 2,
                "paymentPayload": payment_payload,
                "paymentRequirements": accepts_entry,
            },
        )

    try:
        verify_data = verify_resp.json()
    except Exception:
        raise HTTPException(
            status_code=402,
            detail=f"x402 facilitator /verify returned non-JSON ({verify_resp.status_code}): {verify_resp.text[:200]}",
        )
    if verify_resp.status_code != 200 or not verify_data.get("isValid"):
        reason = verify_data.get("invalidReason") or verify_data.get("error") or str(verify_data)
        raise HTTPException(
            status_code=402,
            detail=f"x402 payment verification failed: {reason}",
        )

    # Settle on-chain.
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        settle_resp = await client.post(
            f"{facilitator_url}/settle",
            json={
                "x402Version": 2,
                "paymentPayload": payment_payload,
                "paymentRequirements": accepts_entry,
            },
        )

    try:
        settle_data = settle_resp.json()
    except Exception:
        raise HTTPException(
            status_code=402,
            detail=f"x402 facilitator /settle returned non-JSON ({settle_resp.status_code}): {settle_resp.text[:200]}",
        )
    if settle_resp.status_code != 200 or not settle_data.get("success"):
        reason = settle_data.get("error") or settle_data.get("errorReason") or str(settle_data)
        raise HTTPException(
            status_code=402,
            detail=f"x402 payment settlement failed: {reason}",
        )

    tx_hash = settle_data.get("transaction")
    if not _is_non_empty_tx_hash(tx_hash):
        raise HTTPException(
            status_code=402,
            detail="x402 settlement succeeded but facilitator returned no valid transaction hash",
        )
    tx_normalized = str(tx_hash).strip()

    payer = settle_data.get("payer") or verify_data.get("payer")
    settlement_response: dict[str, Any] = {
        "success": True,
        "transaction": tx_normalized,
        "network": network,
    }
    if isinstance(payer, str) and payer.strip():
        settlement_response["payer"] = payer.strip()

    logger.info(
        "x402 payment settled for checkout %s tx=%s", checkout_id, tx_normalized
    )

    instrument = {
        "id": "evm_1",
        "handler_id": "evm",
        "handler_name": "org.ethereum.evm",
        "type": "token",
        "credential": {"type": "token", "token": tx_normalized},
    }
    return instrument, settlement_response
