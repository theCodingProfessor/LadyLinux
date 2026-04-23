
from __future__ import annotations

import shutil
import subprocess
import time

from api_layer.services._desktop_runner import run_as_desktop_user
from api_layer.utils.command_runner import run_command
from api_layer.utils.validators import validate_service_name


# ---------------------------
# INTERNAL HELPERS
# ---------------------------

def _parse_monotonic_usec(raw_value: str | None) -> int | None:
    if raw_value in (None, "", "0"):
        return None
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _build_service_uptime_map(units: list[str]) -> dict[str, int | None]:
    if not units:
        return {}

    cmd = [
        "systemctl",
        "show",
        "--no-pager",
        "--property=Id,ActiveEnterTimestampMonotonic,ExecMainStartTimestampMonotonic",
        *units,
    ]

    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=15,
    )

    if completed.returncode != 0:
        return {}

    now_usec = time.monotonic_ns() // 1000
    uptime_map: dict[str, int | None] = {}
    unit_data: dict[str, str] = {}

    def commit():
        unit = unit_data.get("Id")
        if not unit:
            return

        active_enter = _parse_monotonic_usec(unit_data.get("ActiveEnterTimestampMonotonic"))
        exec_start = _parse_monotonic_usec(unit_data.get("ExecMainStartTimestampMonotonic"))
        start_usec = active_enter or exec_start

        if start_usec is None or start_usec > now_usec:
            uptime_map[unit] = None
            return

        uptime_map[unit] = max(0, int((now_usec - start_usec) / 1_000_000))

    for line in (completed.stdout or "").splitlines():
        if not line.strip():
            commit()
            unit_data = {}
            continue

        key, _, value = line.partition("=")
        unit_data[key] = value

    commit()
    return uptime_map


# ---------------------------
# SERVICE CONTROL
# ---------------------------

def list_services() -> dict:
    cmd = [
        "systemctl",
        "list-units",
        "--type=service",
        "--all",
        "--full",
        "--plain",
        "--no-pager",
        "--no-legend",
    ]

    completed = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

    services = []
    for line in (completed.stdout or "").splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue

        unit, load, active, sub = parts[:4]
        description = parts[4] if len(parts) > 4 else ""

        services.append({
            "name": unit.replace(".service", ""),
            "unit": unit,
            "load": load,
            "active": active,
            "sub": sub,
            "status": sub,
            "description": description,
        })

    uptime_map = _build_service_uptime_map([s["unit"] for s in services])

    for s in services:
        s["uptime_seconds"] = uptime_map.get(s["unit"])

    return {
        "ok": completed.returncode == 0,
        "services": services,
    }


def get_service(name: str) -> dict:
    service_name = validate_service_name(name)
    unit = f"{service_name}.service"

    result = run_command(["systemctl", "status", unit, "--no-pager"])
    payload = result.model_dump()
    payload["service"] = service_name
    return payload


def start_service(name: str) -> dict:
    service_name = validate_service_name(name)
    result = run_command(["systemctl", "start", f"{service_name}.service"])
    return {"ok": result.ok}


def stop_service(name: str) -> dict:
    service_name = validate_service_name(name)
    result = run_command(["systemctl", "stop", f"{service_name}.service"])
    return {"ok": result.ok}


def restart_service(name: str) -> dict:
    service_name = validate_service_name(name)
    result = run_command(["systemctl", "restart", f"{service_name}.service"])
    return {"ok": result.ok}


def enable_service(name: str) -> dict:
    service_name = validate_service_name(name)
    result = run_command(["systemctl", "enable", f"{service_name}.service"])
    return {"ok": result.ok}


def disable_service(name: str) -> dict:
    service_name = validate_service_name(name)
    result = run_command(["systemctl", "disable", f"{service_name}.service"])
    return {"ok": result.ok}


def list_failed_services() -> dict:
    result = run_command([
        "systemctl",
        "--failed",
        "--type=service",
        "--no-pager",
        "--no-legend"
    ])

    failed = []
    for line in result.stdout.splitlines():
        parts = line.split(None, 4)
        if len(parts) >= 4:
            failed.append({
                "name": parts[0].replace(".service", ""),
                "unit": parts[0],
                "active": parts[2],
                "sub": parts[3],
            })

    return {"ok": True, "failed": failed}


# ---------------------------
# PROCESS CONTROL
# ---------------------------

def check_process(name: str) -> dict:
    result = run_command(["pgrep", "-a", name])
    return {"running": result.ok}


def kill_process(name: str) -> dict:
    sudo_bin = shutil.which("sudo") or "/usr/bin/sudo"
    result = run_command([sudo_bin, "pkill", "-x", name[:15]])
    return {"ok": result.returncode == 0}


# ---------------------------
# GUI LAUNCH (FINAL FIXED)
# ---------------------------

def launch_app(name: str) -> dict:
    app_name = validate_service_name(name)

    exe = shutil.which(app_name) or shutil.which(app_name.replace("_", "-"))

    if not exe:
        return {"ok": False, "message": f"{app_name} not found"}

    try:
        run_as_desktop_user([exe])
        return {"ok": True, "launched": True}

    except Exception as e:
        return {"ok": False, "message": str(e)}
