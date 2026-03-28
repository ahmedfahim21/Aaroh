"""Encrypted storage for per-consumer-agent EVM private keys (server-side only)."""

from __future__ import annotations

import base64
import functools
import hashlib
import json
import logging
import os
import threading
from pathlib import Path

from eth_account import Account

log = logging.getLogger(__name__)

_lock = threading.Lock()

# PBKDF2 salt is fixed per app; changing it invalidates PBKDF2-derived ciphertext.
_KDF_SALT = b"aaroh.agent-keys.v1"
_PBKDF2_ITERATIONS = 310_000


def _encryption_secret() -> str:
    secret = os.environ.get("AGENT_KEY_ENCRYPTION_SECRET", "").strip()
    if not secret:
        raise RuntimeError(
            "AGENT_KEY_ENCRYPTION_SECRET must be set for server-side agent key storage"
        )
    return secret


@functools.lru_cache(maxsize=1)
def _legacy_fernet_key() -> bytes:
    """SHA256-derived Fernet key (legacy; still used to decrypt existing rows)."""
    return base64.urlsafe_b64encode(
        hashlib.sha256(_encryption_secret().encode()).digest()
    )


@functools.lru_cache(maxsize=1)
def _pbkdf2_fernet_key() -> bytes:
    from cryptography.hazmat.primitives import hashes  # noqa: PLC0415
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC  # noqa: PLC0415

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_KDF_SALT,
        iterations=_PBKDF2_ITERATIONS,
    )
    return base64.urlsafe_b64encode(kdf.derive(_encryption_secret().encode()))


def _encrypt(plaintext: str) -> str:
    from cryptography.fernet import Fernet  # noqa: PLC0415

    return Fernet(_pbkdf2_fernet_key()).encrypt(plaintext.encode()).decode()


def _decrypt(token: str) -> str:
    from cryptography.fernet import Fernet, InvalidToken  # noqa: PLC0415

    raw = token.encode()
    for key_bytes in (_legacy_fernet_key(), _pbkdf2_fernet_key()):
        try:
            return Fernet(key_bytes).decrypt(raw).decode()
        except InvalidToken:
            continue
    raise InvalidToken("Could not decrypt with legacy or PBKDF2-derived key")


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


def generate_agent_key(agent_id: str) -> tuple[str, str]:
    """Generate a new EVM key, encrypt and store under agent_id.

    Returns (checksummed address, private key as 0x-prefixed hex) so callers need not
    reload from disk.
    """
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
    return addr, pk_hex


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
