#!/usr/bin/env python3
"""
Autonomous shopping agent — FastAPI service wrapping the shopping/ package.

Endpoints:
    GET  /health
    GET  /identity
    GET  /instructions
    POST /instructions          {"instructions": "..."}
    POST /agents                {"id", "name", "instructions"}  → {id, address, erc8004_id: null}
    GET  /agents/{id}/registration.json
    POST /agents/{id}/register  → EIP-8004 mint (agent wallet pays gas; fund ETH first)
    GET  /agents/{id}/address
    DELETE /agents/{id}
    POST /shop                  {"task", "consumer_agent_id", ...}
    POST /register              (legacy; prefer POST /agents)
    GET  /tasks /tasks/{id} /tasks/{id}/events

Environment variables:
    AGENT_API_SECRET            – Bearer token required on all routes except /health (optional if unset)
    AGENT_KEY_ENCRYPTION_SECRET – Required for POST /agents (Fernet-derived key storage)
    AGENT_KEYS_STORE            – Path to JSON store (default .agent_keys.json)
    AGENT_PRIVATE_KEY           – Fallback demo key when consumer_agent_id not used
    GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_MODEL, MERCHANT_URL, …
"""

import asyncio
import json
import logging
import os
import secrets
import threading
import time
import uuid

from dotenv import load_dotenv

load_dotenv()
from dataclasses import dataclass, field
from typing import Any

import uvicorn
from eth_account import Account
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from shopping.agent_loop import run_shopping_agent
from shopping.evm import USDC_BASE_SEPOLIA, agent_address
from shopping.identity import (
    build_agent_manifest,
    build_registration_dict,
    get_agent_token_uri,
    get_or_register_eip8004_identity,
    register_consumer_agent_eip8004,
    register_with_key,
    set_agent_uri,
)
from shopping.ipfs import pin_json_to_ipfs
from shopping.keys import (
    delete_agent_key,
    generate_agent_key,
    get_agent_metadata,
    load_agent_private_key,
)
from shopping.retry_utils import MAX_RETRIES
from shopping.tools import AGENT_TOOLS

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

log = logging.getLogger(__name__)

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Autonomous Shopping Agent (EIP-8004)", version="1.0.0")


@app.middleware("http")
async def verify_agent_api_secret(request: Request, call_next):
    secret = os.environ.get("AGENT_API_SECRET", "").strip()
    if not secret or request.url.path == "/health":
        return await call_next(request)
    auth = request.headers.get("Authorization") or ""
    token = auth.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, secret):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Task tracking ─────────────────────────────────────────────────────────────


@dataclass
class TaskRecord:
    id: str
    task: str
    merchant_url: str | None
    status: str = "running"  # running | done | failed
    result: str | None = None
    order: dict | None = None
    budget: dict | None = None
    events: list[dict] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None


_tasks: dict[str, TaskRecord] = {}
_sse_queues: dict[str, list[asyncio.Queue]] = {}
_event_loop: asyncio.AbstractEventLoop | None = None


def _push_event(task_id: str, event: dict | None) -> None:
    """Thread-safe: append event to task history and broadcast to live SSE queues."""
    record = _tasks.get(task_id)
    if record and event is not None:
        record.events.append(event)
    if _event_loop and task_id in _sse_queues:
        for q in _sse_queues[task_id]:
            asyncio.run_coroutine_threadsafe(q.put(event), _event_loop)


def _run_task(
    task_id: str,
    task: str,
    available_merchants: list[dict],
    global_erc8004_id: int | None,
    consumer_agent_id: str | None,
    erc8004_agent_id: int | None,
) -> None:
    """Executed in a daemon thread; emits SSE events in real time."""

    def emit(event: dict) -> None:
        _push_event(task_id, event)

    effective_erc8004 = erc8004_agent_id if erc8004_agent_id is not None else global_erc8004_id
    try:
        result = run_shopping_agent(
            task,
            available_merchants=available_merchants,
            agent_id=effective_erc8004,
            emit=emit,
            consumer_agent_id=consumer_agent_id,
        )
        record = _tasks[task_id]
        record.status = "done" if result["success"] else "failed"
        record.result = result["result"]
        record.order = result.get("order")
        record.budget = result.get("budget")
        record.completed_at = time.time()
        _push_event(
            task_id,
            {
                "type": "done",
                "success": result["success"],
                "result": result["result"],
                "order": result.get("order"),
                "budget": result.get("budget"),
            },
        )
    except Exception as exc:
        log.exception("Task %s raised an exception", task_id)
        record = _tasks[task_id]
        record.status = "failed"
        record.result = str(exc)
        record.completed_at = time.time()
        _push_event(task_id, {"type": "done", "success": False, "result": str(exc)})
    finally:
        _push_event(task_id, None)


