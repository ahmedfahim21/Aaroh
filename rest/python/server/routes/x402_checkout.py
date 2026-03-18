"""Dynamic x402 payment verification for the checkout complete endpoint.

Instead of a static price in ASGI middleware, this module reads the exact cart
total from the checkout session and builds per-request payment requirements.
The client signs a USDC EIP-3009 authorization for that exact amount, sends it
in the X-PAYMENT header, and this module verifies + settles with the facilitator.

Environment variables:
    MERCHANT_WALLET      – EVM address that receives payment (enables x402 when set)
    X402_NETWORK         – EIP-155 chain ID string, default "eip155:11155111" (Ethereum Sepolia)
    X402_FACILITATOR_URL – Facilitator endpoint, default https://x402.org/facilitator
"""

import base64
import json
import logging
import os
from typing import Any

import httpx
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


def x402_enabled() -> bool:
    """Return True when MERCHANT_WALLET env var is configured."""
    return bool(os.environ.get("MERCHANT_WALLET", ""))


async def handle_x402_checkout(
    request: Request,
    checkout_id: str,
    total_minor_units: int,
) -> dict[str, Any]:
    """Run the x402 payment flow for a checkout and return a synthetic EVM instrument.

    Called at the start of complete_checkout when x402 is enabled.  Builds
    payment requirements from the exact cart total so the client signs the
    right USDC amount rather than a fixed configured price.

    Flow:
        1. No X-PAYMENT header → raise HTTPException(402) with X-PAYMENT-REQUIRED.
        2. X-PAYMENT present → verify with facilitator → settle on-chain.
        3. Verified → return EVM instrument dict for checkout_service.

    Args:
        request:           FastAPI request (reads the X-PAYMENT header).
        checkout_id:       UCP checkout session ID (used as resource identifier).
        total_minor_units: Cart total in smallest currency unit (USD cents).
                           Converted to USDC micro-units (6 decimals) for x402.

    Returns:
        Synthetic EVM payment_data dict accepted by PaymentCreateRequest.

    Raises:
        HTTPException(402): Payment absent, invalid, or settlement failed.
    """
    merchant_wallet = os.environ.get("MERCHANT_WALLET", "")
    network = os.environ.get("X402_NETWORK", "eip155:11155111")
    facilitator_url = os.environ.get(
        "X402_FACILITATOR_URL", "https://x402.org/facilitator"
    )

    # Convert to USDC micro-units (6 decimal places).
    # Checkout totals are stored as USD cents (1 USD = 100 units).
    # 1 USDC = 1_000_000 micro-USDC → cents × 10_000 = micro-USDC.
    amount_usdc_micro = str(total_minor_units * 10_000)

    resource = f"/checkout-sessions/{checkout_id}/complete"
    accepts_entry: dict[str, Any] = {
        "scheme": "exact",
        "network": network,
        "payTo": merchant_wallet,
        "maxAmountRequired": amount_usdc_micro,
        "resource": resource,
        "description": f"Payment for checkout {checkout_id}",
        "mimeType": "application/json",
        "maxTimeoutSeconds": 300,
    }
    payment_required_body = {
        "x402Version": 1,
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
        payment_payload = json.loads(base64.b64decode(x_payment))
    except Exception as exc:
        raise HTTPException(
            status_code=402,
            detail=f"Malformed X-PAYMENT header: {exc}",
        ) from exc

    # Verify with facilitator.
    async with httpx.AsyncClient(timeout=10.0) as client:
        verify_resp = await client.post(
            f"{facilitator_url}/verify",
            json={"payload": payment_payload, "requirements": accepts_entry},
        )

    verify_data = verify_resp.json()
    if verify_resp.status_code != 200 or not verify_data.get("isValid"):
        reason = verify_data.get("invalidReason", "unknown")
        raise HTTPException(
            status_code=402,
            detail=f"x402 payment verification failed: {reason}",
        )

    # Settle on-chain.
    async with httpx.AsyncClient(timeout=20.0) as client:
        settle_resp = await client.post(
            f"{facilitator_url}/settle",
            json={"payload": payment_payload, "requirements": accepts_entry},
        )

    settle_data = settle_resp.json()
    if settle_resp.status_code != 200 or not settle_data.get("success"):
        raise HTTPException(
            status_code=402,
            detail="x402 payment settlement failed",
        )

    tx_hash = settle_data.get("transaction", "x402_settled")
    logger.info(
        "x402 payment settled for checkout %s tx=%s", checkout_id, tx_hash
    )

    return {
        "id": "evm_1",
        "handler_id": "evm",
        "handler_name": "org.ethereum.evm",
        "type": "token",
        "credential": {"type": "token", "token": tx_hash},
    }
