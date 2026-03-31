"""IPFS helpers for publishing agent manifests via Pinata."""

from __future__ import annotations

import os
from typing import Any

import httpx


PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


def pin_json_to_ipfs(payload: dict[str, Any], name: str | None = None) -> str:
    """Pin JSON payload to IPFS using Pinata and return CID."""
    jwt = os.environ.get("PINATA_JWT", "").strip()
    if not jwt:
        raise RuntimeError("PINATA_JWT env var is not set")

    body: dict[str, Any] = {"pinataContent": payload}
    if name:
        body["pinataMetadata"] = {"name": name}

    headers = {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=20.0) as client:
        resp = client.post(PINATA_PIN_JSON_URL, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

    cid = data.get("IpfsHash")
    if not isinstance(cid, str) or not cid.strip():
        raise RuntimeError("Pinata response missing IpfsHash")
    return cid.strip()
