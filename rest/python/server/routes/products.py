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

"""Product browsing routes for AI clients and storefronts."""

import json
from pathlib import Path
from typing import Any

import config
import db
import dependencies
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _catalogue_path() -> Path | None:
  """Resolve catalogue.json path from products DB path if set."""
  if not config.FLAGS.products_db_path:
    return None
  path = Path(config.FLAGS.products_db_path)
  if not path.is_absolute():
    path = Path.cwd() / path
  return path.parent / "catalogue.json"


def _load_catalogue() -> list[dict[str, Any]] | None:
  """Load catalogue.json if it exists. Returns list of product dicts with rich metadata."""
  path = _catalogue_path()
  if not path or not path.exists():
    return None
  with path.open(encoding="utf-8") as f:
    data = json.load(f)
  return data if isinstance(data, list) else data.get("products", [])


def _catalogue_by_id() -> dict[str, dict[str, Any]]:
  """Return dict of product_id -> catalogue entry."""
  raw = _load_catalogue()
  if not raw:
    return {}
  return {p["id"]: p for p in raw if p.get("id")}


@router.get("/products", summary="List products")
async def list_products(
  q: str | None = None,
  category: str | None = None,
  limit: int = 50,
  products_session: AsyncSession = Depends(dependencies.get_products_db),
) -> dict[str, Any]:
  """List or search products. Returns product summaries from DB, enriched with catalogue metadata when available."""
  if limit > 100:
    limit = 100
  products = await db.list_products(products_session, limit=limit, q=q)
  catalogue = _catalogue_by_id()
  items = []
  for p in products:
    row = {
      "id": p.id,
      "title": p.title,
      "price": p.price,
      "image_url": p.image_url,
    }
    if p.id in catalogue:
      meta = catalogue[p.id]
      if category and meta.get("category") != category:
        continue
      row["description"] = meta.get("description")
      row["category"] = meta.get("category")
      row["origin_state"] = meta.get("origin_state")
      row["artisan_name"] = meta.get("artisan_name")
    elif category:
      continue
    items.append(row)
  return {"products": items, "count": len(items)}


@router.get("/products/{product_id}", summary="Get product")
async def get_product(
  product_id: str,
  products_session: AsyncSession = Depends(dependencies.get_products_db),
) -> dict[str, Any]:
  """Get full product details. Enriched with catalogue metadata when available."""
  product = await db.get_product(products_session, product_id)
  if not product:
    raise HTTPException(status_code=404, detail="Product not found")
  out = {
    "id": product.id,
    "title": product.title,
    "price": product.price,
    "image_url": product.image_url,
  }
  catalogue = _catalogue_by_id()
  if product_id in catalogue:
    meta = catalogue[product_id]
    out["description"] = meta.get("description")
    out["category"] = meta.get("category")
    out["origin_state"] = meta.get("origin_state")
    out["artisan_name"] = meta.get("artisan_name")
    out["gi_tag"] = meta.get("gi_tag")
  return out


@router.get("/products-inventory", summary="List products with inventory")
async def list_products_with_inventory(
  products_session: AsyncSession = Depends(dependencies.get_products_db),
  transactions_session: AsyncSession = Depends(dependencies.get_transactions_db),
) -> dict[str, Any]:
  """List all products with their current inventory quantities."""
  products = await db.list_products(products_session, limit=500)
  inventory = await db.list_inventory(transactions_session)
  catalogue = _catalogue_by_id()
  items = []
  for p in products:
    row: dict[str, Any] = {
      "id": p.id,
      "title": p.title,
      "price": p.price,
      "image_url": p.image_url,
      "stock": inventory.get(p.id, 0),
    }
    if p.id in catalogue:
      meta = catalogue[p.id]
      row["category"] = meta.get("category")
      row["description"] = meta.get("description")
    items.append(row)
  return {"products": items, "count": len(items)}


@router.get("/catalogue", summary="Get full catalogue")
async def get_catalogue() -> dict[str, Any]:
  """Return full catalogue with rich metadata (descriptions, categories, artisan info)."""
  raw = _load_catalogue()
  if raw is None:
    raise HTTPException(
      status_code=404,
      detail="Catalogue not available (no data/catalogue.json)",
    )
  return {"products": raw, "count": len(raw)}
