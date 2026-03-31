"""EIP-8004 IdentityRegistry interaction — register agent, cache agentId."""

import base64
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any

from eth_account import Account
from shopping.evm import BASE_SEPOLIA_CHAIN_ID, agent_account
from shopping.ipfs import pin_json_to_ipfs

log = logging.getLogger(__name__)

AGENT_ID_CACHE = Path(".erc8004_agent_id")

REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"


def _apply_eip1559_fees(w3, tx: dict) -> None:
    """
    Ensure an EIP-1559 (dynamic fee) tx dict can be signed.

    Some web3 providers pre-populate maxFeePerGas/maxPriorityFeePerGas; in that case,
    we only remove legacy gasPrice. Otherwise we derive a reasonable maxFeePerGas.
    """
    tx.pop("gasPrice", None)

    if "maxPriorityFeePerGas" not in tx:
        try:
            # Web3 exposes this as a property on many providers.
            tx["maxPriorityFeePerGas"] = w3.eth.max_priority_fee
        except Exception:
            tx["maxPriorityFeePerGas"] = w3.eth.gas_price

    if "maxFeePerGas" not in tx:
        try:
            pending_block = w3.eth.get_block("pending")
            base_fee = pending_block.get("baseFeePerGas")
            if base_fee is not None:
                tx["maxFeePerGas"] = 2 * int(base_fee) + int(tx["maxPriorityFeePerGas"])
            else:
                tx["maxFeePerGas"] = int(w3.eth.gas_price) * 2
        except Exception:
            tx["maxFeePerGas"] = int(w3.eth.gas_price) * 2

