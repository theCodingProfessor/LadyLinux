from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api_layer.services import log_service

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/recent")
def get_recent_logs(lines: int = Query(default=100, ge=1, le=500)) -> dict:
    return log_service.recent_logs(lines=lines)


@router.get("/errors")
def get_error_logs(lines: int = Query(default=100, ge=1, le=500)) -> dict:
    return log_service.error_logs(lines=lines)


@router.get("/service/{name}")
def get_service_logs(name: str, lines: int = Query(default=100, ge=1, le=500)) -> dict:
    try:
        return log_service.service_logs(name=name, lines=lines)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/journal")
def get_journal_logs(
    unit: Optional[str] = Query(default=None),
    lines: int = Query(default=100, ge=1, le=500),
) -> dict:
    return log_service.journal_logs(unit=unit, lines=lines)


@router.get("/files")
def get_log_files() -> dict:
    return log_service.list_log_files()


@router.get("/file")
def get_log_file(
    path: str = Query(...),
    lines: int = Query(default=100, ge=1, le=500),
) -> dict:
    result = log_service.read_log_file(path=path, lines=lines)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("stderr", "Failed to read file"))
    return result


@router.get("/ladylinux")
def get_ladylinux_logs(lines: int = Query(default=200, ge=1, le=500)) -> dict:
    return log_service.ladylinux_logs(lines=lines)
