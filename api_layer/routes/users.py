from __future__ import annotations

from fastapi import APIRouter

from api_layer.services import users_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users() -> dict:
    return users_service.list_users()


@router.get("/{name}")
def get_user(name: str) -> dict:
    return users_service.get_user(name)


@router.post("/{name}/refresh")
def refresh_user(name: str) -> dict:
    return users_service.refresh_user(name)


@router.get("/{name}/prefs")
def get_user_prefs(name: str) -> dict:
    return users_service.get_user_prefs(name)


@router.put("/{name}/prefs")
def set_user_prefs(name: str, prefs: dict) -> dict:
    return users_service.set_user_prefs(name, prefs)
