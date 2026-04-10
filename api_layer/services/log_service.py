from __future__ import annotations

import pathlib

from api_layer.utils.command_runner import run_command
from api_layer.utils.validators import validate_service_name


def recent_logs(lines: int = 100) -> dict:
    safe_lines = max(1, min(lines, 500))
    result = run_command(["journalctl", "-n", str(safe_lines), "--no-pager"])
    payload = result.model_dump()
    payload["lines"] = result.stdout.splitlines()
    return payload


def error_logs(lines: int = 100) -> dict:
    safe_lines = max(1, min(lines, 500))
    result = run_command(["journalctl", "-p", "err", "-n", str(safe_lines), "--no-pager"])
    payload = result.model_dump()
    payload["lines"] = result.stdout.splitlines()
    return payload


def service_logs(name: str, lines: int = 100) -> dict:
    service_name = validate_service_name(name)
    safe_lines = max(1, min(lines, 500))
    unit = f"{service_name}.service" if not service_name.endswith(".service") else service_name
    result = run_command(["journalctl", "-u", unit, "-n", str(safe_lines), "--no-pager"])
    payload = result.model_dump()
    payload["service"] = service_name
    payload["lines"] = result.stdout.splitlines()
    return payload


def journal_logs(unit: str | None = None, lines: int = 100) -> dict:
    safe_lines = max(1, min(lines, 500))
    cmd = ["journalctl", "-n", str(safe_lines), "--no-pager", "-o", "short-iso"]
    if unit:
        cmd.append(f"--unit={unit}")
    result = run_command(cmd)
    payload = result.model_dump()
    payload["lines"] = result.stdout.splitlines()
    payload["unit"] = unit
    return payload


def list_log_files() -> dict:
    log_dir = pathlib.Path("/var/log")
    files: list[str] = []
    try:
        for entry in sorted(log_dir.iterdir()):
            if not entry.is_file():
                continue
            try:
                if entry.stat().st_size == 0:
                    continue
                with entry.open("rb") as fh:
                    chunk = fh.read(512)
                if b"\x00" in chunk:  # skip binary files
                    continue
                files.append(entry.name)
            except (PermissionError, OSError):
                continue
    except (PermissionError, OSError) as exc:
        return {"ok": False, "stdout": "", "stderr": str(exc), "returncode": 1, "files": []}
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, "files": files}


def read_log_file(path: str, lines: int = 100) -> dict:
    safe_lines = max(1, min(lines, 500))
    try:
        resolved = pathlib.Path(path).resolve()
    except (ValueError, OSError) as exc:
        return {"ok": False, "stdout": "", "stderr": str(exc), "returncode": 1, "lines": [], "path": path}
    if not str(resolved).startswith("/var/log"):
        return {"ok": False, "stdout": "", "stderr": "Path must be within /var/log", "returncode": 1, "lines": [], "path": path}
    result = run_command(["tail", "-n", str(safe_lines), str(resolved)])
    payload = result.model_dump()
    payload["lines"] = result.stdout.splitlines()
    payload["path"] = str(resolved)
    return payload


def ladylinux_logs(lines: int = 200) -> dict:
    safe_lines = max(1, min(lines, 500))
    result = run_command(["tail", "-n", str(safe_lines), "/var/log/ladylinux/actions.log"])
    payload = result.model_dump()
    payload["lines"] = result.stdout.splitlines()
    return payload
