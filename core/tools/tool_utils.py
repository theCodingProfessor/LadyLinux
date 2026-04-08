from __future__ import annotations

from typing import Any


def normalize(result: Any) -> dict[str, Any]:
    """
    Preserve existing normalized router responses when present.
    Fallback to a generic wrapper for raw tool outputs.
    """
    if isinstance(result, dict) and {"ok", "message", "data"}.issubset(result.keys()):
        return result

    if isinstance(result, dict) and {"status", "data", "message"}.issubset(result.keys()):
        return result

    return {
        "status": "success",
        "data": result,
        "message": None,
    }