# IdentityRegistry — overloads: register(), register(string), register(string, MetadataEntry[])
IDENTITY_REGISTRY_ABI = [
    {
        "name": "register",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
    },
    {
        "name": "register",
        "type": "function",
        "inputs": [{"name": "agentURI", "type": "string"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
    },
    {
        "name": "balanceOf",
        "type": "function",
        "inputs": [{"name": "owner", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "name": "getAgentWallet",
        "type": "function",
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "name": "ownerOf",
        "type": "function",
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "name": "tokenURI",
        "type": "function",
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
    },
    {
        "name": "setAgentURI",
        "type": "function",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "newURI", "type": "string"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "anonymous": False,
        "name": "Registered",
        "type": "event",
        "inputs": [
            {"name": "agentId", "type": "uint256", "indexed": True},
            {"name": "agentURI", "type": "string", "indexed": False},
            {"name": "owner", "type": "address", "indexed": True},
        ],
    },
]

# ReputationRegistry (EIP-8004) — for optional server-side or reference
REPUTATION_REGISTRY_ABI = [
    {
        "name": "giveFeedback",
        "type": "function",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "value", "type": "int128"},
            {"name": "valueDecimals", "type": "uint8"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
            {"name": "endpoint", "type": "string"},
            {"name": "feedbackURI", "type": "string"},
            {"name": "feedbackHash", "type": "bytes32"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "getSummary",
        "type": "function",
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddresses", "type": "address[]"},
            {"name": "tag1", "type": "string"},
            {"name": "tag2", "type": "string"},
        ],
        "outputs": [
            {"name": "count", "type": "uint64"},
            {"name": "summaryValue", "type": "int128"},
            {"name": "summaryValueDecimals", "type": "uint8"},
        ],
        "stateMutability": "view",
    },
    {
        "name": "getIdentityRegistry",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "identityRegistry", "type": "address"}],
        "stateMutability": "view",
    },
]


def _w3_and_registry():
    from web3 import Web3  # noqa: PLC0415

    registry_addr = os.environ.get("ERC8004_IDENTITY_REGISTRY", "").strip()
    if not registry_addr:
        log.warning("EIP-8004: ERC8004_IDENTITY_REGISTRY not configured")
        return None, None, None
    rpc_url = os.environ.get("IDENTITY_REGISTRY_RPC", "https://sepolia.base.org")
    try:
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        checksum = Web3.to_checksum_address(registry_addr)
        contract = w3.eth.contract(address=checksum, abi=IDENTITY_REGISTRY_ABI)
        log.info(
            "EIP-8004: using identity registry=%s rpc=%s",
            checksum,
            rpc_url,
        )
        return w3, contract, registry_addr
    except Exception:
        log.exception(
            "EIP-8004: failed to init identity registry client registry=%s rpc=%s",
            registry_addr,
            rpc_url,
        )
        return None, None, None


def agent_registry_caip10() -> str:
    """eip155:chainId:0x... for IdentityRegistry contract."""
    reg = os.environ.get("ERC8004_IDENTITY_REGISTRY", "").strip()
    if not reg:
        return ""
    return f"eip155:{BASE_SEPOLIA_CHAIN_ID}:{reg}"


def build_registration_dict(
    name: str,
    description: str,
    *,
    on_chain_agent_id: int | None = None,
    image: str = "",
    x402_support: bool = True,
) -> dict:
    """ERC-8004 registration-v1 document (before or after mint)."""
    reg = agent_registry_caip10()
    registrations: list[dict] = []
    if on_chain_agent_id is not None and reg:
        registrations = [
            {"agentId": on_chain_agent_id, "agentRegistry": reg},
        ]
    return {
        "type": REGISTRATION_TYPE,
        "name": name or "Aaroh Agent",
        "description": description or "Autonomous shopping agent powered by Aaroh",
        "image": image,
        "services": [],
        "x402Support": x402_support,
        "active": True,
        "registrations": registrations,
        "supportedTrust": ["reputation"],
    }


def build_agent_manifest(
    *,
    agent_name: str,
    description: str,
    operator_wallet: str | None,
    erc8004_agent_id: int | None,
    supported_tools: list[dict[str, str]],
    model: str,
    max_iterations: int,
    max_llm_retries: int,
    task_categories: list[str] | None = None,
) -> dict[str, Any]:
    """Machine-readable agent capability manifest for challenge submissions."""
    registry_addr = (os.environ.get("ERC8004_IDENTITY_REGISTRY", "") or "").strip()
    reputation_addr = (os.environ.get("ERC8004_REPUTATION_REGISTRY", "") or "").strip()
    facilitator = os.environ.get("X402_FACILITATOR_URL", "https://x402.org/facilitator")
    manifest: dict[str, Any] = {
        "name": agent_name or "Aaroh Agent",
        "description": description or "Autonomous shopping agent powered by Aaroh",
        "operator_wallet": operator_wallet or "",
        "erc8004_identity": {
            "agent_id": erc8004_agent_id,
            "network": f"eip155:{BASE_SEPOLIA_CHAIN_ID}",
            "identity_registry": registry_addr or None,
            "reputation_registry": reputation_addr or None,
        },
        "supported_tools": supported_tools,
        "supported_tech_stacks": [
            "python",
            "fastapi",
            "google-genai",
            "x402",
            "ucp",
            "erc-8004",
        ],
        "compute_constraints": {
            "max_iterations": max_iterations,
            "max_llm_retries": max_llm_retries,
            "model": model,
        },
        "supported_task_categories": task_categories
        or [
            "shopping",
            "product-discovery",
            "autonomous-checkout",
            "x402-payment",
        ],
        "x402_support": {
            "network": os.environ.get("X402_NETWORK", f"eip155:{BASE_SEPOLIA_CHAIN_ID}"),
            "asset": os.environ.get("X402_USDC_ADDRESS", "USDC"),
            "facilitator": facilitator,
        },
    }
    return manifest


def registration_json_to_data_uri(doc: dict) -> str:
    """Encode registration JSON as EIP-8004 data URI."""
    raw = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:application/json;base64,{b64}"


def registration_json_to_ipfs_uri(doc: dict, *, pin_name: str | None = None) -> tuple[str, str]:
    """Pin registration JSON to IPFS and return (ipfs_uri, cid)."""
    cid = pin_json_to_ipfs(doc, name=pin_name)
    return f"ipfs://{cid}", cid


def register_with_data_uri(private_key_hex: str, data_uri: str) -> int | None:
    """Mint IdentityRegistry NFT with agentURI (e.g. data:application/json;base64,...).

    Returns agentId on success. If wallet already holds an agent NFT, returns existing id.
    """
    result = _w3_and_registry()
    if result[0] is None:
        return None
    w3, contract, _ = result

    # Separate try blocks so we can log granular context for each failure stage.
    account = Account.from_key(private_key_hex)
    rpc_url = os.environ.get("IDENTITY_REGISTRY_RPC", "https://sepolia.base.org")
    registry_addr = (os.environ.get("ERC8004_IDENTITY_REGISTRY", "") or "").strip()
    data_uri_hash = hashlib.sha256(data_uri.encode("utf-8")).hexdigest()
    log.info(
        "EIP-8004: register(string) start account=%s chainId=%s registry=%s rpc=%s uri_len=%d uri_sha256=%s",
        account.address,
        BASE_SEPOLIA_CHAIN_ID,
        registry_addr or "<missing>",
        rpc_url,
        len(data_uri),
        data_uri_hash[:12],
    )

    balance = None
    try:
        balance = contract.functions.balanceOf(account.address).call()
        log.info("EIP-8004: balanceOf account=%s balance=%s", account.address, balance)
    except Exception:
        log.exception(
            "EIP-8004: balanceOf failed account=%s registry=%s rpc=%s",
            account.address,
            registry_addr,
            rpc_url,
        )
        return None

    if balance and balance > 0:
        try:
            events = contract.events.Registered.get_logs(
                from_block=0,
                argument_filters={"owner": account.address},
            )
            if events:
                agent_id = int(events[-1]["args"]["agentId"])
                log.info(
                    "EIP-8004: existing agentId=%d for account=%s",
                    agent_id,
                    account.address,
                )
                return agent_id
            log.info(
                "EIP-8004: balanceOf>0 but no Registered events found account=%s",
                account.address,
            )
        except Exception:
            log.exception(
                "EIP-8004: fetching existing Registered events failed account=%s",
                account.address,
            )
            # Continue to attempt re-registration; contract may still revert or succeed.

    nonce = None
    tx = None
    tx_hash = None
    receipt = None
    try:
        log.info("EIP-8004: registering with URI len=%d account=%s", len(data_uri), account.address)
        nonce = w3.eth.get_transaction_count(account.address)
        reg_fn = contract.get_function_by_signature("register(string)")
        tx = reg_fn(data_uri).build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "chainId": BASE_SEPOLIA_CHAIN_ID,
            }
        )

        # Best-effort preflight: if the call would revert, log the revert reason.
        try:
            call_tx = {"from": tx["from"], "to": tx["to"], "data": tx["data"], "value": 0}
            w3.eth.call(call_tx, "pending")
            log.info("EIP-8004: preflight eth_call succeeded (no revert)")
        except Exception as call_exc:
            log.warning("EIP-8004: preflight eth_call reverted: %s", call_exc)

        log.info(
            "EIP-8004: tx build account=%s nonce=%s gasPrice(wei)=%s",
            account.address,
            nonce,
            int(w3.eth.gas_price),
        )

        try:
            tx["gas"] = w3.eth.estimate_gas(tx)
        except Exception:
            log.exception(
                "EIP-8004: estimate_gas failed account=%s nonce=%s registry=%s rpc=%s",
                account.address,
                nonce,
                registry_addr,
                rpc_url,
            )
            # Try again with eth_call after estimate_gas failure (may still include revert reason).
            try:
                call_tx = {"from": tx.get("from"), "to": tx.get("to"), "data": tx.get("data"), "value": 0}
                w3.eth.call(call_tx, "pending")
            except Exception as call_exc:
                log.warning("EIP-8004: eth_call after estimate_gas failure: %s", call_exc)
            return None

        try:
            _apply_eip1559_fees(w3, tx)
        except Exception:
            tx["gasPrice"] = w3.eth.gas_price
        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        log.info("EIP-8004: tx submitted tx_hash=%s", tx_hash.hex())

        try:
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        except Exception:
            log.exception("EIP-8004: wait_for_transaction_receipt failed tx_hash=%s", tx_hash.hex())
            try:
                receipt = w3.eth.get_transaction_receipt(tx_hash)
            except Exception:
                receipt = None
            if receipt is None:
                return None

        log.info(
            "EIP-8004: receipt tx_hash=%s status=%s block=%s gasUsed=%s effectiveGasPrice=%s",
            tx_hash.hex(),
            getattr(receipt, "status", None),
            getattr(receipt, "blockNumber", None),
            getattr(receipt, "gasUsed", None),
            getattr(receipt, "effectiveGasPrice", None),
        )

        # If mined but reverted, try to extract a revert reason via eth_call.
        if getattr(receipt, "status", None) not in (1, "0x1"):
            try:
                call_tx = {"from": tx["from"], "to": tx["to"], "data": tx["data"], "value": 0}
                w3.eth.call(call_tx, "pending")
            except Exception as call_exc:
                log.warning(
                    "EIP-8004: eth_call after failed receipt reverted: %s",
                    call_exc,
                )

        try:
            registered_logs = contract.events.Registered().process_receipt(receipt)
        except Exception:
            log.exception("EIP-8004: process_receipt failed tx_hash=%s", tx_hash.hex())
            registered_logs = []

        if registered_logs:
            agent_id = int(registered_logs[0]["args"]["agentId"])
            log.info(
                "EIP-8004: registered agentId=%d for account=%s",
                agent_id,
                account.address,
            )
            return agent_id

        log.warning(
            "EIP-8004: registration transaction did not emit Registered logs (tx_hash=%s status=%s)",
            tx_hash.hex(),
            getattr(receipt, "status", None),
        )
    except Exception:
        log.exception(
            "EIP-8004: register_with_data_uri unexpected failure account=%s registry=%s rpc=%s nonce=%s tx_hash=%s",
            account.address,
            registry_addr,
            rpc_url,
            nonce,
            tx_hash.hex() if tx_hash else None,
        )

    return None


