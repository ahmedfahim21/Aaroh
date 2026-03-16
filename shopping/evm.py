"""EVM identity and x402 payment signing utilities."""

import base64
import json
import os
import secrets
import time

from eth_account import Account
from eth_account.messages import encode_typed_data

USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
BASE_SEPOLIA_CHAIN_ID = 84532
ETH_SEPOLIA_CHAIN_ID = 11155111


def agent_account() -> Account:
    pk = os.environ.get("AGENT_PRIVATE_KEY", "")
    if not pk:
        raise RuntimeError("AGENT_PRIVATE_KEY env var not set")
    return Account.from_key(pk)


def agent_address() -> str:
    return agent_account().address


def build_x_payment(to_address: str, amount_micro_usdc: int) -> str:
    """Sign an EIP-3009 TransferWithAuthorization and return base64 X-PAYMENT.

    Args:
        to_address:        Merchant EVM wallet address.
        amount_micro_usdc: Amount in USDC micro-units (6 decimals).
                           e.g. $1.00 = 1_000_000, $28.00 = 28_000_000.
    """
    account = agent_account()
    network = os.environ.get("X402_NETWORK", "eip155:84532")
    nonce = "0x" + secrets.token_hex(32)
    valid_before = int(time.time()) + 3600

    domain_data = {
        "name": "USD Coin",
        "version": "2",
        "chainId": BASE_SEPOLIA_CHAIN_ID,
        "verifyingContract": USDC_BASE_SEPOLIA,
    }
    message_types = {
        "TransferWithAuthorization": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "value", "type": "uint256"},
            {"name": "validAfter", "type": "uint256"},
            {"name": "validBefore", "type": "uint256"},
            {"name": "nonce", "type": "bytes32"},
        ]
    }
    message_data = {
        "from": account.address,
        "to": to_address,
        "value": amount_micro_usdc,
        "validAfter": 0,
        "validBefore": valid_before,
        "nonce": nonce,
    }

    encoded_msg = encode_typed_data(domain_data, message_types, message_data)
    signed = account.sign_message(encoded_msg)

    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": network,
        "payload": {
            "signature": "0x" + signed.signature.hex(),
            "authorization": {
                "from": account.address,
                "to": to_address,
                "value": str(amount_micro_usdc),
                "validAfter": "0",
                "validBefore": str(valid_before),
                "nonce": nonce,
            },
        },
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()
