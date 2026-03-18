#!/usr/bin/env python3
"""
Autonomous shopping agent — FastAPI service wrapping the shopping/ package.

Endpoints:
    GET  /health
    GET  /identity
    GET  /instructions
    POST /instructions          {"instructions": "..."}
    POST /shop                  {"task": "...", "merchant_url": "..."}  → {task_id, status}
    GET  /tasks                 → [{id, task, status, result}]
    GET  /tasks/{id}            → full task record
    GET  /tasks/{id}/events     → SSE stream

Environment variables:
    AGENT_PRIVATE_KEY           – 0x-prefixed hex private key
    GEMINI_API_KEY              – Google Gemini API key
    GEMINI_MODEL                – default "gemini-2.5-flash"
    MERCHANT_URL                – default merchant base URL
    X402_NETWORK                – default "eip155:84532" (Base Sepolia)
    ERC8004_IDENTITY_REGISTRY   – IdentityRegistry contract on Ethereum Sepolia
    IDENTITY_REGISTRY_RPC       – Sepolia RPC URL
    AGENT_INSTRUCTIONS          – initial system prompt suffix
    AGENT_TASK                  – run this task automatically on startup
"""

import asyncio
import json
import logging
import os
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from shopping.agent_loop import run_shopping_agent
from shopping.evm import USDC_ETH_SEPOLIA, agent_address
from shopping.identity import get_or_register_eip8004_identity, register_with_key

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

log = logging.getLogger(__name__)

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Autonomous Shopping Agent (EIP-8004)", version="1.0.0")
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
    events: list[dict] = field(default_factory=list)


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


def _run_task(task_id: str, task: str, available_merchants: list[dict], agent_id: int | None, agent_private_key: str | None = None, erc8004_agent_id: int | None = None) -> None:
    """Executed in a daemon thread; emits SSE events in real time."""

    def emit(event: dict) -> None:
        _push_event(task_id, event)

    # Use per-agent erc8004 id if provided, otherwise fall back to global identity
    effective_agent_id = erc8004_agent_id if erc8004_agent_id is not None else agent_id
    try:
        result = run_shopping_agent(task, available_merchants=available_merchants, agent_id=effective_agent_id, emit=emit, agent_private_key=agent_private_key)
        record = _tasks[task_id]
        record.status = "done" if result["success"] else "failed"
        record.result = result["result"]
        record.order = result.get("order")
        _push_event(task_id, {"type": "done", "success": result["success"], "result": result["result"]})
    except Exception as exc:
        log.exception("Task %s raised an exception", task_id)
        record = _tasks[task_id]
        record.status = "failed"
        record.result = str(exc)
        _push_event(task_id, {"type": "done", "success": False, "result": str(exc)})
    finally:
        # Send sentinel to close all open SSE connections for this task
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
            target=_run_task, args=(task_id, auto_task, None, agent_id), daemon=True
        ).start()


# ── Pydantic models ───────────────────────────────────────────────────────────


class ShopRequest(BaseModel):
    task: str
    available_merchants: list[dict] = []  # [{"name": str, "url": str}]
    agent_private_key: str | None = None  # per-agent derived key (client-side, in-memory only)
    erc8004_agent_id: int | None = None  # pre-registered EIP-8004 agent ID (if known)


class RegisterRequest(BaseModel):
    private_key_hex: str  # per-agent derived private key


class InstructionsRequest(BaseModel):
    instructions: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": GEMINI_MODEL}


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
            "network": "eip155:11155111",
        },
        "payment": {
            "network": os.environ.get("X402_NETWORK", "eip155:11155111"),
            "usdc_contract": USDC_ETH_SEPOLIA,
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
    """Register (or retrieve) an EIP-8004 identity for the given private key.

    Returns {"agent_id": int} on success, {"agent_id": null} if registry not configured
    or registration fails (e.g. insufficient ETH for gas).
    """
    agent_id = register_with_key(req.private_key_hex)
    return {"agent_id": agent_id}


@app.post("/shop")
def shop(req: ShopRequest) -> dict[str, str]:
    agent_id = _resolve_agent_id()
    task_id = str(uuid.uuid4())
    record = TaskRecord(id=task_id, task=req.task, merchant_url=None)
    _tasks[task_id] = record
    _sse_queues[task_id] = []
    threading.Thread(
        target=_run_task,
        args=(task_id, req.task, req.available_merchants, agent_id, req.agent_private_key, req.erc8004_agent_id),
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
        "event_count": len(r.events),
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
        # Replay historical events so late-connecting clients catch up
        for evt in history:
            yield f"data: {json.dumps(evt)}\n\n"

        # If task already finished, close immediately
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