def set_agent_uri(private_key_hex: str, agent_id: int, data_uri: str) -> bool:
    """Update tokenURI via setAgentURI (owner must be msg.sender)."""
    result = _w3_and_registry()
    if result[0] is None:
        return False
    w3, contract, _ = result

    try:
        account = Account.from_key(private_key_hex)
        nonce = w3.eth.get_transaction_count(account.address)
        set_fn = contract.get_function_by_signature("setAgentURI(uint256,string)")
        tx = set_fn(agent_id, data_uri).build_transaction({
            "from": account.address,
            "nonce": nonce,
            "chainId": BASE_SEPOLIA_CHAIN_ID,
        })
        tx["gas"] = w3.eth.estimate_gas(tx)
        try:
            _apply_eip1559_fees(w3, tx)
        except Exception:
            tx["gasPrice"] = w3.eth.gas_price
        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        log.info("EIP-8004: setAgentURI agentId=%d", agent_id)
        return True
    except Exception as exc:
        log.warning("EIP-8004: set_agent_uri failed: %s", exc)
        return False


def register_consumer_agent_eip8004(
    private_key_hex: str,
    name: str,
    description: str,
    *,
    operator_wallet: str | None = None,
    supported_tools: list[dict[str, str]] | None = None,
    model: str = "",
    max_iterations: int = 20,
    max_llm_retries: int = 6,
) -> int | None:
    """Full flow: register with minimal data URI, then setAgentURI with registrations filled."""
    # Step 1: mint with registration doc without on-chain agentId in registrations.
    # Use IPFS URI when PINATA_JWT is configured, else fallback to data URI.
    doc_initial = build_registration_dict(name, description, on_chain_agent_id=None)
    uri_initial: str
    use_ipfs = bool(os.environ.get("PINATA_JWT", "").strip())
    if use_ipfs:
        try:
            uri_initial, cid_initial = registration_json_to_ipfs_uri(
                doc_initial, pin_name=f"aaroh-registration-initial-{name or 'agent'}"
            )
            log.info("EIP-8004: pinned initial registration to IPFS cid=%s", cid_initial)
        except Exception as exc:
            log.warning("EIP-8004: IPFS pin failed; falling back to data URI: %s", exc)
            uri_initial = registration_json_to_data_uri(doc_initial)
    else:
        uri_initial = registration_json_to_data_uri(doc_initial)
    agent_id = register_with_data_uri(private_key_hex, uri_initial)
    if agent_id is None:
        return None
    # Step 2: update URI with proper registrations entry. Prefer agent manifest on IPFS.
    if use_ipfs:
        tools = supported_tools or []
        manifest = build_agent_manifest(
            agent_name=name,
            description=description,
            operator_wallet=operator_wallet,
            erc8004_agent_id=agent_id,
            supported_tools=tools,
            model=model,
            max_iterations=max_iterations,
            max_llm_retries=max_llm_retries,
        )
        try:
            uri_final, cid = registration_json_to_ipfs_uri(
                manifest, pin_name=f"aaroh-agent-manifest-{agent_id}"
            )
            log.info("EIP-8004: pinned agent manifest to IPFS cid=%s", cid)
        except Exception as exc:
            log.warning("EIP-8004: manifest IPFS pin failed; falling back to registration doc: %s", exc)
            doc_final = build_registration_dict(name, description, on_chain_agent_id=agent_id)
            uri_final = registration_json_to_data_uri(doc_final)
    else:
        doc_final = build_registration_dict(name, description, on_chain_agent_id=agent_id)
        uri_final = registration_json_to_data_uri(doc_final)
    if set_agent_uri(private_key_hex, agent_id, uri_final):
        return agent_id
    # Mint succeeded but update failed — still return agent id
    return agent_id


