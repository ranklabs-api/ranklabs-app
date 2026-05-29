"""OAuth2 PKCE web-server flow for RankLabs Google APIs.

Implements Authorization Code + PKCE (S256) against Google's OAuth2 endpoints.
Uses a local callback server on 127.0.0.1 with automatic port selection and a
manual paste fallback for headless environments.

Usage:
    from ranklabs_google_oauth.auth import login

    creds = login()                         # interactive browser login
    creds = login(open_browser=False)       # print URL, wait for paste
    creds = login(scopes=["...", "..."])    # custom scopes

    from ranklabs_google_oauth.token_store import load_credentials
    existing = load_credentials()           # check if already logged in
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import logging
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional, Tuple

from .scopes import DEFAULT_SCOPES, SCOPE_NAMES
from .token_store import (
    OAuthCredentials,
    clear_credentials,
    load_credentials,
    save_credentials,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Error type
# =============================================================================


class RankLabsOAuthError(RuntimeError):
    """Raised for any failure in the RankLabs Google OAuth flow."""

    def __init__(self, message: str, *, code: str = "ranklabs_oauth_error") -> None:
        super().__init__(message)
        self.code = code


# =============================================================================
# Endpoints
# =============================================================================

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
TOKEN_INFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo"
TOKEN_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"

DEFAULT_REDIRECT_PORT = 8085
REDIRECT_HOST = "127.0.0.1"
CALLBACK_PATH = "/oauth2callback"

CALLBACK_WAIT_SECONDS = 300
TOKEN_REQUEST_TIMEOUT = 20.0

_HEADLESS_ENV_VARS = ("SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY", "HERMES_HEADLESS")


# =============================================================================
# Client config resolution
# =============================================================================


def _resolve_client_config() -> Tuple[str, str]:
    """Resolve OAuth client_id and client_secret.

    Priority:
      1. SEARCHOPS_GOOGLE_CLIENT_ID / SEARCHOPS_GOOGLE_CLIENT_SECRET env vars
      2. CLIENT_SECRET_PATH (downloaded from Google Cloud Console)
      3. Error with setup instructions
    """
    client_id = os.getenv("SEARCHOPS_GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("SEARCHOPS_GOOGLE_CLIENT_SECRET", "").strip()

    if client_id and client_secret:
        return client_id, client_secret

    # Try loading from client_secret.json
    for candidate in [
        Path(os.getenv("HERMES_HOME", Path.home() / ".hermes")) / "google_client_secret.json",
        Path(os.getenv("HERMES_HOME", Path.home() / ".hermes")) / "ranklabs_client_secret.json",
        Path.home() / ".hermes" / "google_client_secret.json",
    ]:
        if candidate.exists():
            try:
                data = json.loads(candidate.read_text())
                # Handle both "installed" and "web" application types
                app = data.get("installed") or data.get("web") or {}
                cid = app.get("client_id", "")
                cs = app.get("client_secret", "")
                if cid and cs:
                    logger.info("Loaded OAuth client config from %s", candidate)
                    return cid, cs
            except (json.JSONDecodeError, OSError) as exc:
                logger.debug("Failed to read %s: %s", candidate, exc)

    raise RankLabsOAuthError(
        "Google OAuth client credentials not found.\n\n"
        "Set up a Google Cloud project and download OAuth 2.0 credentials:\n"
        "\n"
        "  1. Go to https://console.cloud.google.com/apis/credentials\n"
        "  2. Create a project (or select existing)\n"
        "  3. Enable APIs: Search Console, Gmail, Analytics, Business Profile\n"
        "  4. Create OAuth 2.0 Client ID → Desktop app\n"
        "  5. Download JSON → save as ~/.hermes/google_client_secret.json\n"
        "\n"
        "Or set env vars: SEARCHOPS_GOOGLE_CLIENT_ID and SEARCHOPS_GOOGLE_CLIENT_SECRET\n",
        code="ranklabs_oauth_client_config_missing",
    )


# =============================================================================
# PKCE
# =============================================================================


def _generate_pkce_pair() -> Tuple[str, str]:
    """Generate (verifier, challenge) using S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# =============================================================================
