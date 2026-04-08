"""HTTP routes for file content and name search via ripgrep and fd."""

from __future__ import annotations

from fastapi import APIRouter, Query

from api_layer.services import search_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/content")
def search_content(
    query: str = Query(..., min_length=1, max_length=200),
    path: str = Query("/opt/ladylinux/app", max_length=200),
) -> dict:
    return search_service.search_content(query, path)


@router.get("/files")
def search_files(
    query: str = Query(..., min_length=1, max_length=200),
    path: str = Query("/opt/ladylinux/app", max_length=200),
) -> dict:
    return search_service.search_files(query, path)
