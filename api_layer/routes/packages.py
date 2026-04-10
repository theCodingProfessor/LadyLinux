from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api_layer.models.packages import PackageInstallRequest
from api_layer.services import package_service

router = APIRouter(prefix="/api/packages", tags=["packages"])


@router.get("/search")
def search_packages(q: str = Query(..., min_length=1, max_length=128)) -> dict:
    try:
        return package_service.search_packages(q)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/installed")
def installed_packages(q: str = Query(..., min_length=1, max_length=128)) -> dict:
    try:
        return package_service.installed_packages(q)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/install")
def install_package(payload: PackageInstallRequest) -> dict:
    raise HTTPException(
        status_code=501,
        detail={
            "error": "not_implemented",
            "message": "Package installation is not available through the API. "
                       "The service account does not have the required privileges. "
                       "Install packages manually with: sudo apt-get install <package>",
        },
    )
