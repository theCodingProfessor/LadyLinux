"""
Lady Linux Capstone Project - RAG Layer
File: chunker.py
Description: Reads a file's text content and splits it into overlapping
             passages (512-char windows with 64-char overlap), returning a list
             of {text, metadata} dicts that include the source path, line range,
             timestamp, and domain tag.
"""

import logging
import os
from datetime import datetime, timezone

from core.rag.config import CHUNK_OVERLAP, CHUNK_SIZE, MAX_FILE_SIZE, domain_for_path, is_path_allowed

log = logging.getLogger("rag_layer.chunker")


# ── Helpers ──────────────────────────────────────────────────────────

def _is_binary(path: str, sample_bytes: int = 8192) -> bool:
    """Quick heuristic: if the first *sample_bytes* contain a null byte, treat
    the file as binary and skip it."""
    try:
        with open(path, "rb") as fh:
            return b"\x00" in fh.read(sample_bytes)
    except OSError:
        return True


def _line_range_for_span(text: str, start: int, end: int) -> tuple[int, int]:
    """Return 1-based (line_start, line_end) for a character span."""
    line_start = text.count("\n", 0, start) + 1
    line_end = text.count("\n", 0, end) + 1
    return line_start, line_end


# ── Public API ───────────────────────────────────────────────────────

def chunk_file(path: str) -> list[dict]:
    """
    Read *path* and split its contents into overlapping text chunks.

    Returns a list of dicts, each with keys:
        text         – the chunk string
        source_path  – absolute path of the source file
        line_start   – first line covered (1-based)
        line_end     – last line covered (1-based)
        timestamp    – ISO-8601 mtime of the file
        domain       – domain tag from config.DOMAIN_MAP
    """
    # ── Guard: allowlist / denylist ──
    if not is_path_allowed(path):
        log.debug("Skipping denied/unlisted path: %s", path)
        return []

    # ── Guard: existence & size ──
    if not os.path.isfile(path):
        log.warning("File not found: %s", path)
        return []

    size = os.path.getsize(path)
    if size == 0:
        return []
    if size > MAX_FILE_SIZE:
        log.warning("File too large (%d bytes): %s", size, path)
        return []

    # ── Guard: binary check ──
    if _is_binary(path):
        log.debug("Skipping binary file: %s", path)
        return []

    # ── Read ──
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError as exc:
        log.error("Cannot read %s: %s", path, exc)
        return []

    if not content.strip():
        return []

    # ── Metadata common to every chunk ──
    mtime = os.path.getmtime(path)
    timestamp = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    abs_path = os.path.abspath(path)
    filename = os.path.basename(abs_path)
    directory = os.path.dirname(abs_path)
    filetype = os.path.splitext(filename)[1].lstrip(".").lower() or "text"
    domain = domain_for_path(path)

    # ── Sliding-window chunking ──
    chunks: list[dict] = []
    step = max(CHUNK_SIZE - CHUNK_OVERLAP, 1)
    pos = 0

    while pos < len(content):
        end = min(pos + CHUNK_SIZE, len(content))
        text = content[pos:end]

        # Skip near-empty trailing chunks
        if len(text.strip()) < 20:
            break

        line_start, line_end = _line_range_for_span(content, pos, end)

        chunks.append({
            "text": text,
            "source_path": abs_path,
            # Expanded metadata to enable strict retrieval filtering.
            "filepath": abs_path,
            "filename": filename,
            "directory": directory,
            "filetype": filetype,
            "line_start": line_start,
            "line_end": line_end,
            "timestamp": timestamp,
            "domain": domain,
        })

        pos += step

    log.debug("Chunked %s → %d chunk(s)", path, len(chunks))
    return chunks
