from __future__ import annotations

from typing import Any

EMPTY_SCHEMA: dict[str, type[Any]] = {}
NAME_SCHEMA: dict[str, type[Any]] = {"name": str}
THEME_SCHEMA: dict[str, type[Any]] = {"theme": str}


def schema_to_manifest(schema: dict[str, Any]) -> dict[str, str]:
    """Convert Python/schema objects into planner-safe string names."""
    manifest: dict[str, str] = {}
    for key, value in (schema or {}).items():
        if isinstance(value, type):
            manifest[key] = value.__name__
        else:
            manifest[key] = str(value)
    return manifest
