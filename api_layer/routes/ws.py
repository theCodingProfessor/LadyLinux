from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api_layer.services import theme_service
from core.event_bus import event_bus

router = APIRouter(tags=["ws"])


@router.websocket("/ws/ui")
async def ui_websocket(websocket: WebSocket) -> None:
    """
    Keep a UI websocket subscribed to backend events without polling.
    """
    await event_bus.connect(websocket)

    try:
        await websocket.send_json(theme_service.get_active_theme_event())

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await event_bus.disconnect(websocket)
    except Exception:  # noqa: BLE001
        await event_bus.disconnect(websocket)
