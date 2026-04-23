from __future__ import annotations

import json
from pathlib import Path
from typing import Any

USER_PREFS_PATH = Path("config/user_prefs.json")

# ── Existing functions (unchanged) ────────────────────────────────────────────

def list_users() -> dict:
    users: list[str] = []
    try:
        with open("/etc/passwd", "r", encoding="utf-8") as handle:
            for line in handle:
                entry = line.strip()
                if not entry or entry.startswith("#"):
                    continue
                users.append(entry.split(":", 1)[0])
        return {"ok": True, "users": users, "count": len(users)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "users": [], "count": 0, "stderr": str(exc)}


def get_user(name: str) -> dict:
    target = str(name).strip()
    if not target:
        return {"ok": False, "user": None, "stderr": "Invalid user name"}

    try:
        with open("/etc/passwd", "r", encoding="utf-8") as handle:
            for line in handle:
                entry = line.strip()
                if not entry or entry.startswith("#"):
                    continue
                parts = entry.split(":")
                if len(parts) < 7:
                    continue
                if parts[0] == target:
                    return {
                        "ok": True,
                        "user": {
                            "name": parts[0],
                            "uid": parts[2],
                            "gid": parts[3],
                            "comment": parts[4],
                            "home": parts[5],
                            "shell": parts[6],
                        },
                    }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "user": None, "stderr": str(exc)}

    return {"ok": False, "user": None, "stderr": f"User '{target}' not found"}


def refresh_user(name: str) -> dict:
    detail = get_user(name)
    if not detail.get("ok"):
        return {"ok": False, "refreshed": False, "stderr": detail.get("stderr", "User lookup failed")}
    return {"ok": True, "refreshed": True, "user": detail["user"]}


# ── User prefs ────────────────────────────────────────────────────────────────

def _load_prefs() -> dict[str, Any]:
    """Return the full user_prefs.json dict, or {} if missing/corrupt."""
    if not USER_PREFS_PATH.exists():
        return {}
    try:
        return json.loads(USER_PREFS_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _save_prefs(data: dict[str, Any]) -> None:
    USER_PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
    USER_PREFS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


# Allowed pref keys and their types — extend here as needed.
_ALLOWED_PREFS: dict[str, type] = {
    "theme": str,
}


def _validate_prefs(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Return (clean_prefs, list_of_warnings)."""
    clean: dict[str, Any] = {}
    warnings: list[str] = []
    for key, expected_type in _ALLOWED_PREFS.items():
        if key in raw:
            val = raw[key]
            if isinstance(val, expected_type):
                clean[key] = val
            else:
                warnings.append(f"'{key}' must be {expected_type.__name__}, got {type(val).__name__} — ignored")
    for unknown in set(raw) - set(_ALLOWED_PREFS):
        warnings.append(f"Unknown pref '{unknown}' ignored")
    return clean, warnings


def get_user_prefs(name: str) -> dict:
    target = str(name).strip()
    if not target:
        return {"ok": False, "prefs": {}, "stderr": "Invalid user name"}

    all_prefs = _load_prefs()
    prefs = all_prefs.get(target, {})
    return {"ok": True, "user": target, "prefs": prefs}


def set_user_prefs(name: str, incoming: dict[str, Any]) -> dict:
    target = str(name).strip()
    if not target:
        return {"ok": False, "stderr": "Invalid user name"}

    clean, warnings = _validate_prefs(incoming)

    all_prefs = _load_prefs()
    existing = all_prefs.get(target, {})
    existing.update(clean)
    all_prefs[target] = existing

    try:
        _save_prefs(all_prefs)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "stderr": f"Failed to save prefs: {exc}"}

    result: dict[str, Any] = {"ok": True, "user": target, "prefs": existing, "updated": list(clean.keys())}
    if warnings:
        result["warnings"] = warnings
    return result