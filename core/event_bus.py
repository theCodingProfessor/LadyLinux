from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class UIEventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, event: dict[str, Any]) -> None:
        message = json.dumps(event)
        stale: list[WebSocket] = []
        for client in list(self._clients):
            try:
                await client.send_text(message)
            except Exception:
                stale.append(client)

        for client in stale:
            self._clients.discard(client)

    def publish(self, event: dict[str, Any]) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(event))
        except RuntimeError:
            pass


event_bus = UIEventBus()
