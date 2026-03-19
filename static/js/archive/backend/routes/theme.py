# ARCHIVED FILE — extracted for UI portability
# Source: api_layer/routes/theme.py
# NOTE: This file may require dependency wiring when re-integrated
from __future__ import annotations

from fastapi import APIRouter

from api_layer.services import theme_service

router = APIRouter(prefix="/api/theme", tags=["theme"])


@router.get("/themes")
def get_themes() -> dict:
    return theme_service.list_themes()


@router.get("/active")
def get_active_theme() -> dict:
    return {"ok": True, "theme": theme_service.get_active_theme()}


@router.get("/theme/{name}")
def get_theme(name: str) -> dict:
    return theme_service.get_theme(name)


@router.post("/theme/{name}/apply")
def apply_theme(name: str) -> dict:
    return theme_service.apply_theme(name)
