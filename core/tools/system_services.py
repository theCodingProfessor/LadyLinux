"""
System Services API
Provides controlled access to systemd services for Lady Linux.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api_layer.command_security import run_whitelisted

router = APIRouter(prefix="/api/system", tags=["system"])


def run_command(cmd: list[str]) -> dict[str, str | bool]:
    """
    Run a validated system command and return captured process output.

    This wrapper centralizes safe execution by:
    - validating commands against the project allowlist
    - disabling shell execution to prevent injection
    - normalizing stdout/stderr for JSON responses
    """
    try:
        result = run_whitelisted(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except Exception as exc:
        # Convert execution failures into API-friendly error responses.
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/services")
def list_services() -> dict[str, list[dict[str, str]]]:
    """
    Return a simplified list of system services and their runtime status.

    Output is derived from `systemctl list-units` and shaped for the
    Services table in the web UI.
    """
    result = run_command(
        [
            "systemctl",
            "list-units",
            "--type=service",
            "--no-pager",
            "--no-legend",
        ]
    )

    services: list[dict[str, str]] = []
    for line in str(result["stdout"]).splitlines():
        parts = line.split()
        # systemctl line layout is typically:
        # UNIT LOAD ACTIVE SUB DESCRIPTION
        if len(parts) >= 4:
            services.append(
                {
                    "name": parts[0].replace(".service", ""),
                    "status": parts[3],
                }
            )

    return {"services": services}


@router.get("/service/{name}")
def get_service(name: str) -> dict[str, str | bool]:
    """
    Return detailed `systemctl status` output for one service.
    """
    return run_command(["systemctl", "status", f"{name}.service", "--no-pager"])


@router.post("/service/{name}/restart")
def restart_service(name: str) -> dict[str, str | bool]:
    """
    Restart a service via systemctl and return a success flag.
    """
    result = run_command(["systemctl", "restart", f"{name}.service"])
    return {"service": name, "restarted": bool(result["ok"])}


@router.post("/service/{name}/start")
def start_service(name: str) -> dict[str, str | bool]:
    """Start a service via systemctl."""
    result = run_command(["systemctl", "start", f"{name}.service"])
    return {"service": name, "started": bool(result["ok"])}


@router.post("/service/{name}/stop")
def stop_service(name: str) -> dict[str, str | bool]:
    """Stop a service via systemctl."""
    result = run_command(["systemctl", "stop", f"{name}.service"])
    return {"service": name, "stopped": bool(result["ok"])}


@router.post("/service/{name}/enable")
def enable_service(name: str) -> dict[str, str | bool]:
    """Enable a service to start at boot."""
    result = run_command(["systemctl", "enable", f"{name}.service"])
    return {"service": name, "enabled": bool(result["ok"])}


@router.post("/service/{name}/disable")
def disable_service(name: str) -> dict[str, str | bool]:
    """Disable a service from starting at boot."""
    result = run_command(["systemctl", "disable", f"{name}.service"])
    return {"service": name, "disabled": bool(result["ok"])}
