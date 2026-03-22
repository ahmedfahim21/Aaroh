"""Sync retry helpers with exponential backoff.

Aligned with common patterns: configurable max attempts, initial delay, 
multiplicative backoff, and retryability rules for rate limits and
transient server errors. Safe to import from any package code (e.g. ``agent_loop``,
scripts, or services).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from google.genai import errors as gerrors

log = logging.getLogger(__name__)

T = TypeVar("T")

MAX_RETRIES = 6
INITIAL_DELAY_S = 0.5
BACKOFF_MULTIPLIER = 2.0

# When a 429 has no RetryInfo payload, wait at least this long (matches prior agent_loop behavior).
_MIN_DELAY_429_FALLBACK_S = 60.0

# HTTP status codes we treat as transient
_RETRYABLE_STATUS: frozenset[int] = frozenset({408, 429, 500, 502, 503, 504})

_RETRYABLE_MESSAGE_FRAGMENTS: tuple[str, ...] = (
    "network",
    "timeout",
    "rate limit",
    "temporarily unavailable",
    "service unavailable",
    "connection reset",
    "connection refused",
)


def parse_gemini_retry_delay_seconds(exc: BaseException) -> float | None:
    """If ``exc`` is a GenAI error with ``RetryInfo``, return delay in seconds (+ small buffer)."""
    if not isinstance(exc, gerrors.APIError):
        return None
    try:
        details = exc.details.get("error", {}).get("details", [])
        for d in details:
            if d.get("@type", "").endswith("RetryInfo"):
                delay_str = d.get("retryDelay", "60s")
                return float(int(delay_str.rstrip("s"))) + 2.0
    except Exception:
        return None
    return None


def is_retryable_error(exc: BaseException) -> bool:
    """Return True if the failure is plausibly transient (network, rate limit, 5xx, etc.)."""
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True

    if isinstance(exc, gerrors.ServerError):
        return True

    if isinstance(exc, gerrors.ClientError):
        return exc.code in _RETRYABLE_STATUS

    if isinstance(exc, gerrors.APIError):
        return exc.code in _RETRYABLE_STATUS

    try:
        import httpx

        if isinstance(exc, httpx.HTTPError) and getattr(exc, "response", None) is not None:
            code = exc.response.status_code
            return code in _RETRYABLE_STATUS
    except ImportError:
        pass

    msg = str(exc).lower()
    return any(fragment in msg for fragment in _RETRYABLE_MESSAGE_FRAGMENTS)


def _delay_before_retry(
    attempt_index: int,
    exc: BaseException,
    *,
    initial_delay_s: float,
    backoff_multiplier: float,
) -> float:
    """Seconds to wait after attempt ``attempt_index`` failed (0-based)."""
    parsed = parse_gemini_retry_delay_seconds(exc)
    if parsed is not None:
        return parsed
    base = initial_delay_s * (backoff_multiplier**attempt_index)
    if isinstance(exc, gerrors.ClientError) and exc.code == 429:
        return max(base, _MIN_DELAY_429_FALLBACK_S)
    return base


def with_retry(
    operation: Callable[[], T],
    *,
    max_retries: int = MAX_RETRIES,
    initial_delay_s: float = INITIAL_DELAY_S,
    backoff_multiplier: float = BACKOFF_MULTIPLIER,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
) -> T:
    """Run ``operation`` synchronously; retry on retryable errors with exponential backoff.

    Args:
        operation: Zero-argument callable returning the successful result.
        max_retries: Total attempts (including the first).
        initial_delay_s: Base delay in seconds before the first retry (attempt index 0).
        backoff_multiplier: Multiplied each attempt (delay = initial * multiplier**attempt).
        on_retry: Optional ``(attempt_number, error, delay_seconds)`` — ``attempt_number`` is
            1-based for the *next* attempt (e.g. 2 when about to run the second try).

    Returns:
        The value returned by ``operation``.

    Raises:
        The last exception if all attempts fail or the error is not retryable.
    """
    for attempt in range(max_retries):
        try:
            return operation()
        except Exception as exc:
            will_retry = attempt < max_retries - 1 and is_retryable_error(exc)
            if not will_retry:
                raise
            delay_s = _delay_before_retry(
                attempt,
                exc,
                initial_delay_s=initial_delay_s,
                backoff_multiplier=backoff_multiplier,
            )
            next_attempt = attempt + 2
            if on_retry:
                on_retry(next_attempt, exc, delay_s)
            log.warning(
                "Retrying in %.2fs (attempt %d/%d): %s",
                delay_s,
                next_attempt,
                max_retries,
                exc,
            )
            time.sleep(delay_s)


async def with_retry_async(
    operation: Callable[[], Awaitable[T]],
    *,
    max_retries: int = MAX_RETRIES,
    initial_delay_s: float = INITIAL_DELAY_S,
    backoff_multiplier: float = BACKOFF_MULTIPLIER,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
) -> T:
    """Async variant of :func:`with_retry` using ``asyncio.sleep``."""
    for attempt in range(max_retries):
        try:
            return await operation()
        except Exception as exc:
            will_retry = attempt < max_retries - 1 and is_retryable_error(exc)
            if not will_retry:
                raise
            delay_s = _delay_before_retry(
                attempt,
                exc,
                initial_delay_s=initial_delay_s,
                backoff_multiplier=backoff_multiplier,
            )
            next_attempt = attempt + 2
            if on_retry:
                on_retry(next_attempt, exc, delay_s)
            log.warning(
                "Retrying in %.2fs (attempt %d/%d): %s",
                delay_s,
                next_attempt,
                max_retries,
                exc,
            )
            await asyncio.sleep(delay_s)