def get_reputation_summary(
    agent_id: int,
    *,
    tag1: str = "starred",
    tag2: str = "session",
    client_addresses: list[str] | None = None,
) -> dict[str, Any]:
    """Read EIP-8004 reputation summary for an agent."""
    from web3 import Web3  # noqa: PLC0415

    reputation_addr = os.environ.get("ERC8004_REPUTATION_REGISTRY", "").strip()
    if not reputation_addr:
        raise RuntimeError("ERC8004_REPUTATION_REGISTRY is not configured")
    rpc_url = os.environ.get("IDENTITY_REGISTRY_RPC", "https://sepolia.base.org")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(reputation_addr),
        abi=REPUTATION_REGISTRY_ABI,
    )
    count, summary_value, summary_decimals = contract.functions.getSummary(
        int(agent_id),
        client_addresses or [],
        tag1,
        tag2,
    ).call()
    return {
        "agent_id": int(agent_id),
        "count": int(count),
        "summary_value": int(summary_value),
        "summary_decimals": int(summary_decimals),
        "tag1": tag1,
        "tag2": tag2,
        "reputation_registry": reputation_addr,
        "network": f"eip155:{BASE_SEPOLIA_CHAIN_ID}",
    }


def get_agent_token_uri(agent_id: int) -> str:
    """Read tokenURI for an EIP-8004 identity NFT."""
    result = _w3_and_registry()
    if result[0] is None:
        raise RuntimeError("ERC8004_IDENTITY_REGISTRY is not configured")
    _w3, contract, _ = result
    uri = contract.functions.tokenURI(int(agent_id)).call()
    if not isinstance(uri, str):
        raise RuntimeError("Invalid tokenURI response")
    return uri


