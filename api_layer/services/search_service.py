"""
File search service for LadyLinux.

Provides fast content search (ripgrep) and file name search (fd/fdfind).
Runs as the ladylinux service user — no desktop session injection needed.

Search roots are restricted to a whitelist of safe directories to prevent
the LLM from triggering searches on arbitrary filesystem paths.

Exposed tools: search_content, search_files
"""

from __future__ import annotations

import shutil

from api_layer.utils.command_runner import run_command

# Directories the search tools are permitted to operate on.
# Add new roots deliberately — never accept a raw user-supplied path.
_ALLOWED_SEARCH_ROOTS = (
    "/opt/ladylinux/app",     # application source
    "/var/lib/ladylinux",     # runtime data and logs
    "/var/log",               # system logs
    "/etc/ladylinux",         # app config
    "/home",                  # user home dirs (scoped by rg/fd patterns)
)

# Maximum results returned per query — prevents flooding the chat context
_MAX_RESULTS = 30


def _validate_search_root(path: str) -> str:
    """
    Return path if it falls within an allowed search root.
    Raises ValueError otherwise.
    """
    p = (path or "").strip().rstrip("/")
    if not p:
        # Default to app source when no path specified
        return "/opt/ladylinux/app"
    if any(p.startswith(root) for root in _ALLOWED_SEARCH_ROOTS):
        return p
    raise ValueError(f"Search path not permitted: {p!r}")


def search_content(query: str, path: str = "/opt/ladylinux/app") -> dict:
    """
    Search file contents using ripgrep (rg).

    Args:
        query: Text or regex pattern to search for.
        path:  Directory to search (must be within allowed roots).

    Returns:
        Matching lines as a list of strings, capped at _MAX_RESULTS.
    """
    if not query or not query.strip():
        return {"ok": False, "matches": [], "message": "Query cannot be empty"}

    try:
        safe_path = _validate_search_root(path)
    except ValueError as exc:
        return {"ok": False, "matches": [], "message": str(exc)}

    result = run_command([
        "rg",
        "--no-heading",      # one match per line (easier to parse)
        "--line-number",     # include line numbers for context
        "--max-count", "5",  # max 5 matches per file (avoids huge log floods)
        "--",                # treat query as literal after this (prevents flag injection)
        query,
        safe_path,
    ])

    # rg exits 1 when no matches found — that's ok, not an error
    matches = result.stdout.splitlines() if result.stdout else []

    return {
        "ok": True,
        "matches": matches[:_MAX_RESULTS],
        "count": len(matches),
        "truncated": len(matches) > _MAX_RESULTS,
        "path": safe_path,
        "message": f"{len(matches)} match(es) found" if matches else "No matches found",
    }


def search_files(name: str, path: str = "/opt/ladylinux/app") -> dict:
    """
    Search for files by name pattern using fd (fdfind on Debian/Mint).

    Args:
        name: Filename or glob pattern (e.g. "*.log", "config.py").
        path: Directory to search (must be within allowed roots).

    Returns:
        Matching file paths as a list of strings.
    """
    if not name or not name.strip():
        return {"ok": False, "files": [], "message": "Name pattern cannot be empty"}

    try:
        safe_path = _validate_search_root(path)
    except ValueError as exc:
        return {"ok": False, "files": [], "message": str(exc)}

    # Resolve the binary — Debian/Mint installs fd as fdfind.
    # Fall back to fd if a symlink has been created manually.
    fd_bin = shutil.which("fdfind") or shutil.which("fd")
    if not fd_bin:
        return {"ok": False, "files": [], "message": "fd/fdfind not installed"}

    # Use the basename for the allowlist check inside run_command
    fd_cmd_name = "fdfind" if "fdfind" in fd_bin else "fd"

    result = run_command([
        fd_cmd_name,
        "--type", "f",       # files only, no directories
        name,
        safe_path,
    ])

    files = result.stdout.splitlines() if result.stdout else []

    return {
        "ok": result.ok,
        "files": files[:_MAX_RESULTS],
        "count": len(files),
        "truncated": len(files) > _MAX_RESULTS,
        "path": safe_path,
        "message": f"{len(files)} file(s) found" if files else "No files found",
    }
