from __future__ import annotations

"""
Lightweight system info helpers for date/time and uptime.
"""

import subprocess


def _run(cmd: list[str]) -> str:
    """Run a read-only command and return stripped stdout. Never raises."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False, shell=False)
        return r.stdout.strip()
    except Exception:
        return ""


def get_datetime() -> dict:
    """Return local date/time using timedatectl."""
    raw = _run(["timedatectl", "show", "--no-pager"])
    info: dict[str, str] = {}
    for line in raw.splitlines():
        key, _, val = line.partition("=")
        if key:
            info[key] = val

    local_time = _run(["timedatectl", "status"])
    return {
        "ok": True,
        "timezone": info.get("Timezone", "unknown"),
        "ntp_synced": info.get("NTPSynchronized", "unknown"),
        "rtc_time_utc": info.get("RTCTimeUSec", ""),
        "local_time_raw": local_time,
    }


def get_uptime() -> dict:
    """Return system uptime from /proc/uptime."""
    try:
        with open("/proc/uptime") as f:
            seconds = float(f.read().split()[0])
        days, rem = divmod(int(seconds), 86400)
        hours, rem = divmod(rem, 3600)
        minutes = rem // 60
        return {
            "ok": True,
            "uptime_seconds": int(seconds),
            "human": f"{days}d {hours}h {minutes}m",
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
