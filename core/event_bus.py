from __future__ import annotations
from typing import Any


class EventBus:
    def publish(self, payload: dict[str, Any]) -> None:
        pass  # Extend later for WebSocket broadcast


event_bus = EventBus()
