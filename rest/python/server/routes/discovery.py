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

"""Discovery routes for the UCP server."""

import json
import os
import pathlib
import uuid
from fastapi import APIRouter
from fastapi import Request
from ucp_sdk.models.discovery.profile_schema import UcpDiscoveryProfile

router = APIRouter()


def _profile_path() -> pathlib.Path:
  """Resolve discovery profile path (merchant-specific or default)."""
  try:
    import config
    return config._discovery_profile_path()
  except Exception:
    return pathlib.Path(__file__).parent / "discovery_profile.json"


PROFILE_TEMPLATE_PATH = pathlib.Path(__file__).parent / "discovery_profile.json"

# Generate a unique shop ID for this server instance
SHOP_ID = str(uuid.uuid4())


@router.get(
  "/.well-known/ucp",
  summary="Get Merchant Profile",
)
async def get_merchant_profile(request: Request):
  """Return the merchant profile and capabilities."""
  profile_path = _profile_path()
  with profile_path.open(encoding="utf-8") as f:
    template = f.read()

  # Get values from environment or use defaults
  merchant_wallet = os.environ.get("MERCHANT_WALLET", "0x0000000000000000000000000000000000000000")
  merchant_name = os.environ.get("MERCHANT_NAME", "Artisan India")
  product_categories = os.environ.get("PRODUCT_CATEGORIES", "Handicrafts, Textiles, Jewelry")

  # Replace placeholders only if they exist
  profile_json = template
  if "{{ENDPOINT}}" in profile_json:
    profile_json = profile_json.replace("{{ENDPOINT}}", str(request.base_url).rstrip("/"))
  if "{{SHOP_ID}}" in profile_json:
    profile_json = profile_json.replace("{{SHOP_ID}}", SHOP_ID)
  if "{{MERCHANT_WALLET}}" in profile_json:
    profile_json = profile_json.replace("{{MERCHANT_WALLET}}", merchant_wallet)
  if "{{MERCHANT_NAME}}" in profile_json:
    profile_json = profile_json.replace("{{MERCHANT_NAME}}", merchant_name)
  if "{{PRODUCT_CATEGORIES}}" in profile_json:
    profile_json = profile_json.replace("{{PRODUCT_CATEGORIES}}", product_categories)

  data = json.loads(profile_json)
  # Strip keys not in UcpDiscoveryProfile schema (e.g. merchant extensions)
  merchant_data = data.pop("merchant", None)
  for key in list(data):
    if key not in ("ucp", "capabilities", "payment"):
      del data[key]
  # Normalize: SDK expects ucp.capabilities, not top-level capabilities
  if "capabilities" in data and "ucp" in data:
    data["ucp"]["capabilities"] = data.pop("capabilities", [])
  # Ensure payment handlers have required SDK fields
  for handler in data.get("payment", {}).get("handlers", []) or []:
    handler.setdefault(
      "config_schema",
      "https://ucp.dev/schemas/payment-handler-config.json",
    )
    handler.setdefault("instrument_schemas", [])
  
  # Add merchant data back if it exists (for MCP client access)
  if merchant_data:
    data["merchant"] = merchant_data
  
  return data
