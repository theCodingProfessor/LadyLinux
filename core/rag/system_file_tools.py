"""
Runtime system file tools.

These helpers are intentionally separate from RAG ingestion so sensitive or
high-churn OS files can be read on demand without being embedded into vectors.
"""

from __future__ import annotations

import os


def read_system_file(path: str, max_bytes: int = 256_000) -> str:
    """
    Read a system file only when explicitly requested by a user/tool flow.

    This preserves operational access (e.g. /etc/hosts checks) while keeping
    OS files out of the RAG index.
    """
    normalized = os.path.abspath(path)
    if not os.path.isfile(normalized):
        raise FileNotFoundError(f"System file not found: {normalized}")

    with open(normalized, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read(max_bytes + 1)

    if len(content) > max_bytes:
        return content[:max_bytes] + "\n...[truncated]"
    return content
