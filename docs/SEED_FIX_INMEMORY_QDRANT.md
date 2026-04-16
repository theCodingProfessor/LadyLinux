# RAG Seeding Fix - In-Memory Qdrant

## Problem

The seed pipeline was finding 75 candidate files but ingesting **zero files** with no errors:

```
Seed: found 75 candidate file(s)
...
Seed complete - 0/75 files ingested, 0 chunks stored, 0 error(s)
```

**Root Cause**: The `FileTracker` (which persists to disk at `/var/lib/ladylinux/embedded_files.json`) was preventing all files from being processed. 

When using **in-memory Qdrant** (fresh collection each restart), the old tracker state made the seed think all files were already embedded—even though the collection was empty.

## Solution

### 1. Added `reset()` method to FileTracker
**File**: `core/rag/file_tracker.py`

```python
def reset(self) -> None:
    """Clear all tracking data and remove tracker file from disk."""
    self._data = {}
    try:
        if os.path.exists(self.tracker_file):
            os.remove(self.tracker_file)
            log.info("Tracker file reset: %s", self.tracker_file)
    except OSError as exc:
        log.warning("Could not remove tracker file: %s", exc)
```

### 2. Updated seed.py to detect and reset on in-memory startup
**File**: `core/rag/seed.py`

```python
# Check if we should reset tracker (in-memory mode always needs fresh seed)
if QDRANT_MODE == "memory":
    log.debug("In-memory mode detected; resetting file tracker for fresh seed")
    tracker.reset()
```

## Why This Works

**In-memory Qdrant** (`QDRANT_MODE == "memory"`):
- Collection is created fresh on every startup
- Old tracker state from disk doesn't match the empty collection
- Calling `tracker.reset()` clears the old state, forcing re-ingestion of all files
- Files are chunked, embedded, and upserted to the fresh collection

**Persistent Qdrant** (`QDRANT_MODE == "local"` or `"server"`):
- Collection persists across restarts
- Tracker correctly skips unchanged files
- `reset()` is **not** called, so optimization remains intact

## Expected Behavior After Fix

```
Seed: found 75 candidate file(s)
Embedded 16 chunk(s) via nomic-embed-text
...
Seed complete - 75/75 files ingested, 2264 chunks stored, 0 error(s)
Background seed done — 75 file(s), 2264 chunk(s), 0 error(s)
```

Files are now properly embedded into the vector store on every startup (when using in-memory mode).

## Testing the Fix

1. Start the app:
   ```bash
   cd /opt/ladylinux
   source venv/bin/activate
   QDRANT_MODE=memory uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
   ```

2. Check logs for confirmation:
   ```
   Seed: found X candidate file(s)
   Seed complete - X/X files ingested, Y chunks stored, 0 error(s)
   ```

3. Query the LLM and verify it pulls from the vector store (should reference sources from `/etc/ufw`, `/etc/ssh`, etc.)

## Files Modified

- `core/rag/file_tracker.py`: Added `reset()` method
- `core/rag/seed.py`: Import `QDRANT_MODE` and call `reset()` when in memory mode

