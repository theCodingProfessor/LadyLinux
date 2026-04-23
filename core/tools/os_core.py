from __future__ import annotations

import os
import platform
import shutil
from datetime import datetime, timezone
from typing import Any, Callable

from api_layer.command_security import run_whitelisted

Response = dict[str, Any]
Handler = Callable[[dict[str, Any], bool], tuple[list[str], Any, str | None, dict[str, Any] | None]]

_ALLOWED_ACTIONS = {"status", "start", "stop", "restart", "enable", "disable"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run(cmd: list[str]) -> dict[str, Any]:
    try:
        completed = run_whitelisted(
            cmd,
            capture_output=True,
            text=True,
            timeout=6,
            check=False,
        )
        return {
            "cmd": cmd,
            "returncode": completed.returncode,
            "stdout": (completed.stdout or "").strip(),
            "stderr": (completed.stderr or "").strip(),
            "ok": completed.returncode == 0,
        }
    except Exception as exc:
        return {
            "cmd": cmd,
            "returncode": None,
            "stdout": "",
            "stderr": repr(exc),
            "ok": False,
        }


def _response(
    intent: str,
    ok: bool,
    plan: list[str],
    result: Any = None,
    error: str | None = None,
    raw: dict[str, Any] | None = None,
) -> Response:
    return {
        "ok": ok,
        "intent": intent,
        "ts": _now_iso(),
        "plan": plan,
        "result": result,
        "error": error,
        "raw": raw,
    }


def _handle_system_snapshot(args: dict[str, Any], dry_run: bool) -> tuple[list[str], Any, str | None, dict[str, Any] | None]:
    del args, dry_run
    plan = [
        "Collect platform metadata via the platform module.",
        "Read disk usage for '/'.",
        "Read USER/HOME environment values.",
    ]
    disk_root = shutil.disk_usage("/")
    result = {
        "platform": {
            "system": platform.system(),
            "node": platform.node(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python_version": platform.python_version(),
        },
        "disk": {
            "mount": "/",
            "total_bytes": disk_root.total,
            "used_bytes": disk_root.used,
            "free_bytes": disk_root.free,
        },
        "env": {
            "user": os.getenv("USER"),
            "home": os.getenv("HOME"),
        },
    }
    return plan, result, None, None


def _handle_firewall_status(args: dict[str, Any], dry_run: bool) -> tuple[list[str], Any, str | None, dict[str, Any] | None]:
    del args
    ufw_path = shutil.which("ufw")
    plan = ["Check whether 'ufw' is installed."]
    if not ufw_path:
        return plan, {"supported": False, "provider": None, "active": None}, None, None

    cmd = [ufw_path, "status", "verbose"]
    plan.append(f"Run: {' '.join(cmd)}")

    if dry_run:
        return plan, {"supported": True, "provider": "ufw", "active": None}, None, {"would_run": cmd}

    raw = _run(cmd)
    active = None
    for line in raw["stdout"].splitlines():
        if line.lower().startswith("status:"):
            active = line.split(":", 1)[1].strip().lower()
            break

    result = {
        "supported": True,
        "provider": "ufw",
        "active": active,
    }
    return plan, result, None, raw


def _handle_users_list(args: dict[str, Any], dry_run: bool) -> tuple[list[str], Any, str | None, dict[str, Any] | None]:
    del args, dry_run
    plan = ["Read /etc/passwd and extract usernames."]
    users: list[str] = []

    try:
        with open("/etc/passwd", "r", encoding="utf-8") as handle:
            for line in handle:
                entry = line.strip()
                if not entry or entry.startswith("#"):
                    continue
                users.append(entry.split(":", 1)[0])
    except Exception as exc:
        return plan, None, f"failed to read /etc/passwd: {exc}", None

    return plan, users, None, None


def _handle_service_action(args: dict[str, Any], dry_run: bool) -> tuple[list[str], Any, str | None, dict[str, Any] | None]:
    name = str(args.get("name", "")).strip()
    action = str(args.get("action", "")).strip()
    plan = ["Validate service name and action."]

    if not name:
        return plan, None, "missing args.name", None
    if action not in _ALLOWED_ACTIONS:
        allowed = ", ".join(sorted(_ALLOWED_ACTIONS))
        return plan, None, f"action not allowed: {action}. Allowed: {allowed}", None

    systemctl = shutil.which("systemctl")
    plan.append("Check whether 'systemctl' is installed.")
    if not systemctl:
        return plan, None, "systemctl not found", None

    cmd = [systemctl, action, name]
    plan.append(f"Run: {' '.join(cmd)}")

    if dry_run:
        return plan, {"name": name, "action": action, "dry_run": True}, None, {"would_run": cmd}

    raw = _run(cmd)
    result = {
        "name": name,
        "action": action,
        "returncode": raw["returncode"],
        "stdout": raw["stdout"],
        "stderr": raw["stderr"],
    }

    error = None if raw["ok"] else (raw["stderr"] or raw["stdout"] or "command failed")
    return plan, result, error, raw


INTENT_REGISTRY: dict[str, Handler] = {
    "system.snapshot": _handle_system_snapshot,
    "firewall.status": _handle_firewall_status,
    "users.list": _handle_users_list,
    "service.action": _handle_service_action,
}


def handle_intent(payload: dict[str, Any]) -> Response:
    if not isinstance(payload, dict):
        return _response(
            intent="",
            ok=False,
            plan=["Validate payload structure."],
            error="payload must be a dict",
        )

    intent = payload.get("intent")
    if not intent:
        return _response(
            intent="",
            ok=False,
            plan=["Validate payload structure."],
            error="missing intent",
        )

    args = payload.get("args", {})
    if not isinstance(args, dict):
        return _response(
            intent=str(intent),
            ok=False,
            plan=["Validate args payload."],
            error="args must be a dict",
        )

    handler = INTENT_REGISTRY.get(str(intent))
    if handler is None:
        available = ", ".join(sorted(INTENT_REGISTRY))
        return _response(
            intent=str(intent),
            ok=False,
            plan=["Resolve intent handler."],
            error=f"unknown intent: {intent}. Available: {available}",
        )

    meta = payload.get("meta", {})
    dry_run = bool(meta.get("dry_run")) if isinstance(meta, dict) else False

    try:
        plan, result, error, raw = handler(args, dry_run)
    except Exception as exc:
        return _response(
            intent=str(intent),
            ok=False,
            plan=["Execute intent handler."],
            error=f"handler failure: {exc}",
        )

    return _response(
        intent=str(intent),
        ok=error is None,
        plan=plan,
        result=result,
        error=error,
        raw=raw,
    )


if __name__ == "__main__":
    sample_read = handle_intent(
        {
            "intent": "system.snapshot",
            "args": {},
            "meta": {"dry_run": False, "request_id": "demo-1"},
        }
    )
    print(sample_read)

    sample_action = handle_intent(
        {
            "intent": "service.action",
            "args": {"name": "ssh", "action": "status"},
            "meta": {"dry_run": True, "request_id": "demo-2"},
        }
    )
    print(sample_action)
