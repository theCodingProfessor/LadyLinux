"""HTTP routes for audio control via pactl."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from api_layer.services import audio_service

router = APIRouter(prefix="/api/audio", tags=["audio"])


class VolumeRequest(BaseModel):
    level: int  # 0–100


@router.post("/mute")
def mute_audio() -> dict:
    return audio_service.audio_mute()


@router.post("/unmute")
def unmute_audio() -> dict:
    return audio_service.audio_unmute()


@router.post("/toggle-mute")
def toggle_mute() -> dict:
    return audio_service.audio_toggle_mute()


@router.post("/volume")
def set_volume(req: VolumeRequest) -> dict:
    return audio_service.audio_volume_set(req.level)


@router.get("/volume")
def get_volume() -> dict:
    return audio_service.audio_volume_get()


@router.get("/sinks")
def list_sinks() -> dict:
    return audio_service.audio_sink_list()
