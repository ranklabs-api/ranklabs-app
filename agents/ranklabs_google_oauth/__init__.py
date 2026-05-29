"""RankLabs Google OAuth2 — secure token management for Google APIs.

Provides a complete OAuth2 PKCE web-server flow for authenticating against
Google APIs used by RankLabs:

  - Google Search Console (GSC)   — search analytics, sitemaps, URL inspection
  - Gmail                          — read, send, modify
  - Google Analytics 4 (GA4)      — reports, metadata
  - Google Business Profile (GBP)  — business management

Quick start:
    >>> from ranklabs_google_oauth import login, get_access_token, logout

    >>> login()                      # Interactive browser login
    >>> token = get_access_token()   # Always returns a valid token
    >>> headers = {"Authorization": f"Bearer {token}"}

    >>> from ranklabs_google_oauth import is_authenticated, token_info
    >>> is_authenticated()           # True if credentials exist
    >>> token_info()                 # {email, scopes, expired, ...}

    >>> logout()                     # Revoke tokens and clear storage
"""

from .auth import RankLabsOAuthError, login, logout
from .client import (
    get_access_token,
    get_credentials,
    is_authenticated,
    token_info,
)
from .scopes import DEFAULT_SCOPES, READONLY_SCOPES
from .token_store import OAuthCredentials, clear_credentials, load_credentials

__all__ = [
    # Auth flow
    "login",
    "logout",
    # Access token
    "get_access_token",
    "get_credentials",
    # Status
    "is_authenticated",
    "token_info",
    # Credentials
    "OAuthCredentials",
    "load_credentials",
    "clear_credentials",
    # Scopes
    "DEFAULT_SCOPES",
    "READONLY_SCOPES",
    # Errors
    "RankLabsOAuthError",
]
