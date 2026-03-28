"""Encrypted storage for per-consumer-agent EVM private keys (server-side only)."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
from pathlib import Path

from eth_account import Account

log = logging.getLogger(__name__)

_lock = threading.Lock()


def _fernet_key() -> bytes:
    secret = os.environ.get("AGENT_KEY_ENCRYPTION_SECRET", "").strip()
    if not secret:
        raise RuntimeError(
            "AGENT_KEY_ENCRYPTION_SECRET must be set for server-side agent key storage"
        )
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())


def _encrypt(plaintext: str) -> str:
    from cryptography.fernet import Fernet  # noqa: PLC0415

    return Fernet(_fernet_key()).encrypt(plaintext.encode()).decode()


def _decrypt(token: str) -> str:
    from cryptography.fernet import Fernet  # noqa: PLC0415

    return Fernet(_fernet_key()).decrypt(token.encode()).decode()


def _store_path() -> Path:
    return Path(os.environ.get("AGENT_KEYS_STORE", ".agent_keys.json")).resolve()


def _load_store() -> dict:
    path = _store_path()
    if not path.exists():
        return {"agents": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("agents"), dict):
            return data
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Could not load agent keys store: %s", e)
    return {"agents": {}}


def _save_store(data: dict) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=0), encoding="utf-8")
    tmp.replace(path)


def generate_agent_key(agent_id: str) -> str:
    """Generate a new EVM key, encrypt and store under agent_id. Return checksummed address."""
    acct = Account.create()
    pk_hex = acct.key.hex()
    if not pk_hex.startswith("0x"):
        pk_hex = "0x" + pk_hex
    addr = acct.address

    with _lock:
        store = _load_store()
        store["agents"][agent_id] = _encrypt(pk_hex)
        _save_store(store)

    log.info("Stored encrypted key for agent %s → %s", agent_id, addr)
    return addr


def load_agent_private_key(agent_id: str) -> str | None:
    """Load and decrypt private key (0x-prefixed hex) for agent_id, or None if missing."""
    with _lock:
        store = _load_store()
        enc = store["agents"].get(agent_id)
    if not enc:
        return None
    try:
        return _decrypt(enc)
    except Exception as e:
        log.warning("Failed to decrypt key for agent %s: %s", agent_id, e)
        return None


def delete_agent_key(agent_id: str) -> None:
    """Remove stored key for agent_id."""
    with _lock:
        store = _load_store()
        if agent_id in store["agents"]:
            del store["agents"][agent_id]
            _save_store(store)
            log.info("Deleted key for agent %s", agent_id)
