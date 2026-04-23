"""
xdg-open wrapper service for LadyLinux.

Opens URLs and local files using the desktop's default handler.
Runs via Popen (fire-and-forget) as the desktop user.

Security: all targets are validated against an allowlist of safe URL
schemes and local path prefixes before xdg-open is called. Raw user
input must NEVER be passed through without validation.

Exposed tools: xdg_open
"""

from __future__ import annotations

import re

from api_layer.services._desktop_runner import run_as_desktop_user

# Only http/https URLs are accepted — no file:// or other schemes that
# could expose arbitrary filesystem paths via the browser
_SAFE_URL_RE = re.compile(r"^https?://", re.IGNORECASE)

# Local paths are restricted to known LadyLinux and user directories.
# Extend this list deliberately — do not make it a wildcard.
_SAFE_LOCAL_PREFIXES = (
    "/opt/ladylinux",   # app files
    "/var/lib/ladylinux",  # runtime data
    "/home/",           # user home dirs (xdg-open will respect MIME type)
    "/tmp/ladylinux",   # temp outputs written by the app
)


def _validate_target(target: str) -> str:
    """
    Return the target unchanged if it passes validation.
    Raises ValueError for anything outside the safe set.
    """
    t = (target or "").strip()

    if not t:
        raise ValueError("xdg-open target cannot be empty")

    if _SAFE_URL_RE.match(t):
        return t  # valid http/https URL

    if any(t.startswith(prefix) for prefix in _SAFE_LOCAL_PREFIXES):
        return t  # valid local path

    raise ValueError(f"xdg-open target not permitted: {t!r}")


def xdg_open(target: str) -> dict:
    """
    Open a URL or local file using the desktop default handler.

    Args:
        target: An http/https URL or whitelisted local path.

    Returns:
        ok=True on successful Popen launch (does not confirm the browser opened).
        ok=False with a message on validation failure.
    """
    try:
        safe_target = _validate_target(target)
    except ValueError as exc:
        return {"ok": False, "message": str(exc)}

    # popen=True — xdg-open is fire-and-forget, we don't wait for it to return
    result = run_as_desktop_user(["xdg-open", safe_target], popen=True)
    return {
        "ok": result["ok"],
        "target": safe_target,
        "message": f"Opened {safe_target}" if result["ok"] else result["stderr"],
    }