def get_or_register_eip8004_identity() -> int | None:
    """Return the agent's EIP-8004 agentId, registering on-chain if needed.

    Returns None if ERC8004_IDENTITY_REGISTRY is not configured.
    Caches the agentId in .erc8004_agent_id to avoid re-registering on restart.
    """
    registry_addr = os.environ.get("ERC8004_IDENTITY_REGISTRY", "").strip()
    if not registry_addr:
        return None

    if AGENT_ID_CACHE.exists():
        try:
            return int(AGENT_ID_CACHE.read_text().strip())
        except ValueError:
            pass

    try:
        from web3 import Web3  # noqa: PLC0415

        rpc_url = os.environ.get(
            "IDENTITY_REGISTRY_RPC",
            "https://sepolia.base.org",
        )
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        account = agent_account()
        checksum_addr = Web3.to_checksum_address(registry_addr)
        contract = w3.eth.contract(address=checksum_addr, abi=IDENTITY_REGISTRY_ABI)

        balance = contract.functions.balanceOf(account.address).call()
        if balance > 0:
            events = contract.events.Registered.get_logs(
                from_block=0,
                argument_filters={"owner": account.address},
            )
            if events:
                agent_id = int(events[-1]["args"]["agentId"])
                AGENT_ID_CACHE.write_text(str(agent_id))
                log.info("EIP-8004: existing agentId=%d for %s", agent_id, account.address)
                return agent_id

        log.info("EIP-8004: registering %s in %s", account.address, registry_addr)
        nonce = w3.eth.get_transaction_count(account.address)
        reg_fn = contract.get_function_by_signature("register()")
        tx = reg_fn().build_transaction({
            "from": account.address,
            "nonce": nonce,
            "chainId": BASE_SEPOLIA_CHAIN_ID,
        })
        tx["gas"] = w3.eth.estimate_gas(tx)
        try:
            _apply_eip1559_fees(w3, tx)
        except Exception:
            tx["gasPrice"] = w3.eth.gas_price

        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        log.info("EIP-8004: tx %s", tx_hash.hex())

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        registered_logs = contract.events.Registered().process_receipt(receipt)
        if registered_logs:
            agent_id = int(registered_logs[0]["args"]["agentId"])
            AGENT_ID_CACHE.write_text(str(agent_id))
            log.info("EIP-8004: registered agentId=%d", agent_id)
            return agent_id

    except Exception as exc:
        log.warning("EIP-8004: registration failed: %s", exc)

    return None


