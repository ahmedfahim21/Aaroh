"""Probe UCP merchants by base URL — shared by mcp_client and autonomous AGENT_TOOLS."""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
from collections.abc import Callable
from typing import Any

import httpx


def probe_merchant(url: str) -> dict[str, Any] | None:
    """Probe a single base URL for /.well-known/ucp. Returns None if not a UCP merchant."""
    url = url.rstrip("/")
    try:
        timeout = httpx.Timeout(connect=1.0, read=3.0, write=1.0, pool=1.0)
        with httpx.Client(timeout=timeout) as client:
            r = client.get(f"{url}/.well-known/ucp")
            r.raise_for_status()
            profile = r.json()
    except Exception:
        return None
    if not isinstance(profile.get("ucp"), dict):
        return None
    merchant = profile.get("merchant") or {}
    cats_raw: str = merchant.get("product_categories", "") or ""
    categories = [c.strip() for c in cats_raw.split(",") if c.strip()]
    handlers = profile.get("payment", {}).get("handlers", [])
    return {
        "name": merchant.get("name", url),
        "url": url,
        "product_categories": categories,
        "payment_handler_ids": [h.get("id", "") for h in handlers if h.get("id")],
    }


def discovery_candidate_urls(
    *,
    connected_base_url: str | None = None,
    extra_base_urls: list[str] | None = None,
) -> list[str]:
    """URLs to probe, from MERCHANT_URLS, MERCHANT_URL, optional session base, and pinned dispatch URLs.

    Does not invent localhost — configure MERCHANT_URL and/or MERCHANT_URLS (or pass extra_base_urls).
    """
    url_set: set[str] = set()
    raw = os.environ.get("MERCHANT_URLS", "").strip()
    if raw:
        for u in re.split(r"[,\s]+", raw):
            if u.strip():
                url_set.add(u.strip().rstrip("/"))
    single = os.environ.get("MERCHANT_URL", "").strip()
    if single:
        url_set.add(single.rstrip("/"))
    if connected_base_url:
        url_set.add(connected_base_url.rstrip("/"))
    if extra_base_urls:
        for u in extra_base_urls:
            if u and str(u).strip():
                url_set.add(str(u).strip().rstrip("/"))
    return sorted(url_set)


def list_merchants_dict(
    category: str | None = None,
    *,
    connected_base_url: str | None = None,
    extra_base_urls: list[str] | None = None,
) -> dict[str, Any]:
    urls = discovery_candidate_urls(
        connected_base_url=connected_base_url,
        extra_base_urls=extra_base_urls,
    )
    if not urls:
        return {
            "merchants": [],
            "count": 0,
            "message": (
                "No merchant URLs to probe. Set MERCHANT_URL (single base URL) and/or "
                "MERCHANT_URLS (comma-separated) in the environment to discover stores."
            ),
        }

    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(len(urls), 1)) as pool:
        for result in pool.map(probe_merchant, urls):
            if result is not None:
                results.append(result)

    if category:
        q = category.lower()
        results = [r for r in results if q in ", ".join(r["product_categories"]).lower()]

    results.sort(key=lambda r: r["name"].lower())

    response: dict[str, Any] = {"merchants": results, "count": len(results)}
    if category:
        response["filtered_by"] = category
    if not results:
        response["message"] = (
            f"No merchants found matching category filter '{category}'."
            if category
            else (
                "No responding UCP merchants at the configured URLs. "
                "Check MERCHANT_URL / MERCHANT_URLS and that servers expose /.well-known/ucp."
            )
        )
    return response


def list_merchants_json(
    category: str | None = None,
    *,
    connected_base_url: str | None = None,
    extra_base_urls: list[str] | None = None,
) -> str:
    payload = list_merchants_dict(
        category,
        connected_base_url=connected_base_url,
        extra_base_urls=extra_base_urls,
    )
    payload["_ui"] = {"type": "merchant-list"}
    return json.dumps(payload)


def find_merchant_json(
    query: str,
    discover_fn: Callable[[str], str],
    *,
    connected_base_url: str | None = None,
    extra_base_urls: list[str] | None = None,
) -> str:
    """Match query against names/categories; if exactly one hit, call discover_fn(url)."""
    urls = discovery_candidate_urls(
        connected_base_url=connected_base_url,
        extra_base_urls=extra_base_urls,
    )
    if not urls:
        return json.dumps({
            "error": "No merchant URLs configured.",
            "suggestion": "Set MERCHANT_URL and/or MERCHANT_URLS, then call list_merchants() again.",
        })

    all_results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(len(urls), 1)) as pool:
        for result in pool.map(probe_merchant, urls):
            if result is not None:
                all_results.append(result)
    all_results.sort(key=lambda r: r["name"].lower())

    q = query.lower()
    matches = [
        r
        for r in all_results
        if q in r["name"].lower() or q in ", ".join(r["product_categories"]).lower()
    ]

    def _slim(r: dict[str, Any]) -> dict[str, Any]:
        return {"name": r["name"], "url": r["url"], "product_categories": r["product_categories"]}

    if len(matches) == 1:
        return discover_fn(matches[0]["url"])

    if len(matches) == 0:
        return json.dumps({
            "_ui": {"type": "merchant-list"},
            "error": f"No merchants found matching '{query}'.",
            "all_merchants": [_slim(r) for r in all_results],
            "merchants": [_slim(r) for r in all_results],
            "suggestion": "Call discover_merchant(url) with a URL above, or try list_merchants().",
        })

    return json.dumps({
        "_ui": {"type": "merchant-list"},
        "error": f"Multiple merchants match '{query}'.",
        "matches": [_slim(r) for r in matches],
        "merchants": [_slim(r) for r in matches],
        "suggestion": "Call discover_merchant(url) with the URL of your preferred merchant.",
    })