# ── Agent identity ────────────────────────────────────────────────────────────

_agent_id_cache: int | None = None
_agent_id_resolved = False
_agent_instructions: str = os.environ.get("AGENT_INSTRUCTIONS", "")


def _resolve_agent_id() -> int | None:
    global _agent_id_cache, _agent_id_resolved
    if not _agent_id_resolved:
        _agent_id_cache = get_or_register_eip8004_identity()
        _agent_id_resolved = True
    return _agent_id_cache


# ── FastAPI lifecycle ─────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup() -> None:
    global _event_loop
    _event_loop = asyncio.get_running_loop()

    auto_task = os.environ.get("AGENT_TASK", "").strip()
    if auto_task:
        log.info("AGENT_TASK set — launching on startup: %s", auto_task)
        agent_id = _resolve_agent_id()
        task_id = str(uuid.uuid4())
        record = TaskRecord(id=task_id, task=auto_task, merchant_url=None)
        _tasks[task_id] = record
        _sse_queues[task_id] = []
        threading.Thread(
            target=_run_task,
            args=(task_id, auto_task, None, agent_id, None, None),
            daemon=True,
        ).start()


# ── Pydantic models ───────────────────────────────────────────────────────────


class ShopRequest(BaseModel):
    task: str
    available_merchants: list[dict] = []
    consumer_agent_id: str | None = None  # UUID of consumer Agent row; loads key server-side
    erc8004_agent_id: int | None = None  # EIP-8004 on-chain id from DB (optional)


class RegisterRequest(BaseModel):
    private_key_hex: str  # legacy per-key registration


class InstructionsRequest(BaseModel):
    instructions: str


class CreateAgentRequest(BaseModel):
    id: str  # UUID string from consumer app (must match Postgres Agent.id)
    name: str = ""
    instructions: str = ""


class PublishManifestRequest(BaseModel):
    erc8004_id: int
    operator_wallet: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": GEMINI_MODEL}


@app.post("/agents")
def create_consumer_agent(req: CreateAgentRequest) -> dict[str, Any]:
    """Generate EVM key server-side; EIP-8004 registration after funding via POST /agents/{id}/register."""
    if load_agent_private_key(req.id):
        raise HTTPException(status_code=409, detail="Agent id already registered on this server")
    try:
        address, _pk = generate_agent_key(req.id, req.name, req.instructions)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "id": req.id,
        "address": address,
        "erc8004_id": None,
    }


@app.get("/agents/{agent_id}/registration.json")
def get_agent_registration_file(agent_id: str) -> dict[str, Any]:
    """ERC-8004 registration document (same structure as embedded data URI)."""
    if not load_agent_private_key(agent_id):
        raise HTTPException(status_code=404, detail="Unknown agent id")
    meta = get_agent_metadata(agent_id)
    name = meta.get("name") or "Aaroh Agent"
    desc = meta.get("instructions") or "Autonomous shopping agent powered by Aaroh"
    # Without on-chain id we omit registrations or leave empty
    doc = build_registration_dict(name, desc, on_chain_agent_id=None)
    return doc


@app.get("/agents/{agent_id}/manifest")
def get_agent_manifest(agent_id: str, erc8004_id: int | None = None, operator_wallet: str | None = None) -> dict[str, Any]:
    """Return machine-readable agent capability manifest (`agent.json`)."""
    if not load_agent_private_key(agent_id):
        raise HTTPException(status_code=404, detail="Unknown agent id")
    meta = get_agent_metadata(agent_id)
    name = meta.get("name") or "Aaroh Agent"
    desc = meta.get("instructions") or "Autonomous shopping agent powered by Aaroh"
    tools = [{"name": t["name"], "description": t["description"]} for t in AGENT_TOOLS]
    manifest = build_agent_manifest(
        agent_name=name,
        description=desc,
        operator_wallet=operator_wallet,
        erc8004_agent_id=erc8004_id,
        supported_tools=tools,
        model=GEMINI_MODEL,
        max_iterations=20,
        max_llm_retries=MAX_RETRIES,
    )
    return manifest


