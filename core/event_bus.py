from __future__ import annotations

import asyncio
import json
from typing import Any

import anyio
from fastapi import WebSocket


class UIEventBus:
    """
    In-process event bus for websocket-connected UI clients.
    """

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, event: dict[str, Any]) -> None:
        message = json.dumps(event)
        async with self._lock:
            clients = list(self._clients)

        stale_clients: list[WebSocket] = []
        for client in clients:
            try:
                await client.send_text(message)
            except Exception:  # noqa: BLE001
                stale_clients.append(client)

        if stale_clients:
            async with self._lock:
                for client in stale_clients:
                    self._clients.discard(client)

    def publish(self, event: dict[str, Any]) -> None:
        """
        Schedule a broadcast from sync or async service code.
        """
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(event))
            return
        except RuntimeError:
            pass

        try:
            anyio.from_thread.run(self.broadcast, event)
            return
        except RuntimeError:
            asyncio.run(self.broadcast(event))


event_bus = UIEventBus()
