from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api_layer.services import service_manager

router = APIRouter(prefix="/api/system", tags=["services"])


@router.get("/services")
def list_services() -> dict:
    return service_manager.list_services()


@router.get("/service/{name}")
def get_service(name: str) -> dict:
    try:
        return service_manager.get_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/services/failed")
def failed_services() -> dict:
    return service_manager.list_failed_services()


@router.post("/service/{name}/restart")
def restart_service(name: str) -> dict:
    try:
        return service_manager.restart_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/{name}/stop")
def stop_service(name: str) -> dict:
    """Stop a running service. Requires sudoers entry for ladylinux user."""
    try:
        return service_manager.stop_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/{name}/start")
def start_service(name: str) -> dict:
    """Start a stopped service."""
    try:
        return service_manager.start_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/{name}/enable")
def enable_service(name: str) -> dict:
    """Enable a service to start on boot."""
    try:
        return service_manager.enable_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/service/{name}/disable")
def disable_service(name: str) -> dict:
    """Disable a service from starting on boot."""
    try:
        return service_manager.disable_service(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/process/{name}")
def check_process(name: str) -> dict:
    """
    Check if a process is running by name (pgrep).
    Handles GUI apps, executables, and non-systemd processes.
    """
    try:
        return service_manager.check_process(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/process/{name}/kill")
def kill_process(name: str) -> dict:
    """
    Kill a process by name (pkill -x).
    Use for GUI apps and non-systemd processes only.
    Does not touch systemd units.
    """
    try:
        return service_manager.kill_process(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/app/{name}/launch")
def launch_app(name: str) -> dict:
    """
    Launch a GUI application or executable by name.
    Distinct from service start — does not use systemctl.
    """
    try:
        return service_manager.launch_app(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
