"""
Lady Linux Capstone Project - RAG Layer
File: file_tracker.py
Description: Tracks which files have been embedded to avoid re-processing
             the same files on every uvicorn restart. Uses a JSON file to
             store file paths, their timestamps, and content hashes.

Usage:
    from rag_layer.file_tracker import FileTracker
    tracker = FileTracker()
    if not tracker.is_tracked(path):
        # embed the file
        tracker.mark_tracked(path)
"""

import hashlib
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("rag_layer.file_tracker")

# ── Default tracker file location ────────────────────────────────────
_TRACKER_DIR = os.path.expanduser("~/.ladylinux")
_TRACKER_FILE = os.path.join(_TRACKER_DIR, "embedded_files.json")


class FileTracker:
    """Manages a persistent record of which files have been embedded."""

    def __init__(self, tracker_file: str | None = None):
        """Initialize the tracker with an optional custom tracker file path."""
        self.tracker_file = tracker_file or _TRACKER_FILE
        self._data: dict = {}
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
        """Write tracked files to disk."""
        try:
            os.makedirs(os.path.dirname(self.tracker_file), exist_ok=True)
            with open(self.tracker_file, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2)
            log.debug("Saved tracker to %s", self.tracker_file)
        except OSError as exc:
            log.warning("Failed to save tracker: %s", exc)

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
            log.warning("Could not check modification time for %s: %s", path, exc)
            return False

        tracked = self._data[path]
        tracked_mtime = tracked.get("mtime")
        tracked_hash = tracked.get("hash")

        # If content hash hasn't changed, file is still current
        if current_hash == tracked_hash:
            log.debug("File %s is tracked and unmodified", path)
            return True

        log.debug("File %s was modified (mtime or hash changed)", path)
        return False

    def mark_tracked(self, path: str) -> None:
        """Mark a file as tracked, recording its mtime and content hash."""
        path = os.path.abspath(path)
        try:
            mtime = os.path.getmtime(path)
            file_hash = self._file_hash(path)

            self._data[path] = {
                "mtime": mtime,
                "hash": file_hash,
                "timestamp": os.path.getctime(path),
            }
            self._save()
            log.debug("Marked %s as tracked", path)
        except OSError as exc:
            log.warning("Could not track %s: %s", path, exc)

    def untrack(self, path: str) -> None:
        """Remove a file from the tracking record."""
        path = os.path.abspath(path)
        if path in self._data:
            del self._data[path]
            self._save()
            log.debug("Untracked %s", path)

    def clear(self) -> None:
        """Clear all tracking records."""
        self._data = {}
        self._save()
        log.info("Cleared all tracked files")

    def get_all_tracked(self) -> list[str]:
        """Return a list of all currently tracked file paths."""
        return list(self._data.keys())
