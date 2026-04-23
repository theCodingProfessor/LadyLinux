"""HTTP route for xdg-open — open URLs and files via desktop default handler."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from api_layer.services import open_service

router = APIRouter(prefix="/api/open", tags=["open"])


class OpenRequest(BaseModel):
    target: str  # http/https URL or whitelisted local path


@router.post("")
def open_target(req: OpenRequest) -> dict:
    return open_service.xdg_open(req.target)
