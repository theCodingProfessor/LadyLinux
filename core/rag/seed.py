"""
Lady Linux Capstone Project - RAG Layer
File: seed.py
Description: One-shot ingestion script that reads every allow-listed file,
             runs it through the chunker -> embedder -> vector_store pipeline,
             and populates the Qdrant collection so retrieval works immediately
             after startup. Safe to re-run (upserts are idempotent).

Usage:
    python -m rag_layer.seed          # from project root
"""

import logging
import os
import sys

from core.rag.chunker import chunk_file
from core.rag.embedder import embed_texts
from core.rag.vector_store import ensure_collection, upsert_chunks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger("rag_layer.seed")

# Strict ingestion scope for system-aware RAG seeding.
ALLOWED_SEED_ROOTS: tuple[str, ...] = (
    "/opt/ladylinux/app",   # project code
    "/etc/ssh",             # static system config
    "/etc/ufw",
    "/etc/netplan",
    "/etc/systemd/system",  # just the unit files, not all of systemd
    "/etc/hostname",
    "/etc/hosts",
    "/etc/network",
)

EXCLUDED_SEED_PATHS: tuple[str, ...] = (
    "/opt/ladylinux/venv",
    "/opt/ladylinux/app/static",
    "/opt/ladylinux/app/templates",
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/ssl/private",
    "/etc/ssh/ssh_host_",
)

VALID_EXTENSIONS: set[str] = {
    ".py",
    ".md",
    ".txt",
    ".conf",
    ".json",
    ".yaml",
    ".yml",
    ".service",
    ".sh",
    ".ini",
}

MAX_SEED_FILE_SIZE = 200 * 1024  # 200 KB


def _normalize(path: str) -> str:
    return os.path.abspath(path)


def _is_same_or_child(path: str, parent: str) -> bool:
    path_norm = _normalize(path)
    parent_norm = _normalize(parent)
    return path_norm == parent_norm or path_norm.startswith(f"{parent_norm}{os.sep}")


def _is_excluded(path: str) -> bool:
    return any(_is_same_or_child(path, blocked) for blocked in EXCLUDED_SEED_PATHS)


def _has_valid_extension(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in VALID_EXTENSIONS


def _log_scope() -> None:
    log.info("RAG seeding scope:")
    log.info("  allowed roots: %d", len(ALLOWED_SEED_ROOTS))
    log.info("  excluded paths: %d", len(EXCLUDED_SEED_PATHS))
    log.info("  valid extensions: %d", len(VALID_EXTENSIONS))


def _expand_paths() -> list[str]:
    """Walk allowed roots and return filtered candidate file paths."""
    files: list[str] = []

    for entry in ALLOWED_SEED_ROOTS:
        if os.path.isfile(entry):
            if _is_excluded(entry):
                continue
            if _has_valid_extension(entry):
                files.append(entry)
        elif os.path.isdir(entry):
            for root, dirs, filenames in os.walk(entry):
                # Prevent descent into excluded directories.
                dirs[:] = [
                    d for d in dirs
                    if not _is_excluded(os.path.join(root, d))
                ]

                for fname in filenames:
                    full = os.path.join(root, fname)
                    if _is_excluded(full):
                        continue
                    if not _has_valid_extension(full):
                        continue
                    files.append(full)
        # else: entry doesn't exist on this host - skip silently

    return sorted(set(files))


def seed() -> dict:
    """
    Run the full ingest pipeline for every allowed file.

    Returns a summary dict:
        {"files_found": int, "files_ingested": int, "chunks_stored": int, "errors": [...]}
    """
    ensure_collection()
    _log_scope()

    files = _expand_paths()
    log.info("Seed: found %d candidate file(s)", len(files))

    stats = {"files_found": len(files), "files_ingested": 0, "chunks_stored": 0, "errors": []}

    for path in files:
        try:
            # --- safety: size check ---
            size = os.path.getsize(path)
            if size > MAX_SEED_FILE_SIZE:
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

            stats["files_ingested"] += 1
            stats["chunks_stored"] += len(chunks)
            log.info("  [OK] %s  ->  %d chunk(s)", path, len(chunks))

        except PermissionError:
            msg = f"Permission denied: {path}"
            log.warning("  [ERR] %s", msg)
            stats["errors"].append(msg)
        except Exception as exc:  # noqa: BLE001
            msg = f"{path}: {exc}"
            log.error("  [ERR] %s", msg)
            stats["errors"].append(msg)

    log.info(
        "Seed complete - %d/%d files ingested, %d chunks stored, %d error(s)",
        stats["files_ingested"],
        stats["files_found"],
        stats["chunks_stored"],
        len(stats["errors"]),
    )
    return stats


if __name__ == "__main__":
    summary = seed()
    if summary["errors"]:
        print("\nErrors:")
        for e in summary["errors"]:
            print(f"  - {e}")
        sys.exit(1)
