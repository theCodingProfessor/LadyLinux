"""
System telemetry and host introspection utilities for LadyLinux.

These helpers provide real runtime data for API endpoints and LLM context
injection so the assistant can reason about the current machine state.
"""

from __future__ import annotations

import platform
import shutil
import time
from typing import Any

from api_layer.command_security import run_whitelisted

try:
    # Optional dependency: keep API service alive even when psutil is missing.
    import psutil
except ImportError:
    psutil = None

try:
    # pwd is available on Linux/Unix and used to read /etc/passwd safely.
    import pwd
except ImportError:
    pwd = None

# Process uptime baseline for this API instance.
START_TIME = time.time()


def get_system_status() -> dict[str, Any]:
    """
    Return live system telemetry values for dashboard polling and LLM context.

    Metrics returned:
    - cpu: current CPU utilization percent
    - memory_used: bytes of RAM currently used
    - memory_total: total RAM bytes
    - disk_free: free bytes on root filesystem
    - disk_total: total bytes on root filesystem
    - uptime: API process uptime in seconds
    """
    if psutil is None:
        disk = shutil.disk_usage("/")
        return {
            "cpu": None,
            "memory_used": None,
            "memory_total": None,
            "disk_free": disk.free,
            "disk_total": disk.total,
            "uptime": time.time() - START_TIME,
        }

    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        # CPU percent indicates current processor utilization.
        "cpu": psutil.cpu_percent(interval=0.2),
        # Memory usage in bytes lets frontend format units consistently.
        "memory_used": memory.used,
        "memory_total": memory.total,
        # Disk free/total in bytes for capacity progress calculations.
        "disk_free": disk.free,
        "disk_total": disk.total,
        # Uptime reflects how long this API process has been running.
        "uptime": time.time() - START_TIME,
    }


def get_linux_users() -> list[dict[str, Any]]:
    """
    Read local Linux users from /etc/passwd via the pwd module.

    UID filtering:
    - Include only UID >= 1000 to focus on human/login accounts.
    - Exclude system/service accounts typically below 1000.
    """
    if pwd is None:
        return []

    users: list[dict[str, Any]] = []
    for entry in pwd.getpwall():
        if entry.pw_uid >= 1000:
            users.append(
                {
                    "user": entry.pw_name,
                    "home": entry.pw_dir,
                    "shell": entry.pw_shell,
                    "uid": entry.pw_uid,
                }
            )
    return users


def get_active_sessions() -> list[dict[str, str]]:
    """
    Return active sessions from the `who` command as structured records.
    """
    try:
        result = run_whitelisted(
            ["who"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return []

    sessions: list[dict[str, str]] = []
    for line in (result.stdout or "").splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        sessions.append(
            {
                "user": parts[0],
                "tty": parts[1],
                "date": parts[2],
                "time": parts[3],
                "host": " ".join(parts[4:]).strip("()"),
            }
        )
    return sessions


def get_firewall_status() -> str:
    """
    Return simple firewall state from UFW output.
    """
    try:
        result = run_whitelisted(
            ["ufw", "status"],
            capture_output=True,
            text=True,
            check=False,
        )
        output = result.stdout or ""

        if "Status: active" in output:
            return "active"
        if "Status: inactive" in output:
            return "inactive"
        return "unknown"
    except Exception:
        return "unknown"


def get_cpu_load() -> str:
    status = get_system_status()
    value = status.get("cpu")
    return f"{round(value, 2)}%" if isinstance(value, (int, float)) else "unknown"


def get_memory_usage() -> str:
    status = get_system_status()
    used = status.get("memory_used")
    total = status.get("memory_total")
    if not isinstance(used, (int, float)) or not isinstance(total, (int, float)):
        return "unknown"
    return f"{round(used / (1024 ** 3), 2)}GB / {round(total / (1024 ** 3), 2)}GB"


def get_disk_usage() -> str:
    status = get_system_status()
    free = status.get("disk_free")
    total = status.get("disk_total")
    if not isinstance(free, (int, float)) or not isinstance(total, (int, float)):
        return "unknown"
    used = total - free
    return f"{round(used / (1024 ** 3), 2)}GB / {round(total / (1024 ** 3), 2)}GB"


def get_active_users() -> list[str]:
    if psutil is None:
        return []
    return [u.name for u in psutil.users()]


def get_system_arch() -> str:
    return platform.machine()
