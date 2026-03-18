"""EIP-8004 IdentityRegistry interaction — register agent, cache agentId."""

import logging
import os
from pathlib import Path

from eth_account import Account
from shopping.evm import ETH_SEPOLIA_CHAIN_ID, agent_account

log = logging.getLogger(__name__)

AGENT_ID_CACHE = Path(".erc8004_agent_id")

IDENTITY_REGISTRY_ABI = [
    {
        "name": "register",
        "type": "function",
        "inputs": [],
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
            "https://rpc.sepolia.org",
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
        tx = contract.functions.register().build_transaction({
            "from": account.address,
            "nonce": nonce,
            "chainId": ETH_SEPOLIA_CHAIN_ID,
        })
        tx["gas"] = w3.eth.estimate_gas(tx)
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
    """Register an EIP-8004 identity for any given private key (no global env var required).

    Returns the agentId on success, None if registry not configured or on error.
    """
    registry_addr = os.environ.get("ERC8004_IDENTITY_REGISTRY", "").strip()
    if not registry_addr:
        return None

    try:
        from web3 import Web3  # noqa: PLC0415

        rpc_url = os.environ.get("IDENTITY_REGISTRY_RPC", "https://rpc.sepolia.org")
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        account = Account.from_key(private_key_hex)
        checksum_addr = Web3.to_checksum_address(registry_addr)
        contract = w3.eth.contract(address=checksum_addr, abi=IDENTITY_REGISTRY_ABI)

        # Already registered?
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
        tx = contract.functions.register().build_transaction({
            "from": account.address,
            "nonce": nonce,
            "chainId": ETH_SEPOLIA_CHAIN_ID,
        })
        tx["gas"] = w3.eth.estimate_gas(tx)
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
