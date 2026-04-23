"""
Lady Linux Capstone Project - RAG Layer
File: file_tracker.py
Description: Tracks which files have been embedded to avoid re-processing
             the same files on every uvicorn restart. Uses a JSON file to
             store file paths, their timestamps, and content hashes.
             Gracefully handles permission errors.

Usage:
    from core.rag.file_tracker import FileTracker
    tracker = FileTracker()
    if not tracker.is_tracked(path):
        # embed the file
        tracker.mark_tracked(path)
"""

import hashlib
import json
import logging
import os

log = logging.getLogger("rag_layer.file_tracker")

# ── Default tracker file location ────────────────────────────────────
# Use /var/lib/ladylinux for service state (standard location, proper permissions)
_TRACKER_DIR = os.getenv("LADYLINUX_TRACKER_DIR", "/var/lib/ladylinux")
_TRACKER_FILE = os.getenv(
    "LADYLINUX_TRACKER_FILE",
    os.path.join(_TRACKER_DIR, "embedded_files.json"),
)


class FileTracker:
    """Manages a persistent record of which files have been embedded."""

    def __init__(self, tracker_file: str | None = None):
        """Initialize the tracker with an optional custom tracker file path."""
        self.tracker_file = tracker_file or _TRACKER_FILE
        self._data: dict = {}
        self._writable = True  # Track if we can write to tracker file
        self._load()

    def _load(self) -> None:
        """Load tracked files from disk, or initialize empty dict."""
        if os.path.exists(self.tracker_file):
            try:
                with open(self.tracker_file, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
                log.debug("Loaded %d tracked file(s)", len(self._data))
            except (json.JSONDecodeError, OSError) as exc:
                log.warning(
                    "Failed to load tracker from %s: %s; starting fresh",
                    self.tracker_file,
                    exc,
                )
                self._data = {}
        else:
            log.debug("Tracker file not found; starting fresh")
            self._data = {}

    def _save(self) -> None:
        """Write tracked files to disk. Gracefully handles permission errors."""
        if not self._writable:
            # Already determined we can't write; don't keep trying
            return

        try:
            os.makedirs(os.path.dirname(self.tracker_file), exist_ok=True)
            with open(self.tracker_file, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2)
            log.debug("Saved tracker to %s", self.tracker_file)
        except OSError as exc:
            log.warning("Failed to save tracker: %s (will continue without persistence)", exc)
            self._writable = False

    def _file_hash(self, path: str) -> str:
        """Compute a content hash of the file."""
        try:
            hasher = hashlib.md5()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except OSError as exc:
            log.warning("Could not hash %s: %s", path, exc)
            return ""

    def is_tracked(self, path: str, check_modified: bool = True) -> bool:
        """
        Return True if the file is already tracked.

        If *check_modified* is True, also verify that the file's
        modification time and hash match the tracked record. Returns False
        if the file has been modified since it was tracked.
        """
        path = os.path.abspath(path)

        if path not in self._data:
            return False

        if not check_modified:
            return True

        try:
            current_mtime = os.path.getmtime(path)
            current_hash = self._file_hash(path)
        except OSError as exc:
            log.warning("Could not check modification of %s: %s", path, exc)
            return False

        tracked = self._data.get(path, {})
        tracked_mtime = tracked.get("mtime")
        tracked_hash = tracked.get("hash")

        # If mtime or hash differ, the file has been modified.
        if current_mtime != tracked_mtime or current_hash != tracked_hash:
            return False

        return True

    def mark_tracked(self, path: str) -> None:
        """Record that a file has been embedded."""
        path = os.path.abspath(path)
        try:
            mtime = os.path.getmtime(path)
            file_hash = self._file_hash(path)
            self._data[path] = {
                "mtime": mtime,
                "hash": file_hash,
            }
            self._save()
        except OSError as exc:
            log.warning("Could not track %s: %s", path, exc)

    def unmark_tracked(self, path: str) -> None:
        """Remove a file from the tracking record (e.g., if re-ingestion is needed)."""
        path = os.path.abspath(path)
        if path in self._data:
            del self._data[path]
            self._save()

    def reset(self) -> None:
        """Clear all tracking data and remove tracker file from disk."""
        self._data = {}
        try:
            if os.path.exists(self.tracker_file):
                os.remove(self.tracker_file)
                log.info("Tracker file reset: %s", self.tracker_file)
        except OSError as exc:
            log.warning("Could not remove tracker file: %s", exc)
