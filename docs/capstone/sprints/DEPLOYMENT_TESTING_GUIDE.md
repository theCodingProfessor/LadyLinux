# RAG Consolidation - Deployment & Testing Guide

**Document**: Consolidation Testing Checklist  
**Status**: Ready for Implementation  
**Date**: April 10, 2026

---

## Pre-Deployment Verification (Local Machine)

Run these checks before deploying to Linux:

### 1. File Structure Verification ✅
```bash
# Check that rag_layer is archived
ls -d rag_layer_archived/     # Should exist
ls -d rag_layer/              # Should NOT exist (removed from active code)

# Check core.rag structure
ls -la core/rag/
# Expected files:
#   __init__.py
#   config.py              (UPDATED - merged domain map)
#   chunker.py
#   embedder.py
#   file_tracker.py        (NEW - permission-aware)
#   retriever.py
#   seed.py                (UPDATED - uses file_tracker)
#   vector_store.py
#   domain_router.py
#   system_provider.py
#   system_file_tools.py
#   watchdog_ingest.py
```

### 2. Import Verification
```bash
# No rag_layer imports should remain
grep -r "from rag_layer\|import rag_layer" --include="*.py" .

# Expected: 0 results

# Verify core.rag imports in app.py
grep "from core.rag" api_layer/app.py

# Expected: 4 results
#   - from core.rag.retriever import ...
#   - from core.rag.seed import ...
#   - from core.rag.system_provider import ...
#   - from core.rag.vector_store import ...
```

### 3. Configuration Verification
```bash
# Check QDRANT_MODE default (should be "local")
grep "QDRANT_MODE = " core/rag/config.py

# Check OLLAMA endpoint
grep "OLLAMA_EMBED_URL" core/rag/config.py

# Check domain map exists
grep "DOMAIN_MAP" core/rag/config.py
```

---

## Local Testing on Windows/macOS

### Setup for In-Memory Testing (no permission issues)
```bash
cd /path/to/feb_lady

# Set environment to use in-memory Qdrant (no /var/lib/ needed on local machine)
export QDRANT_MODE=memory

# Activate venv and run
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

### Expected Output
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
2026-04-10 15:54:51,501  INFO      Initialising Qdrant client in **in-memory** mode
2026-04-10 15:54:51,xyz  INFO      LadyLinux API started
```

### Test Endpoints
```bash
# Test RAG retrieval (should work with empty vector store initially)
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is firewall?", "domain": "firewall"}'

# Expected: 200 OK (even if no results, no errors)
```

---

## Linux Deployment Testing

### Prerequisites
- Ubuntu 20.04 or later
- Sudo access
- Git installed
- ~5GB free disk space

### Step 1: Fresh Installation Test
```bash
# Clone repository
cd /tmp
git clone --branch Capstone_Dev_01 https://github.com/theCodingProfessor/LadyLinux.git
cd LadyLinux

# Run fresh installation
sudo ./scripts/current_ladylinuxinstall.sh
```

### Expected Behavior
```
[1/10] Updating package index...
[2/10] Checking for system upgrades...
...
[9/10] Configuring ladylinux service user...
  → Creating application data directories...
  → Application directories configured.
...
[11/11] Setting up systemd service...
  → Service started successfully! ✓
```

### Step 2: Verify Service Startup
```bash
# Check service status
sudo systemctl status ladylinux-api.service

# Expected output: ● ladylinux-api.service - LadyLinux API Service
#                    Loaded: loaded (/etc/systemd/system/ladylinux-api.service; enabled; preset: enabled)
#                    Active: active (running) since ...
```

### Step 3: Check Logs for Permission Errors
```bash
# Stream logs
journalctl -u ladylinux-api.service -f

# Look for these SUCCESS markers:
# ✅ "Initialising Qdrant client in **local** mode (path=/var/lib/ladylinux/qdrant)"
# ✅ "LadyLinux API started; logging to /var/log/ladylinux/ladylinux.log"
# ✅ "Seed complete — X/Y files ingested"

# Watch for these ERROR patterns (if found, consolidation failed):
# ❌ "PermissionError: [Errno 13] Permission denied: '/var/lib/ladylinux/qdrant/.lock'"
# ❌ "Failed to save tracker: [Errno 13] Permission denied"
```

### Step 4: Verify Directory Structure
```bash
# Check /var/lib/ladylinux
ls -la /var/lib/ladylinux/
# Expected:
#   drwxr-xr-x  ladylinux  ladylinux  qdrant/
#   drwxr-xr-x  ladylinux  ladylinux  data/

# Check /var/log/ladylinux
ls -la /var/log/ladylinux/
# Expected:
#   -rw-r--r--  ladylinux  ladylinux  ladylinux.log (or empty if just started)
```

### Step 5: Test RAG Endpoint
```bash
# Query the /ask_rag endpoint
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What configuration files exist?", "domain": "general"}'

# Expected: 200 OK with JSON response
{
  "response": "...",
  "context_used": true,
  "chunks_retrieved": N
}
```

### Step 6: Refresh Test (incremental update)
```bash
# Make a minor change to the repo (to test incremental refresh)
cd /opt/ladylinux
echo "# test update" >> README.md
git add README.md
git commit -m "test update"
git push

# Run refresh script
sudo ./scripts/refresh_vm.sh Capstone_Dev_01

# Expected output:
# [refresh] ======================================================================
# [refresh] Refresh complete. ✓
# [refresh] ======================================================================

# Verify service still running
sudo systemctl status ladylinux-api.service
# Expected: Active (running)
```

