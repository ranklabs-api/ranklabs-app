"""Scope definitions for RankLabs Google APIs.

GSC  = Google Search Console
GA4  = Google Analytics 4
GBP  = Google Business Profile
"""

# ── Full-access scopes (read + write where applicable) ──────────────────────

GSC_SCOPE = "https://www.googleapis.com/auth/webmasters"
"""Google Search Console — full read access to search analytics, sitemaps, URL inspection."""

GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
"""Google Search Console — read-only."""

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]
"""Gmail — read, send, modify (labels, archive, etc.)."""

GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
"""Google Analytics 4 — read-only access to reports and metadata."""

GA4_MANAGE_SCOPE = "https://www.googleapis.com/auth/analytics"
"""Google Analytics 4 — read + manage (create/edit properties, views, etc.)."""

GBP_SCOPE = "https://www.googleapis.com/auth/business.manage"
"""Google Business Profile — full management access."""

# ── User info (always included for email resolution) ────────────────────────

USERINFO_SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# ── Composite scope lists ───────────────────────────────────────────────────

DEFAULT_SCOPES = (
    [GSC_SCOPE]
    + GMAIL_SCOPES
    + [GA4_SCOPE]
    + [GBP_SCOPE]
    + USERINFO_SCOPES
)
"""Default RankLabs scopes: GSC, Gmail, GA4, GBP, userinfo."""

READONLY_SCOPES = (
    [GSC_READONLY_SCOPE]
    + ["https://www.googleapis.com/auth/gmail.readonly"]
    + [GA4_SCOPE]
    + [GBP_SCOPE]
    + USERINFO_SCOPES
)
"""Read-only variant — GSC readonly, Gmail readonly, GA4 readonly."""

# ── Scope map — human-readable names ────────────────────────────────────────

SCOPE_NAMES: dict[str, str] = {
    GSC_SCOPE: "Google Search Console",
    GSC_READONLY_SCOPE: "Google Search Console (read-only)",
    "https://www.googleapis.com/auth/gmail.readonly": "Gmail (read)",
    "https://www.googleapis.com/auth/gmail.send": "Gmail (send)",
    "https://www.googleapis.com/auth/gmail.modify": "Gmail (modify)",
    GA4_SCOPE: "Google Analytics 4 (read)",
    GA4_MANAGE_SCOPE: "Google Analytics 4 (manage)",
    GBP_SCOPE: "Google Business Profile",
    "https://www.googleapis.com/auth/userinfo.email": "User email",
    "https://www.googleapis.com/auth/userinfo.profile": "User profile",
}