@app.post("/agents/{agent_id}/publish-manifest")
def publish_agent_manifest(agent_id: str, req: PublishManifestRequest) -> dict[str, Any]:
    """Pin manifest JSON to IPFS and update on-chain agentURI to ipfs://CID."""
    pk = load_agent_private_key(agent_id)
    if not pk:
        raise HTTPException(status_code=404, detail="Unknown agent id")
    meta = get_agent_metadata(agent_id)
    name = meta.get("name") or "Aaroh Agent"
    desc = meta.get("instructions") or "Autonomous shopping agent powered by Aaroh"
    tools = [{"name": t["name"], "description": t["description"]} for t in AGENT_TOOLS]
    manifest = build_agent_manifest(
        agent_name=name,
        description=desc,
        operator_wallet=req.operator_wallet,
        erc8004_agent_id=req.erc8004_id,
        supported_tools=tools,
        model=GEMINI_MODEL,
        max_iterations=20,
        max_llm_retries=MAX_RETRIES,
    )
    try:
        cid = pin_json_to_ipfs(manifest, name=f"aaroh-agent-manifest-{req.erc8004_id}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"IPFS pin failed: {exc}") from exc

    ipfs_uri = f"ipfs://{cid}"
    if not set_agent_uri(pk, req.erc8004_id, ipfs_uri):
        raise HTTPException(status_code=502, detail="setAgentURI failed")

    return {
        "id": agent_id,
        "erc8004_id": req.erc8004_id,
        "ipfs_cid": cid,
        "agent_uri": ipfs_uri,
        "gateway_url": f"https://gateway.pinata.cloud/ipfs/{cid}",
        "manifest": manifest,
    }


@app.get("/agents/{agent_id}/token-uri")
def get_agent_token_uri_endpoint(agent_id: str, erc8004_id: int) -> dict[str, Any]:
    """Read tokenURI for the specified EIP-8004 agent id."""
    try:
        token_uri = get_agent_token_uri(int(erc8004_id))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to read tokenURI: {exc}") from exc
    gateway_url = None
    if token_uri.startswith("ipfs://"):
        gateway_url = f"https://gateway.pinata.cloud/ipfs/{token_uri.removeprefix('ipfs://')}"
    return {
        "id": agent_id,
        "erc8004_id": int(erc8004_id),
        "token_uri": token_uri,
        "gateway_url": gateway_url,
    }


@app.post("/agents/{agent_id}/register")
def register_consumer_agent_on_chain(agent_id: str) -> dict[str, Any]:
    """Mint EIP-8004 identity with data URI registration (requires agent wallet ETH for gas)."""
    pk = load_agent_private_key(agent_id)
    if not pk:
        raise HTTPException(status_code=404, detail="Unknown agent id")

    # This helps correlate consumer DB `agent_id` with the on-chain signer address.
    try:
        signer_address = Account.from_key(pk).address
    except Exception:
        signer_address = "<unknown>"
    meta = get_agent_metadata(agent_id)
    name = meta.get("name") or "Aaroh Agent"
    desc = meta.get("instructions") or "Autonomous shopping agent powered by Aaroh"
    tools = [{"name": t["name"], "description": t["description"]} for t in AGENT_TOOLS]
    aid = register_consumer_agent_eip8004(
        pk,
        name,
        desc,
        supported_tools=tools,
        model=GEMINI_MODEL,
        max_iterations=20,
        max_llm_retries=MAX_RETRIES,
    )
    if aid is None:
        log.error(
            "EIP-8004: register failed consumer_agent_id=%s signer=%s ERC8004_IDENTITY_REGISTRY=%s IDENTITY_REGISTRY_RPC=%s",
            agent_id,
            signer_address,
            os.environ.get("ERC8004_IDENTITY_REGISTRY") or None,
            os.environ.get("IDENTITY_REGISTRY_RPC") or None,
        )
        raise HTTPException(
            status_code=502,
            detail="EIP-8004 registration failed (check ERC8004_IDENTITY_REGISTRY, ETH balance, RPC)",
        )
    return {"id": agent_id, "erc8004_id": aid}


@app.get("/agents/{agent_id}/address")
def get_consumer_agent_address(agent_id: str) -> dict[str, str]:
    pk = load_agent_private_key(agent_id)
    if not pk:
        raise HTTPException(status_code=404, detail="Unknown agent id")
    return {"address": Account.from_key(pk).address}


@app.delete("/agents/{agent_id}")
def delete_consumer_agent(agent_id: str) -> dict[str, bool]:
    delete_agent_key(agent_id)
    return {"ok": True}


@app.get("/identity")
def identity() -> dict[str, Any]:
    try:
        addr = agent_address()
    except RuntimeError as e:
        return {"error": str(e)}
    agent_id = _resolve_agent_id()
    return {
        "address": addr,
        "erc8004": {
            "agent_id": agent_id,
            "identity_registry": os.environ.get("ERC8004_IDENTITY_REGISTRY") or None,
            "network": "eip155:84532",
        },
        "payment": {
            "network": os.environ.get("X402_NETWORK", "eip155:84532"),
            "usdc_contract": USDC_BASE_SEPOLIA,
        },
    }


@app.get("/instructions")
def get_instructions() -> dict[str, str]:
    return {"instructions": _agent_instructions}


@app.post("/instructions")
def set_instructions(req: InstructionsRequest) -> dict[str, Any]:
    global _agent_instructions
    _agent_instructions = req.instructions
    return {"ok": True, "instructions": _agent_instructions}


@app.post("/register")
def register(req: RegisterRequest) -> dict[str, Any]:
    """Register (or retrieve) an EIP-8004 identity for the given private key."""
    agent_id = register_with_key(req.private_key_hex)
    return {"agent_id": agent_id}


@app.post("/shop")
def shop(req: ShopRequest) -> dict[str, str]:
    global_erc8004 = _resolve_agent_id()
    task_id = str(uuid.uuid4())
    record = TaskRecord(id=task_id, task=req.task, merchant_url=None)
    _tasks[task_id] = record
    _sse_queues[task_id] = []
    threading.Thread(
        target=_run_task,
        args=(
            task_id,
            req.task,
            req.available_merchants,
            global_erc8004,
            req.consumer_agent_id,
            req.erc8004_agent_id,
        ),
        daemon=True,
    ).start()
    return {"task_id": task_id, "status": "running"}


@app.get("/tasks")
def list_tasks() -> dict[str, Any]:
    return {
        "tasks": [
            {"id": r.id, "task": r.task, "status": r.status, "result": r.result}
            for r in reversed(list(_tasks.values()))
        ]
    }


@app.get("/tasks/{task_id}")
def get_task(task_id: str) -> dict[str, Any]:
    r = _tasks.get(task_id)
    if not r:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "id": r.id,
        "task": r.task,
        "merchant_url": r.merchant_url,
        "status": r.status,
        "result": r.result,
        "order": r.order,
        "budget": r.budget,
        "started_at": r.started_at,
        "completed_at": r.completed_at,
        "event_count": len(r.events),
    }


