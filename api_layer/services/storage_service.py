from __future__ import annotations

import shutil
import time

import psutil

from api_layer.utils.command_runner import run_command

# ---------------------------------------------------------------------------
# In-memory cache for top_usage — scanning / is expensive.
# Cache result for TOP_USAGE_TTL seconds before running du again.
# ---------------------------------------------------------------------------
_TOP_USAGE_CACHE: dict | None = None
_TOP_USAGE_CACHE_AT: float = 0.0
TOP_USAGE_TTL: int = 60  # seconds


def get_disk_partitions() -> dict:
    partitions = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            partitions.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            })
        except PermissionError:
            continue
    return {"ok": True, "partitions": partitions}


def storage_summary() -> dict:
    usage = shutil.disk_usage("/")
    used = usage.total - usage.free
    percent = (used / usage.total * 100.0) if usage.total else 0.0
    return {
        "ok": True,
        "stdout": "",
        "stderr": "",
        "returncode": 0,
        "disk_total": int(usage.total),
        "disk_used": int(used),
        "disk_free": int(usage.free),
        "disk_percent": round(percent, 2),
    }


def storage_mounts() -> dict:
    result = run_command(["df", "-hT"])
    mounts = []
    lines = result.stdout.splitlines()
    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 7:
            mounts.append(
                {
                    "filesystem": parts[0],
                    "type": parts[1],
                    "size": parts[2],
                    "used": parts[3],
                    "avail": parts[4],
                    "use_percent": parts[5],
                    "mountpoint": parts[6],
                }
            )
    payload = result.model_dump()
    payload["mounts"] = mounts
    return payload


def top_usage() -> dict:
    """Return per-directory disk usage for /.

    Result is cached in memory for TOP_USAGE_TTL seconds to avoid
    repeated expensive du scans. A 10-second timeout prevents the API
    worker from blocking on a slow filesystem.
    """
    global _TOP_USAGE_CACHE, _TOP_USAGE_CACHE_AT

    now = time.monotonic()
    if _TOP_USAGE_CACHE is not None and (now - _TOP_USAGE_CACHE_AT) < TOP_USAGE_TTL:
        return _TOP_USAGE_CACHE

    result = run_command(["du", "-x", "-h", "-d", "1", "/"], timeout=10)
    payload = result.model_dump()
    payload["entries"] = result.stdout.splitlines()
    payload["cached"] = False
    payload["cache_ttl"] = TOP_USAGE_TTL

    _TOP_USAGE_CACHE = {**payload, "cached": False}
    _TOP_USAGE_CACHE_AT = now

    # Return a copy marked as fresh on first fetch, cached on subsequent hits
    return payload
