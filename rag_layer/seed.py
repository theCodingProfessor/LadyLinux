"""
Lady Linux Capstone Project - RAG Layer
File: seed.py
Description: One-shot ingestion script that reads every allow-listed file,
             runs it through the chunker → embedder → vector_store pipeline,
             and populates the Qdrant collection so retrieval works immediately
             after startup.  Safe to re-run (upserts are idempotent).

             Tracks which files have been embedded to avoid redundant processing.

Usage:
    python -m rag_layer.seed          # from project root
    python -m rag_layer.seed --force  # force re-embed even tracked files
"""

import os
import sys
import logging

from rag_layer.config import (
    ALLOWED_PATHS,
    MAX_FILE_SIZE,
    is_path_allowed,
)
from rag_layer.chunker import chunk_file
from rag_layer.embedder import embed_texts
from rag_layer.file_tracker import FileTracker
from rag_layer.vector_store import ensure_collection, upsert_chunks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger("rag_layer.seed")


def _expand_paths() -> list[str]:
    """Walk every ALLOWED_PATHS entry and return concrete file paths."""
    files: list[str] = []
    for entry in ALLOWED_PATHS:
        if os.path.isfile(entry):
            files.append(entry)
        elif os.path.isdir(entry):
            for root, _dirs, filenames in os.walk(entry):
                for fname in filenames:
                    full = os.path.join(root, fname)
                    if is_path_allowed(full):
                        files.append(full)
        # else: entry doesn't exist on this host — skip silently
    return sorted(set(files))


def seed(force: bool = False) -> dict:
    """
    Run the full ingest pipeline for every allowed file.

    If *force* is True, re-embed all files regardless of tracking status.

    Returns a summary dict:
        {
            "files_found": int,
            "files_ingested": int,
            "files_skipped": int,
            "chunks_stored": int,
            "errors": [...]
        }
    """
    ensure_collection()
    tracker = FileTracker()

    files = _expand_paths()
    log.info("Seed: found %d candidate file(s)", len(files))

    stats = {
        "files_found": len(files),
        "files_ingested": 0,
        "files_skipped": 0,
        "chunks_stored": 0,
        "errors": [],
    }

    for path in files:
        try:
            # --- Check if already tracked (unless --force) ---
            if not force and tracker.is_tracked(path):
                log.debug("  ↷ %s (already tracked, skipping)", path)
                stats["files_skipped"] += 1
                continue

            # --- safety: size check ---
            size = os.path.getsize(path)
            if size > MAX_FILE_SIZE:
                log.warning("Skipping %s (%.1f KB > limit)", path, size / 1024)
                continue
            if size == 0:
                log.debug("Skipping empty file %s", path)
                continue

            # --- chunk ---
            chunks = chunk_file(path)
            if not chunks:
                continue

            # --- embed ---
            texts = [c["text"] for c in chunks]
            vectors = embed_texts(texts)

            # --- store ---
            upsert_chunks(chunks, vectors)

            # --- mark tracked ---
            tracker.mark_tracked(path)

            stats["files_ingested"] += 1
            stats["chunks_stored"] += len(chunks)
            log.info("  ✓ %s  →  %d chunk(s)", path, len(chunks))

        except PermissionError:
            msg = f"Permission denied: {path}"
            log.warning("  ✗ %s", msg)
            stats["errors"].append(msg)
        except Exception as exc:  # noqa: BLE001
            msg = f"{path}: {exc}"
            log.error("  ✗ %s", msg)
            stats["errors"].append(msg)

    log.info(
        "Seed complete — %d/%d files ingested, %d skipped, %d chunks stored, %d error(s)",
        stats["files_ingested"],
        stats["files_found"],
        stats["files_skipped"],
        stats["chunks_stored"],
        len(stats["errors"]),
    )
    return stats


# ── CLI entry point ──────────────────────────────────────────────────
if __name__ == "__main__":
    force_flag = "--force" in sys.argv
    summary = seed(force=force_flag)
    if summary["errors"]:
        print("\nErrors:")
        for e in summary["errors"]:
            print(f"  - {e}")
        sys.exit(1)
