"""HTTP routes for media playback control via playerctl."""

from __future__ import annotations

from fastapi import APIRouter

from api_layer.services import media_service

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/status")
def get_status() -> dict:
    return media_service.media_status()


@router.post("/play")
def play() -> dict:
    return media_service.media_play()


@router.post("/pause")
def pause() -> dict:
    return media_service.media_pause()


@router.post("/toggle")
def toggle() -> dict:
    return media_service.media_toggle()


@router.post("/next")
def next_track() -> dict:
    return media_service.media_next()


@router.post("/previous")
def prev_track() -> dict:
    return media_service.media_prev()


@router.post("/stop")
def stop() -> dict:
    return media_service.media_stop()
