"""Client module — returns a valid access token with auto-refresh.

This is the primary API surface for RankLabs services.  Callers get a
bearer token they can use directly with Google REST APIs:

    from ranklabs_google_oauth import get_access_token

    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(
        "https://www.googleapis.com/webmasters/v3/sites",
        headers=headers,
    )

If the token is expired or near expiry, it's refreshed automatically.
Concurrent refresh attempts across threads are deduplicated so only one
HTTP round-trip to Google happens.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from .auth import (
    RankLabsOAuthError,
    _resolve_client_config,
    refresh_access_token,
)
from .token_store import (
    OAuthCredentials,
    clear_credentials,
    load_credentials,
    save_credentials,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-flight refresh deduplication
# ---------------------------------------------------------------------------

_refresh_inflight: dict[str, threading.Event] = {}
_refresh_inflight_lock = threading.Lock()
REFRESH_LOCK_TIMEOUT = 30.0


def get_access_token(*, force_refresh: bool = False) -> str:
    """Return a valid Google OAuth access token, refreshing if needed.

    Loads stored credentials, checks expiry, and refreshes automatically.
    Concurrent callers deduplicate on the same refresh_token so only one
    HTTP round-trip to Google happens.

    Args:
        force_refresh: If True, refresh even if token is not yet expired.

    Returns:
        A valid bearer access_token string.

    Raises:
        RankLabsOAuthError: If credentials are missing (user must run
            ``login()`` first) or the refresh token has been revoked
            (credentials are cleared; user must re-login).
    """
    creds = load_credentials()
    if creds is None:
        raise RankLabsOAuthError(
            "No Google OAuth credentials found. Run login() first:\n"
            "  python -c 'from ranklabs_google_oauth import login; login()'",
            code="ranklabs_oauth_not_logged_in",
        )

    if not force_refresh and not creds.access_token_expired():
        return creds.access_token

    # ── Deduplicate concurrent refreshes by refresh_token ────────────────
    rt = creds.refresh_token
    with _refresh_inflight_lock:
        event = _refresh_inflight.get(rt)
        if event is None:
            event = threading.Event()
            _refresh_inflight[rt] = event
            owner = True
        else:
            owner = False

    if not owner:
        # Another thread is refreshing — wait, then re-read from disk.
        event.wait(timeout=REFRESH_LOCK_TIMEOUT)
        fresh = load_credentials()
        if fresh is not None and not fresh.access_token_expired():
            return fresh.access_token
        # Fall through to do our own refresh

    try:
        return _do_refresh(creds)
    finally:
        if owner:
            with _refresh_inflight_lock:
                _refresh_inflight.pop(rt, None)
            event.set()


def _do_refresh(creds: OAuthCredentials) -> str:
    """Execute the actual token refresh and persist."""
    client_id, client_secret = _resolve_client_config()

    try:
        resp = refresh_access_token(creds.refresh_token, client_id, client_secret)
    except RankLabsOAuthError as exc:
        if exc.code == "ranklabs_oauth_invalid_grant":
            logger.warning(
                "Refresh token invalid (revoked/expired). "
                "Clearing credentials — user must re-login."
            )
            clear_credentials()
        raise

    new_access = str(resp.get("access_token", "") or "").strip()
    if not new_access:
        raise RankLabsOAuthError(
            "Refresh response did not include an access_token.",
            code="ranklabs_oauth_refresh_empty",
        )

    # Google sometimes rotates the refresh_token; preserve existing if omitted.
    new_refresh = str(resp.get("refresh_token", "") or "").strip() or creds.refresh_token
    expires_in = int(resp.get("expires_in", 0) or 0)

    creds.access_token = new_access
    creds.refresh_token = new_refresh
    creds.expires_ms = int((time.time() + max(60, expires_in)) * 1000)
    save_credentials(creds)

    return creds.access_token


def get_credentials() -> OAuthCredentials:
    """Return the full credentials object, refreshing if needed.

    Use this when you need more than just the access token (e.g. email, scopes).
    """
    get_access_token()  # ensures token is fresh
    creds = load_credentials()
    if creds is None:
        raise RankLabsOAuthError(
            "Credentials lost after refresh. Run login() again.",
            code="ranklabs_oauth_credentials_lost",
        )
    return creds


def is_authenticated() -> bool:
    """Return True if credentials exist on disk (may be expired)."""
    return load_credentials() is not None


def token_info() -> Optional[dict]:
    """Return diagnostic info about stored credentials without refreshing."""
    creds = load_credentials()
    if creds is None:
        return None
    now_ms = int(time.time() * 1000)
    return {
        "email": creds.email,
        "scopes": creds.scopes,
        "expired": creds.access_token_expired(),
        "expires_in_seconds": max(0, int((creds.expires_ms - now_ms) / 1000)),
        "has_refresh_token": bool(creds.refresh_token),
    }
