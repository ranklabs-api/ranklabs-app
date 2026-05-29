"""Secure token storage for RankLabs Google OAuth credentials.

Credentials live at ~/.hermes/auth/ranklabs_google_oauth.json with 0o600
permissions.  The file format is:

    {
      "access_token": "ya29....",
      "refresh_token": "1//....",
      "expires_ms": 1744848000000,   // unix MILLIseconds
      "email": "user@example.com",
      "scopes": ["https://...", ...]
    }

All writes are atomic (tmp + rename) and guarded by an fcntl cross-process lock
so concurrent Hermes sessions don't corrupt the file.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import secrets
import stat
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_HERMES_HOME = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))
CREDENTIALS_PATH = _HERMES_HOME / "auth" / "ranklabs_google_oauth.json"
REFRESH_SKEW_SECONDS = 60  # refresh 60 seconds before actual expiry


def _lock_path() -> Path:
    return CREDENTIALS_PATH.with_suffix(".json.lock")


# ---------------------------------------------------------------------------
# Cross-process lock (reentrant within a thread)
# ---------------------------------------------------------------------------

_lock_state = threading.local()


@contextlib.contextmanager
def _credentials_lock(timeout_seconds: float = 30.0):
    depth = getattr(_lock_state, "depth", 0)
    if depth > 0:
        _lock_state.depth = depth + 1
        try:
            yield
        finally:
            _lock_state.depth -= 1
        return

    lock_file_path = _lock_path()
    lock_file_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(lock_file_path), os.O_CREAT | os.O_RDWR, 0o600)
    acquired = False
    try:
        try:
            import fcntl
        except ImportError:
            fcntl = None

        if fcntl is not None:
            deadline = time.monotonic() + max(0.0, float(timeout_seconds))
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    acquired = True
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError(
                            f"Timed out acquiring lock at {lock_file_path}"
                        )
                    time.sleep(0.05)
        else:
            acquired = True

        _lock_state.depth = 1
        yield
    finally:
        try:
            if acquired:
                try:
                    import fcntl
                    fcntl.flock(fd, fcntl.LOCK_UN)
                except (ImportError, OSError):
                    pass
        finally:
            os.close(fd)
            _lock_state.depth = 0


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class OAuthCredentials:
    access_token: str
    refresh_token: str
    expires_ms: int  # unix milliseconds
    email: str = ""
    scopes: list[str] = field(default_factory=list)

    def access_token_expired(self, skew_seconds: int = REFRESH_SKEW_SECONDS) -> bool:
        if not self.access_token or not self.expires_ms:
            return True
        return (time.time() + max(0, skew_seconds)) * 1000 >= self.expires_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_ms": int(self.expires_ms),
            "email": self.email,
            "scopes": self.scopes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OAuthCredentials":
        return cls(
            access_token=str(data.get("access_token", "") or ""),
            refresh_token=str(data.get("refresh_token", "") or ""),
            expires_ms=int(data.get("expires_ms", 0) or 0),
            email=str(data.get("email", "") or ""),
            scopes=list(data.get("scopes", []) or []),
        )


# ---------------------------------------------------------------------------
# Atomic I/O
# ---------------------------------------------------------------------------

def _atomic_replace(src: Path, dst: Path) -> None:
    """Rename src → dst. Works across filesystems."""
    try:
        src.replace(dst)
    except OSError:
        # Fallback for cross-device renames
        import shutil
        shutil.move(str(src), str(dst))


def load_credentials() -> Optional[OAuthCredentials]:
    """Load credentials from disk. Returns None if missing or corrupt."""
    path = CREDENTIALS_PATH
    if not path.exists():
        return None
    try:
        with _credentials_lock():
            raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read credentials at %s: %s", path, exc)
        return None
    if not isinstance(data, dict):
        return None
    creds = OAuthCredentials.from_dict(data)
    if not creds.access_token:
        return None
    return creds


def save_credentials(creds: OAuthCredentials) -> Path:
    """Atomically write credentials with 0o600 permissions."""
    path = CREDENTIALS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    # Tighten parent dir to 0o700
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass

    payload = json.dumps(creds.to_dict(), indent=2, sort_keys=True) + "\n"

    with _credentials_lock():
        tmp_path = path.with_suffix(f".tmp.{os.getpid()}.{secrets.token_hex(4)}")
        try:
            fd = os.open(
                str(tmp_path),
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                stat.S_IRUSR | stat.S_IWUSR,
            )
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            _atomic_replace(tmp_path, path)
        finally:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass
    return path


def clear_credentials() -> None:
    """Remove the creds file. Idempotent."""
    path = CREDENTIALS_PATH
    with _credentials_lock():
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Failed to remove credentials at %s: %s", path, exc)
