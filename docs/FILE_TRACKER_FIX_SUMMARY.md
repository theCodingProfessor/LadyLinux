# File Tracker Permission Fix — Complete

**Date**: April 8, 2026  
**Status**: ✅ FIXED  
**Issue**: "Failed to save tracker: [Errno 13] Permission denied: '/home/ladylinux'"

---

## Problem

When running the embedding process, the system logged repeated warnings:
```
WARNING   Failed to save tracker: [Errno 13] Permission denied: '/home/ladylinux'
```

The RAG system was trying to save the file tracker to `~/.ladylinux` (which expands to `/home/ladylinux/.ladylinux`), but the `ladylinux` service user didn't have write permissions there.

---

## Root Cause

In `rag_layer/file_tracker.py`, the default tracker location was:
```python
_TRACKER_DIR = os.path.expanduser("~/.ladylinux")  # ❌ /home/ladylinux/.ladylinux
```

This is problematic because:
1. Service users should use `/var/lib/` for state files (FHS standard)
2. The service user might not have write permissions to home directory
3. Home directory is less reliable for service state

---

## Solution

### File 1: `rag_layer/file_tracker.py` ✅

**Changed**:
```python
# ❌ OLD
_TRACKER_DIR = os.path.expanduser("~/.ladylinux")

# ✅ NEW  
_TRACKER_DIR = os.getenv("LADYLINUX_TRACKER_DIR", "/var/lib/ladylinux")
```

**Benefits**:
- Uses standard `/var/lib/ladylinux` location (FHS-compliant)
- Respects `LADYLINUX_TRACKER_DIR` environment variable for customization
- Service user has write permissions to `/var/lib/ladylinux`
- No permission errors when saving tracker

---

### File 2: `scripts/start_lady.sh` ✅

**Added** (lines 353-366):
```bash
# --- Ensure tracker directory exists (for RAG file tracking) ---
echo "  → Ensuring RAG tracker directory: /var/lib/ladylinux"
mkdir_safe "/var/lib/ladylinux"

if id "$SERVICE_USER" >/dev/null 2>&1; then
    echo "  → Setting tracker directory permissions..."
    sudo chown "$SERVICE_USER:$SERVICE_GROUP" "/var/lib/ladylinux" >/dev/null 2>&1 || true
    sudo chmod 0755 "/var/lib/ladylinux" || true
fi
echo "  → Tracker directory ready: /var/lib/ladylinux"
```

**Benefits**:
- Installation script creates `/var/lib/ladylinux` directory
- Sets proper ownership to `ladylinux:ladylinux`
- Sets permissions to `0755` (world-readable, owner-writable)
- Directory exists before service starts

---

### File 3: `ladylinux-api.service` ✅

**Added** (line 44):
```ini
Environment="LADYLINUX_TRACKER_DIR=/var/lib/ladylinux"
```

**Benefits**:
- Systemd service explicitly configures tracker location
- Environment variable set before service starts
- Overrides Python code default with explicit configuration
- Clear visibility of tracker location in service file

---

## Deployment

### To fix an existing installation:

```bash
# 1. Update file_tracker.py (code already fixed in repo)

# 2. Create/fix tracker directory
sudo mkdir -p /var/lib/ladylinux
sudo chown ladylinux:ladylinux /var/lib/ladylinux
sudo chmod 0755 /var/lib/ladylinux

# 3. Update systemd service
sudo systemctl daemon-reload

# 4. Restart service
sudo systemctl restart ladylinux-api.service

# 5. Verify no warnings
journalctl -u ladylinux-api.service -f
```

### For new installations:

```bash
# Run the updated install script (includes tracker directory setup)
sudo ./scripts/system_build.sh
```

---

## Verification

After applying the fix, you should **NOT** see these warnings:

```
# ❌ BEFORE (with warnings)
WARNING   Failed to save tracker: [Errno 13] Permission denied: '/home/ladylinux'

# ✅ AFTER (clean logs)
INFO      Embedded X chunk(s) via nomic-embed-text
INFO      Upserted X point(s) into 'ladylinux'
```

Check logs:
```bash
journalctl -u ladylinux-api.service -f | grep -i tracker
# Should return no results or only debug logs
```

Verify tracker file was created:
```bash
ls -la /var/lib/ladylinux/
# Should show: embedded_files.json (if embedding has run)
```

---

## Impact

### Embedding Process

✅ **No functional change** — Embedding still works during warnings  
✅ **Now cleaner** — No permission errors after fix  
✅ **Persistent** — Tracker file properly saved and loaded  

### RAG Retrieval

✅ **No impact** — Retrieval was always working  
✅ **Better** — Tracker prevents re-embedding same files  

### Performance

✅ **Improved** — Second run skips already-embedded files  
✅ **Faster seed** — Background seed completes quicker on restart  

---

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `rag_layer/file_tracker.py` | Use `/var/lib/ladylinux` instead of `~/.ladylinux` | 25-28 |
| `scripts/start_lady.sh` | Create tracker directory with permissions | 353-366 |
| `ladylinux-api.service` | Set `LADYLINUX_TRACKER_DIR` environment variable | 44 |

---

## Backward Compatibility

✅ **Fully backward compatible**:
- Old tracker file at `~/.ladylinux/embedded_files.json` is ignored
- New tracker file at `/var/lib/ladylinux/embedded_files.json` is used
- Re-embedding happens on next seed if tracker migrated
- No data loss (only tracker state, re-computed from content)

---

## References

- **FHS Standard**: `/var/lib/` for service state files  
- **systemd conventions**: Service user permissions to `/var/lib/`  
- **Best practice**: Never use home directory for service state  

---

**Status**: ✅ **ALL FIXED** — Ready for deployment

All files have been updated. The system will no longer show permission errors during embedding, and the file tracker will persist correctly in the standard service state directory.

