import platform
import time

import psutil

# Live system telemetry — serves /api/system/metrics.
# Fields match the normalizeMetrics() mapping in static/js/system_metrics.js.

_prev_net = {"recv": 0, "sent": 0, "ts": 0.0}


def get_metrics() -> dict:
    """Return the live system metrics payload expected by the frontend."""
    cpu_percent = psutil.cpu_percent(interval=None)
    load_1, load_5, load_15 = psutil.getloadavg()

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    net = psutil.net_io_counters()
    now = time.monotonic()
    elapsed = (now - _prev_net["ts"]) if _prev_net["ts"] else 1.0
    dl_speed = max(0.0, (net.bytes_recv - _prev_net["recv"]) / elapsed)
    ul_speed = max(0.0, (net.bytes_sent - _prev_net["sent"]) / elapsed)
    _prev_net.update({"recv": net.bytes_recv, "sent": net.bytes_sent, "ts": now})

    uptime = time.time() - psutil.boot_time()
    uname = platform.uname()

    return {
        "cpu": {
            "percent": round(cpu_percent, 1),
            "load": {
                "1m": round(load_1, 2),
                "5m": round(load_5, 2),
                "15m": round(load_15, 2),
            },
        },
        "memory": {
            "total": mem.total,
            "used": mem.used,
            "percent": round(mem.percent, 1),
        },
        "disk": {
            "total": disk.total,
            "used": disk.used,
            "percent": round(disk.percent, 1),
        },
        "network": {
            "total_recv": net.bytes_recv,
            "total_sent": net.bytes_sent,
            "download_speed": round(dl_speed, 1),
            "upload_speed": round(ul_speed, 1),
        },
        "processes": len(psutil.pids()),
        "system": {
            "uptime": round(uptime),
            "platform": uname.system,
            "arch": uname.machine,
        },
    }
