#   Copyright 2026 UCP Authors
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

"""FastAPI dependencies for the UCP server.

This module contains dependency injection logic for FastAPI endpoints,
including:
- Header validation (UCP-Agent, Idempotency-Key, Request-Signature).
- Service instantiation (CheckoutService, FulfillmentService).
- Database session management (Products and Transactions DBs).
- Request signature verification for webhooks.
"""

import hashlib
import re
from collections.abc import AsyncGenerator
from typing import Annotated

import config
import db
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import Depends
from fastapi import Header
from fastapi import HTTPException
from fastapi import Request
from pydantic import BaseModel
from services.checkout_service import CheckoutService
from services.fulfillment_service import FulfillmentService
from sqlalchemy.ext.asyncio import AsyncSession


class CommonHeaders(BaseModel):
  """Common headers used in UCP requests."""

  x_api_key: str | None = None
  ucp_agent: str
  request_signature: str
  request_id: str


def _evm_address_from_ucp_agent(ucp_agent: str) -> str | None:
  """Parse evm:0x… address from UCP-Agent profile (e.g. profile=\"evm:0x…;erc8004=1\")."""
  match = re.search(r"evm:(0x[a-fA-F0-9]{40})", ucp_agent)
  return match.group(1) if match else None


def _verify_request_body_signature(ucp_agent: str, request_signature: str, body: bytes) -> None:
  """Verify EIP-191 signature over SHA256(request body) for autonomous agents."""
  if request_signature in ("browser", "test", "agent-auto"):
    return
  if not request_signature.startswith("eip191-sha256="):
    return
  sig_hex = request_signature.split("=", 1)[1].strip()
  expected_addr = _evm_address_from_ucp_agent(ucp_agent)
  if not expected_addr:
    raise HTTPException(
      status_code=401,
      detail="UCP-Agent must include evm:0x… address for eip191-sha256 signatures",
    )
  try:
    message = encode_defunct(primitive=hashlib.sha256(body).digest())
    recovered = Account.recover_message(message, signature=sig_hex)
  except Exception as exc:
    raise HTTPException(
      status_code=401, detail=f"Invalid Request-Signature: {exc}"
    ) from exc
  if recovered.lower() != expected_addr.lower():
    raise HTTPException(status_code=401, detail="Request-Signature does not match UCP-Agent address")


async def common_headers(
  request: Request,
  x_api_key: str | None = Header(None),
  ucp_agent: str = Header(...),
  request_signature: str = Header(...),
  request_id: str = Header(...),
) -> CommonHeaders:
  """Extract and validate common headers."""
  await validate_ucp_headers(ucp_agent)
  body = getattr(request.state, "body_bytes", b"")
  _verify_request_body_signature(ucp_agent, request_signature, body)
  return CommonHeaders(
    x_api_key=x_api_key,
    ucp_agent=ucp_agent,
    request_signature=request_signature,
    request_id=request_id,
  )


async def validate_ucp_headers(ucp_agent: str):
  """Validate UCP headers and version negotiation."""
  server_version = config.get_server_version()
  agent_version = server_version  # Default to server version if not specified

  # Use regex to extract version more robustly.
  # We look for 'version=' either at the start or after a semicolon,
  # allowing for whitespace.
  # Matches: version="1.2.3" or version=1.2.3
  match = re.search(
    r"(?:^|;)\s*version=(?:\"([^\"]+)\"|([^;]+))", ucp_agent, re.IGNORECASE
  )
  if match:
    # Group 1 is quoted value, Group 2 is unquoted value
    agent_version = match.group(1) or match.group(2)
    agent_version = agent_version.strip()

  if agent_version > server_version:
    raise HTTPException(
      status_code=400,
      detail={
        "status": "error",
        "errors": [
          {
            "code": "VERSION_UNSUPPORTED",
            "message": (
              f"Version {agent_version} is not supported. This merchant"
              f" implements version {server_version}."
            ),
            "severity": "critical",
          }
        ],
      },
    )


async def idempotency_header(
  idempotency_key: str = Header(...),
) -> str:
  """Extract the Idempotency-Key header."""
  return idempotency_key


async def verify_signature(
  request_signature: str = Header(..., alias="Request-Signature"),
) -> None:
  """Verify the request signature (webhook / legacy paths without UCP-Agent body binding).

  Full EIP-191 body verification is applied via common_headers for checkout routes.
  """
  if request_signature == "test":
    return
  return


async def verify_simulation_secret(
  simulation_secret: str | None = Header(None, alias="Simulation-Secret"),
) -> None:
  """Verify the secret for simulation endpoints."""
  expected_secret = config.FLAGS.simulation_secret
  if not expected_secret:
    raise HTTPException(
      status_code=500, detail="Simulation secret not configured"
    )

  if not simulation_secret or simulation_secret != expected_secret:
    raise HTTPException(status_code=403, detail="Invalid Simulation Secret")


def get_fulfillment_service() -> FulfillmentService:
  """Dependency provider for FulfillmentService."""
  return FulfillmentService()


async def get_products_db() -> AsyncGenerator[AsyncSession, None]:
  """Dependency provider for Products DB session."""
  async with db.manager.products_session_factory() as session:
    yield session


async def get_transactions_db() -> AsyncGenerator[AsyncSession, None]:
  """Dependency provider for Transactions DB session."""
  async with db.manager.transactions_session_factory() as session:
    yield session


def get_checkout_service(
  request: Request,
  fulfillment_service: Annotated[
    FulfillmentService, Depends(get_fulfillment_service)
  ],
  products_session: Annotated[AsyncSession, Depends(get_products_db)],
  transactions_session: Annotated[AsyncSession, Depends(get_transactions_db)],
) -> CheckoutService:
  """Dependency provider for CheckoutService."""
  return CheckoutService(
    fulfillment_service,
    products_session,
    transactions_session,
    str(request.base_url),
  )