@app.get("/tasks/{task_id}/log")
def get_task_log(task_id: str) -> dict[str, Any]:
    """Structured `agent_log.json` export for challenge submission."""
    r = _tasks.get(task_id)
    if not r:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "task_id": r.id,
        "task": r.task,
        "started_at": r.started_at,
        "completed_at": r.completed_at,
        "status": r.status,
        "success": r.status == "done",
        "iterations_used": (r.budget or {}).get("iterations_used"),
        "max_iterations": (r.budget or {}).get("max_iterations", 20),
        "tool_calls": (r.budget or {}).get("tool_calls"),
        "duration_ms": (r.budget or {}).get("duration_ms"),
        "events": r.events,
        "final_output": {"result": r.result, "order": r.order},
    }


@app.get("/tasks/{task_id}/events")
async def task_events(task_id: str) -> StreamingResponse:
    r = _tasks.get(task_id)
    if not r:
        raise HTTPException(status_code=404, detail="Task not found")

    queue: asyncio.Queue = asyncio.Queue()
    _sse_queues.setdefault(task_id, []).append(queue)
    history = list(r.events)  # snapshot before subscribing

    async def generate():
        for evt in history:
            yield f"data: {json.dumps(evt)}\n\n"

        if r.status != "running":
            _sse_queues[task_id].remove(queue)
            return

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    yield 'data: {"type":"keepalive"}\n\n'
                    continue
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            try:
                _sse_queues[task_id].remove(queue)
            except (KeyError, ValueError):
                pass

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8004)