# HTTP helpers
# =============================================================================


def _post_form(url: str, data: dict[str, str], timeout: float) -> dict[str, Any]:
    """POST x-www-form-urlencoded and return parsed JSON."""
    body = urllib.parse.urlencode(data).encode("ascii")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        code = "ranklabs_oauth_token_http_error"
        if "invalid_grant" in detail.lower():
            code = "ranklabs_oauth_invalid_grant"
        raise RankLabsOAuthError(
            f"Token endpoint returned HTTP {exc.code}: {detail or exc.reason}",
            code=code,
        ) from exc
    except urllib.error.URLError as exc:
        raise RankLabsOAuthError(
            f"Token request failed: {exc}",
            code="ranklabs_oauth_token_network_error",
        ) from exc


def exchange_code(
    code: str,
    verifier: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
    timeout: float = TOKEN_REQUEST_TIMEOUT,
) -> dict[str, Any]:
    """Exchange authorization code for access + refresh tokens."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": verifier,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    }
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def refresh_access_token(
    refresh_token: str,
    client_id: str,
    client_secret: str,
    timeout: float = TOKEN_REQUEST_TIMEOUT,
) -> dict[str, Any]:
    """Refresh the access token."""
    if not refresh_token:
        raise RankLabsOAuthError(
            "Cannot refresh: refresh_token is empty. Re-run login.",
            code="ranklabs_oauth_refresh_token_missing",
        )
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def revoke_token(token: str, timeout: float = TOKEN_REQUEST_TIMEOUT) -> None:
    """Revoke an access or refresh token."""
    try:
        _post_form(TOKEN_REVOKE_ENDPOINT, {"token": token}, timeout)
    except RankLabsOAuthError as exc:
        logger.warning("Token revocation failed (non-fatal): %s", exc)


def _fetch_user_email(access_token: str, timeout: float = TOKEN_REQUEST_TIMEOUT) -> str:
    """Best-effort userinfo fetch. Returns empty string on failure."""
    try:
        request = urllib.request.Request(
            TOKEN_INFO_ENDPOINT + "?alt=json",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        return str(data.get("email", "") or "")
    except Exception as exc:
        logger.debug("Userinfo fetch failed (non-fatal): %s", exc)
        return ""


# =============================================================================
# Callback server
# =============================================================================


_SUCCESS_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>RankLabs — signed in</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem;
       text-align: center; color: #222; }
h1 { color: #1a7f37; } p { color: #555; }
</style></head>
<body><h1>Signed in to Google.</h1>
<p>You can close this tab and return to your terminal.</p></body></html>
"""

