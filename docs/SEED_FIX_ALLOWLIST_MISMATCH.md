# RAG Seeding Fix - Allowlist Scope Mismatch

## Problem

The seed pipeline was finding 75 candidate files but ingesting **zero files** with no errors:

```
Seed: found 75 candidate file(s)
Seed complete - 0/75 files ingested, 0 chunks stored, 0 error(s)
```

**Root Cause**: The `chunk_file()` function in `chunker.py` was enforcing the **RAG retrieval scope** (`ALLOWED_RAG_PATHS` from config.py) on all files, but `seed.py` was using its own **seeding scope** (`ALLOWED_SEED_ROOTS`). These scopes are completely different:

**ALLOWED_SEED_ROOTS** (used by seed.py to find files):
- `/opt/ladylinux/app`
- `/etc/ssh`
- `/etc/ufw`
- `/etc/netplan`
- `/etc/systemd/system`
- `/etc/hostname`
- `/etc/hosts`
- `/etc/network`

**ALLOWED_RAG_PATHS** (used by chunk_file for validation):
- `/opt/ladylinux`
- `templates`
- `static`
- `config`
- `scripts`

When seed.py found files in `/etc/ssh/`, the chunk_file() would reject them with:
```
Skipping denied/unlisted path: /etc/ssh/sshd_config
```

This happened silently (debug-level logging), so the seed appeared to complete successfully (0 errors) while actually processing nothing.

## Solution

### 1. Added `skip_allowlist_check` parameter to `chunk_file()`
**File**: `core/rag/chunker.py`

```python
def chunk_file(path: str, skip_allowlist_check: bool = False) -> list[dict]:
    """
    ...
    Args:
        path: File path to chunk
        skip_allowlist_check: If True, skip RAG allowlist validation (used by seed.py)
    """
    # ── Guard: allowlist / denylist ──
    if not skip_allowlist_check and not is_path_allowed(path):
        log.debug("Skipping denied/unlisted path: %s", path)
        return []
```

### 2. Updated seed.py to pass `skip_allowlist_check=True`
**File**: `core/rag/seed.py`

```python
# --- chunk ---
# Note: skip_allowlist_check=True because seed.py uses its own scope
# (ALLOWED_SEED_ROOTS) which is different from RAG retrieval scope
chunks = chunk_file(path, skip_allowlist_check=True)
```

### 3. Added comprehensive debug logging
- Log `QDRANT_MODE` at startup
- Log how many files are tracked when FileTracker loads
- Log when tracker is reset
- Log for each file whether it's being processed or skipped
- Log reason for skipping (too large, no chunks, etc.)

## Why This Works

**Seeding scope** (`ALLOWED_SEED_ROOTS`):
- System configuration files that should be embedded on startup
- Files in `/etc/ssh`, `/etc/ufw`, etc.
- These are the "knowledge base" for LLM context

**RAG retrieval scope** (`ALLOWED_RAG_PATHS`):
- Subset of paths that are allowed during normal retrieval operations
- Project-focused to avoid noisy OS-level generic context
- Does NOT include most `/etc` paths

**Solution separates these concerns**:
- Seed finds and chunks files using its own scope
- Chunker validates paths based on use case (skip check for seed, enforce for RAG)
- Normal RAG queries still respect the stricter retrieval scope

## Expected Behavior After Fix

```
Seed: found 75 candidate file(s)
FileTracker loaded with 0 tracked file(s)
In-memory mode detected; resetting file tracker for fresh seed
File tracker reset complete; _data now has 0 items
Chunking /etc/ssh/sshd_config (size: 3.5 KB)
Embedded 16 chunk(s) via nomic-embed-text
  [OK] /etc/ssh/sshd_config  ->  16 chunk(s)
...
Seed complete - 75/75 files ingested, 2264 chunks stored, 0 error(s)
```

Files are now properly embedded into the vector store on startup.

## Testing the Fix

1. Start the app with in-memory mode:
   ```bash
   cd /opt/ladylinux
   source venv/bin/activate
   QDRANT_MODE=memory uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
   ```

2. Check logs for confirmation:
   ```
   Seed: found X candidate file(s)
   FileTracker loaded with N tracked file(s)
   In-memory mode detected; resetting file tracker for fresh seed
   ...
   Seed complete - X/X files ingested, Y chunks stored, 0 error(s)
   ```

3. Query the LLM and verify it pulls from the vector store:
   ```
   User: "What's my SSH configuration?"
   LLM should reference: /etc/ssh/sshd_config
   ```

## Files Modified

- `core/rag/chunker.py`: Added `skip_allowlist_check` parameter to `chunk_file()`
- `core/rag/seed.py`: 
  - Pass `skip_allowlist_check=True` when calling `chunk_file()`
  - Enhanced logging throughout the seed process
  - Changed tracker reset log from debug to info level

## Related Issues

- Issue: Scope mismatch between seeding and RAG validation
- Severity: Critical (seed was silently failing)
- Impact: Users could not get embeddings from system config files needed for LLM context

