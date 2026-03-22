from fastapi import APIRouter, WebSocket

from core.event_bus import event_bus

router = APIRouter()


@router.websocket("/ws/ui")
async def ws_ui(websocket: WebSocket) -> None:
    await event_bus.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        await event_bus.disconnect(websocket)