_ERROR_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>RankLabs — sign-in failed</title>
<style>
body {{ font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem;
       text-align: center; color: #222; }}
h1 {{ color: #b42318; }} p {{ color: #555; }}
</style></head>
<body><h1>Sign-in failed</h1><p>{message}</p>
<p>Return to your terminal for the manual paste fallback.</p></body></html>
"""


class _OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    expected_state: str = ""
    captured_code: Optional[str] = None
    captured_error: Optional[str] = None
    ready: Optional[threading.Event] = None

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A002
        logger.debug("OAuth callback: " + fmt, *args)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != CALLBACK_PATH:
            self.send_response(404)
            self.end_headers()
            return

        params = urllib.parse.parse_qs(parsed.query)
        state = (params.get("state") or [""])[0]
        error = (params.get("error") or [""])[0]
        code = (params.get("code") or [""])[0]

        if state != type(self).expected_state:
            type(self).captured_error = "state_mismatch"
            body = _ERROR_PAGE.format(message="State mismatch — aborting for safety.")
            self._respond(400, body)
        elif error:
            safe = str(error).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            type(self).captured_error = error
            self._respond(400, _ERROR_PAGE.format(message=f"Authorization denied: {safe}"))
        elif code:
            type(self).captured_code = code
            self._respond(200, _SUCCESS_PAGE)
        else:
            type(self).captured_error = "no_code"
            self._respond(400, _ERROR_PAGE.format(message="Callback received no authorization code."))

        if type(self).ready is not None:
            type(self).ready.set()

    def _respond(self, status: int, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def _bind_callback_server(preferred_port: int = DEFAULT_REDIRECT_PORT) -> Tuple[http.server.HTTPServer, int]:
    try:
        server = http.server.HTTPServer((REDIRECT_HOST, preferred_port), _OAuthCallbackHandler)
        return server, preferred_port
    except OSError:
        logger.info("Port %d unavailable; using ephemeral port", preferred_port)
    server = http.server.HTTPServer((REDIRECT_HOST, 0), _OAuthCallbackHandler)
    return server, server.server_address[1]


def _is_headless() -> bool:
    return any(os.getenv(k) for k in _HEADLESS_ENV_VARS)


# =============================================================================
# Manual paste fallback
# =============================================================================


def _prompt_paste_fallback() -> Optional[str]:
    print()
    print("Paste the full redirect URL Google showed you, OR just the 'code=' value.")
    try:
        raw = input("Callback URL or code: ").strip()
    except (EOFError, KeyboardInterrupt):
        return None
    if not raw:
        return None
    if raw.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(raw)
        params = urllib.parse.parse_qs(parsed.query)
        return (params.get("code") or [""])[0] or None
    if raw.startswith("?"):
        params = urllib.parse.parse_qs(raw[1:])
        return (params.get("code") or [""])[0] or None
    return raw


# =============================================================================
# Main login flow
# =============================================================================


def login(
    *,
    scopes: Optional[list[str]] = None,
    force_relogin: bool = False,
    open_browser: bool = True,
    callback_wait_seconds: float = CALLBACK_WAIT_SECONDS,
) -> OAuthCredentials:
    """Run the interactive browser OAuth flow and persist credentials.

    Args:
        scopes: OAuth scopes to request. Defaults to DEFAULT_SCOPES
                (GSC, Gmail, GA4, GBP, userinfo).
        force_relogin: If False and valid creds exist, return them without
                       re-authenticating.
        open_browser: If False, print the URL instead of opening the browser.
                      Useful for remote/SSH sessions.
        callback_wait_seconds: Max seconds to wait for browser callback.

    Returns:
        OAuthCredentials with access_token, refresh_token, expiry, email.

    Raises:
        RankLabsOAuthError: On any auth failure.
    """
    resolved_scopes = scopes or DEFAULT_SCOPES

    if not force_relogin:
        existing = load_credentials()
        if existing and existing.access_token:
            logger.info("Credentials already present; skipping login.")
            return existing

    client_id, client_secret = _resolve_client_config()

    verifier, challenge = _generate_pkce_pair()
    state = secrets.token_urlsafe(16)

    # Headless → skip callback server, go straight to paste mode
    if _is_headless() and open_browser:
        logger.info("Headless environment; using paste-mode fallback.")
        return _paste_mode_login(verifier, challenge, state, client_id, client_secret, resolved_scopes)

    server, port = _bind_callback_server(DEFAULT_REDIRECT_PORT)
    redirect_uri = f"http://{REDIRECT_HOST}:{port}{CALLBACK_PATH}"

    _OAuthCallbackHandler.expected_state = state
    _OAuthCallbackHandler.captured_code = None
    _OAuthCallbackHandler.captured_error = None
    ready = threading.Event()
    _OAuthCallbackHandler.ready = ready

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(resolved_scopes),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print()
    print("═══ RankLabs Google OAuth ═══")
    print()
    print("Scopes requested:")
    for s in resolved_scopes:
        name = SCOPE_NAMES.get(s, s.rsplit("/", 1)[-1])
        print(f"  • {name}")
    print()
    print("Opening your browser to sign in to Google…")
    print(f"If it doesn't open automatically, visit:\n  {auth_url}")
    print()

    if open_browser:
        try:
            import webbrowser
            webbrowser.open(auth_url, new=1, autoraise=True)
        except Exception as exc:
            logger.debug("webbrowser.open failed: %s", exc)

    code: Optional[str] = None
    try:
        if ready.wait(timeout=callback_wait_seconds):
            code = _OAuthCallbackHandler.captured_code
            error = _OAuthCallbackHandler.captured_error
            if error:
                raise RankLabsOAuthError(
                    f"Authorization failed: {error}",
                    code="ranklabs_oauth_authorization_failed",
                )
        else:
            logger.info("Callback timed out — offering paste fallback.")
            code = _prompt_paste_fallback()
    finally:
        try:
            server.shutdown()
        except Exception:
            pass
        try:
            server.server_close()
        except Exception:
            pass
        server_thread.join(timeout=2.0)

    if not code:
        raise RankLabsOAuthError(
            "No authorization code received. Aborting.",
            code="ranklabs_oauth_no_code",
        )

    token_resp = exchange_code(code, verifier, redirect_uri, client_id, client_secret)
    return _persist_token_response(token_resp, resolved_scopes, client_id, client_secret)


def _paste_mode_login(
    verifier: str,
    challenge: str,
    state: str,
    client_id: str,
    client_secret: str,
    scopes: list[str],
) -> OAuthCredentials:
    """OAuth flow without a local callback server (for headless/remote)."""
    redirect_uri = f"http://{REDIRECT_HOST}:{DEFAULT_REDIRECT_PORT}{CALLBACK_PATH}"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)

    print()
    print("Open this URL in a browser on any device:")
    print(f"  {auth_url}")
    print()
    print("After signing in, Google will redirect to localhost (which won't load).")
    print("Copy the full URL from your browser and paste it below.")
    print()

    code = _prompt_paste_fallback()
    if not code:
        raise RankLabsOAuthError(
            "No authorization code provided.",
            code="ranklabs_oauth_no_code",
        )

    token_resp = exchange_code(code, verifier, redirect_uri, client_id, client_secret)
    return _persist_token_response(token_resp, scopes, client_id, client_secret)


def _persist_token_response(
    token_resp: dict[str, Any],
    scopes: list[str],
    client_id: str,
    client_secret: str,
) -> OAuthCredentials:
    access_token = str(token_resp.get("access_token", "") or "").strip()
    refresh_token = str(token_resp.get("refresh_token", "") or "").strip()
    expires_in = int(token_resp.get("expires_in", 0) or 0)

    if not access_token:
        raise RankLabsOAuthError(
            "Token response missing access_token.",
            code="ranklabs_oauth_incomplete_token_response",
        )
    if not refresh_token:
        # May not get a refresh_token if user previously authorized.
        # This is fine for some use cases but warn.
        logger.warning(
            "No refresh_token in response. Token cannot be auto-refreshed. "
            "Re-authorize with prompt=consent to get one."
        )

    creds = OAuthCredentials(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_ms=int((time.time() + max(60, expires_in)) * 1000),
        email=_fetch_user_email(access_token),
        scopes=scopes,
    )
    save_credentials(creds)
    _store_client_config(client_id, client_secret)
    logger.info("Credentials saved to %s", save_credentials.__code__)  # just log level

    print()
    print("✓ Authenticated successfully!")
    if creds.email:
        print(f"  Account: {creds.email}")
    print(f"  Scopes:  {len(scopes)} APIs authorized")
    print()
    return creds


def _store_client_config(client_id: str, client_secret: str) -> None:
    """Cache the resolved client config alongside the token (optional, for diagnostics)."""
    # We don't persist the secret in a separate file — it's already in
    # the client_secret.json. Just note the client_id in the log.
    logger.info("OAuth flow completed with client_id=%s...", client_id[:20])


def logout() -> None:
    """Revoke tokens and clear stored credentials."""
    creds = load_credentials()
    if creds:
        client_id, client_secret = _resolve_client_config()
        if creds.access_token:
            try:
                revoke_token(creds.access_token)
                logger.info("Access token revoked.")
            except Exception as exc:
                logger.debug("Access token revocation failed: %s", exc)
        if creds.refresh_token:
            try:
                revoke_token(creds.refresh_token)
                logger.info("Refresh token revoked.")
            except Exception as exc:
                logger.debug("Refresh token revocation failed: %s", exc)
    clear_credentials()
    print("Logged out. Credentials cleared.")
