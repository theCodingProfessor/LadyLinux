from __future__ import annotations


def list_users() -> dict:
    return {"ok": True, "users": []}


def get_user(name: str) -> dict:
    return {"ok": False, "user": None, "stderr": f"User '{name}' not available on this branch"}


def refresh_user(name: str) -> dict:
    return {"ok": True, "refreshed": False, "user": name}