---

## Rollback Procedure (if needed)

### Quick Rollback to Dual RAG
```bash
# If something goes wrong, you have options:

# Option 1: Restore rag_layer from archive
cd /opt/ladylinux
mv rag_layer_archived rag_layer

# Option 2: Reset entire repo to before consolidation
git log --oneline | head -20
git reset --hard <commit-before-consolidation>

# Option 3: Switch branch temporarily
git checkout develop  # or another stable branch
```

---

## Troubleshooting Guide

### Issue: "Permission denied: '/var/lib/ladylinux/qdrant/.lock'"

**Diagnosis**: `/var/lib/ladylinux` was not created before service startup.

**Fix**:
```bash
# Manually create and set ownership
sudo mkdir -p /var/lib/ladylinux/qdrant /var/lib/ladylinux/data
sudo chown -R ladylinux:ladylinux /var/lib/ladylinux
sudo chmod -R 0755 /var/lib/ladylinux

# Restart service
sudo systemctl restart ladylinux-api.service
```

**Root Cause**: Installation script didn't run, or ran before directory creation. Solution: Ensure `current_ladylinuxinstall.sh` is used.

---

### Issue: "Failed to save tracker: [Errno 13] Permission denied"

**Diagnosis**: File tracker can't write to `/var/lib/ladylinux/embedded_files.json`.

**Expected Behavior** (NOT an error):
```
WARNING   Failed to save tracker: ... (will continue without persistence)
```

This is **normal and expected** if `/var/lib/ladylinux` is read-only. The app continues running—files just get re-embedded on next restart.

**Fix** (if you want persistence):
```bash
sudo chmod 755 /var/lib/ladylinux
sudo chown ladylinux:ladylinux /var/lib/ladylinux
sudo systemctl restart ladylinux-api.service
```

---

### Issue: "ModuleNotFoundError: No module named 'rag_layer'"

**Diagnosis**: Code is still trying to import from old `/rag_layer/` module.

**Check**:
```bash
grep -r "from rag_layer\|import rag_layer" --include="*.py" /opt/ladylinux/
```

**Fix**: Update any found imports to `from core.rag`:
```python
# CHANGE THIS:
from rag_layer.retriever import retrieve

# TO THIS:
from core.rag.retriever import retrieve
```

---

### Issue: Service starts but logs show "Search returned 0 result(s)"

**Diagnosis**: Qdrant collection created but seed() didn't populate it with vectors.

**Check**:
```bash
journalctl -u ladylinux-api.service | grep -i "seed\|embedding\|vectoriz"
```

**Expected**:
```
INFO      Seed: found 10 candidate file(s)
INFO      Seed complete — 10/10 files ingested, 25 chunks stored
```

**If missing**:
```bash
# Manually trigger seed
source /opt/ladylinux/venv/bin/activate
cd /opt/ladylinux
python -m core.rag.seed

# Watch output for errors
```

---

## Success Criteria Checklist

Mark each as verified:

- [ ] **No "rag_layer" imports** — `grep -r "from rag_layer"` returns 0 results
- [ ] **Service starts without permission errors** — `journalctl` shows "LadyLinux API started"
- [ ] **Qdrant initializes in local mode** — Log shows "local mode (path=/var/lib/ladylinux/qdrant)"
- [ ] **File tracker gracefully handles permissions** — No crash if `/var/lib/ladylinux` is read-only
- [ ] **Seed completes successfully** — Log shows "Seed complete — X/Y files ingested"
- [ ] **Domain map enables filtering** — `/ask_rag` with `domain="firewall"` works
- [ ] **Refresh script works** — `sudo ./refresh_vm.sh` completes without errors
- [ ] **Web interface loads** — `http://localhost:8000` shows dashboard
- [ ] **RAG endpoint responds** — `POST /ask_rag` returns 200 OK

---

## Performance Notes

### Expected Startup Time
- **Cold start** (first run, seeding files): 30-60 seconds
- **Warm start** (venv exists, no re-seed): 5-10 seconds
- **Service restart** (already seeded): <5 seconds

### Embedding Performance
- **First embedding**: ~5-10 seconds (model load + embedding)
- **Subsequent queries**: <1 second (model cached)

### Qdrant Storage
- **Persistent disk usage**: ~100-500 MB (depends on file count)
- **In-memory usage**: ~50-200 MB

---

## Post-Deployment Cleanup

Once deployment is verified successful on Linux:

```bash
# Delete archived rag_layer (backup if needed)
cd /opt/ladylinux
tar -czf /home/ladylinux/rag_layer_archived.tar.gz rag_layer_archived/
rm -rf rag_layer_archived/

# Update git to remove old commits
git gc --aggressive
```

---

## Next Steps

1. **Run fresh installation** on test VM
2. **Verify all success criteria** above
3. **Test firewall domain** queries via `/ask_rag`
4. **Test refresh script** on production
5. **Delete rag_layer_archived** once confirmed stable
6. **Document any environment-specific issues** for team

---

**Status**: Ready for deployment  
**Tested On**: April 10, 2026  
**Approved By**: Consolidation Sprint  