def register_with_key(private_key_hex: str) -> int | None:
    """Register an EIP-8004 identity for any given private key (legacy bare register).

    Returns the agentId on success, None if registry not configured or on error.
    """
    registry_addr = os.environ.get("ERC8004_IDENTITY_REGISTRY", "").strip()
    if not registry_addr:
        return None

    try:
        from web3 import Web3  # noqa: PLC0415

        rpc_url = os.environ.get("IDENTITY_REGISTRY_RPC", "https://sepolia.base.org")
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        account = Account.from_key(private_key_hex)
        checksum_addr = Web3.to_checksum_address(registry_addr)
        contract = w3.eth.contract(address=checksum_addr, abi=IDENTITY_REGISTRY_ABI)

        balance = contract.functions.balanceOf(account.address).call()
        if balance > 0:
            events = contract.events.Registered.get_logs(
                from_block=0,
                argument_filters={"owner": account.address},
            )
            if events:
                agent_id = int(events[-1]["args"]["agentId"])
                log.info("EIP-8004: existing agentId=%d for %s", agent_id, account.address)
                return agent_id

        log.info("EIP-8004: registering %s in %s", account.address, registry_addr)
        nonce = w3.eth.get_transaction_count(account.address)
        reg_fn = contract.get_function_by_signature("register()")
        tx = reg_fn().build_transaction({
            "from": account.address,
            "nonce": nonce,
            "chainId": BASE_SEPOLIA_CHAIN_ID,
        })
        tx["gas"] = w3.eth.estimate_gas(tx)
        try:
            _apply_eip1559_fees(w3, tx)
        except Exception:
            tx["gasPrice"] = w3.eth.gas_price

        signed_tx = w3.eth.account.sign_transaction(tx, account.key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        log.info("EIP-8004: tx %s", tx_hash.hex())

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        registered_logs = contract.events.Registered().process_receipt(receipt)
        if registered_logs:
            agent_id = int(registered_logs[0]["args"]["agentId"])
            log.info("EIP-8004: registered agentId=%d for %s", agent_id, account.address)
            return agent_id

    except Exception as exc:
        log.warning("EIP-8004: register_with_key failed: %s", exc)

    return None
