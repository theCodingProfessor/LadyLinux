# ARCHIVED FILE — extracted for UI portability
# Source: api_layer/routes/system.py
# NOTE: This file may require dependency wiring when re-integrated
from __future__ import annotations

from fastapi import APIRouter

from api_layer.services import system_service
from api_layer.services import users_service

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


@router.get("/users")
def get_system_users():
    return users_service.list_users()


@router.get("/user/{name}")
def get_system_user(name: str):
    return users_service.get_user(name)


@router.post("/user/{name}/refresh")
def refresh_system_user(name: str):
    return users_service.refresh_user(name)
