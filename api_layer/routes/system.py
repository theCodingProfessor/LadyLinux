from __future__ import annotations

import re
import shutil
import subprocess

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api_layer.services import system_service
from api_layer.services import users_service
from api_layer.services.system_service import list_processes
from api_layer.utils.command_runner import run_command

# Absolute path to the git refresh script.
# Must match the NOPASSWD entry in /etc/sudoers.d/ladylinux-refresh exactly.
_REFRESH_SCRIPT = "/opt/ladylinux/app/scripts/refresh_git.sh"
_SUDO = shutil.which("sudo") or "/usr/bin/sudo"

# Minimal clean environment passed to the refresh subprocess.
# FastAPI runs with a stripped systemd env — no guarantee that systemctl,
# git, lsof, etc. are on PATH. Passing this explicitly avoids silent failures
# caused by set -Eeuo pipefail in the script exiting on command-not-found.
_REFRESH_ENV = {
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "HOME": "/root",
    "LANG": "en_US.UTF-8",
    "SYSTEMD_PAGER": "",        # prevent systemctl invoking a pager
    "GIT_TERMINAL_PROMPT": "0", # prevent git hanging on auth prompts
}


class HostnameRequest(BaseModel):
    hostname: str


class TimezoneRequest(BaseModel):
    timezone: str


router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
def get_system_status() -> dict:
    status = system_service.get_status()
    return {
        "ok": True,
        "stdout": "",
        "stderr": "",
        "returncode": 0,
        **status,
    }


@router.get("/metrics")
def get_system_metrics() -> dict:
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, **system_service.get_metrics()}


@router.get("/cpu")
def get_cpu() -> dict:
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, **system_service.get_cpu()}


@router.get("/memory")
def get_memory() -> dict:
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, **system_service.get_memory()}


@router.get("/disk")
def get_disk() -> dict:
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, **system_service.get_disk()}


@router.get("/uptime")
def get_uptime() -> dict:
    return {"ok": True, "stdout": "", "stderr": "", "returncode": 0, **system_service.get_uptime()}


@router.get("/processes")
def get_processes() -> dict:
    """
    Return all running processes sorted by CPU% descending.
    No limit — full process list for client-side filter/sort.
    """
    return list_processes()


@router.get("/users")
def get_system_users():
    return users_service.list_users()


@router.get("/user/{name}")
def get_system_user(name: str):
    return users_service.get_user(name)


@router.post("/user/{name}/refresh")
def refresh_system_user(name: str):
    return users_service.refresh_user(name)


@router.get("/hostname")
def get_hostname() -> dict:
    result = run_command(["hostnamectl", "--static"])
    return {"ok": result.ok, "hostname": result.stdout.strip(), "stderr": result.stderr}


@router.post("/hostname")
def set_hostname(body: HostnameRequest) -> dict:
    name = body.hostname.strip()
    if not name or len(name) > 253:
        raise HTTPException(status_code=400, detail="Invalid hostname")
    result = run_command(["sudo", "hostnamectl", "set-hostname", name])
    return {"ok": result.ok, "hostname": name, "stderr": result.stderr}


@router.get("/timezone")
def get_timezone() -> dict:
    result = run_command(["timedatectl", "show", "--property=Timezone", "--value"])
    return {"ok": result.ok, "timezone": result.stdout.strip(), "stderr": result.stderr}


@router.post("/timezone")
def set_timezone(body: TimezoneRequest) -> dict:
    tz = body.timezone.strip()
    if not tz:
        raise HTTPException(status_code=400, detail="Invalid timezone")
    result = run_command(["sudo", "timedatectl", "set-timezone", tz])
    return {"ok": result.ok, "timezone": tz, "stderr": result.stderr}


@router.post("/github/refresh")
def github_refresh(branch: str = "main") -> dict:
    if not re.match(r'^[a-zA-Z0-9_\-/]+$', branch):
        raise HTTPException(status_code=400, detail="Invalid branch name")

    command = [_SUDO, _REFRESH_SCRIPT, branch]

    try:
        subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,
            env=_REFRESH_ENV,
        )
        return {
            "status": "ok",
            "message": f"Refresh started for branch '{branch}'",
        }
    except FileNotFoundError:
        return {"status": "error", "message": "refresh_git.sh not found"}
    except PermissionError:
        return {"status": "error", "message": "Permission denied"}


@router.get("/github/refresh/log")
def get_refresh_log():
    log_path = "/var/lib/ladylinux/logs/refresh_api.log"

    try:
        with open(log_path, "r") as f:
            return {
                "ok": True,
                "log": f.read()
            }
    except FileNotFoundError:
        return {
            "ok": False,
            "log": "",
            "error": "Log file not found"
        }
