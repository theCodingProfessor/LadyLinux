# Quick Testing Guide - RAG Seed Pipeline Fix

## What Was Fixed

The seed pipeline was finding 75 files but ingesting **zero**. Now it should ingest **all 75**.

## Quick Test (5 minutes)

### Step 1: Start the App
```bash
cd /opt/ladylinux
source venv/bin/activate
QDRANT_MODE=memory uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

### Step 2: Watch the Logs
Look for these key lines:
```
Seed: found 75 candidate file(s)          # ← Files discovered
FileTracker loaded with 0 tracked file(s) # ← Fresh start
In-memory mode detected...                # ← Reset triggered
[OK] /etc/ssh/sshd_config → 16 chunk(s)  # ← Files being ingested
[OK] /etc/ufw/ufw.conf → 8 chunk(s)
...
Seed complete - 75/75 files ingested      # ← SUCCESS!
```

### Step 3: Test in Browser
1. Open http://localhost:8000/firewall
2. Click **Lady Panel** (expand it)
3. Ask: "What are your firewall settings?"
4. Expected: LLM references `/etc/ufw/` files in response

---

## Verification Checklist

- [ ] Logs show `"Seed: found 75 candidate file(s)"`
- [ ] Logs show `"In-memory mode detected; resetting file tracker"`
- [ ] Logs show multiple `"[OK]"` entries (not all skipped)
- [ ] Final log shows `"Seed complete - 75/75 files ingested"`
- [ ] Tracker file created: `/var/lib/ladylinux/embedded_files.json` exists
- [ ] LLM queries return context from `/etc/` files (not just generic responses)

---

## What Each Fix Does

### 1. FileTracker.reset() [file_tracker.py]
- Clears the on-disk record of embedded files
- Ensures fresh seed on in-memory startup

### 2. In-Memory Detection [seed.py]
- Detects when `QDRANT_MODE=memory`
- Automatically calls `tracker.reset()` for fresh seed

### 3. Allowlist Bypass [chunker.py]
- Allows seeding to access `/etc/` files
- RAG retrieval still respects project-only scope

---

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Still `0/75 files ingested` | Tracker reset didn't fire | Check logs for `"In-memory mode detected"` |
| `Permission denied` on tracker | Service user can't write `/var/lib/` | Run with proper sudo or fix permissions |
| LLM says "no data" | Files embedded but not retrieved | Check domain routing in retriever.py |
| Takes >2 minutes to start | Normal | First seed embeds 75 files (~30-60 sec) |

---

## Next Steps (After Testing)

1. Switch to persistent mode for production:
   ```bash
   QDRANT_MODE=local uvicorn api_layer.app:app ...
   ```

2. Verify tracker optimization works:
   - First startup: embeds all files
   - Second startup: reads from disk, skips unchanged files (~5 sec)

3. Enable user-provided embeddings:
   - UI uploads documents to `/var/lib/ladylinux/user_uploads`
   - User documents get embedded alongside system files

---

## File Locations (for reference)

- **Seed code**: `/opt/ladylinux/core/rag/seed.py`
- **Tracker code**: `/opt/ladylinux/core/rag/file_tracker.py`
- **Chunker code**: `/opt/ladylinux/core/rag/chunker.py`
- **Tracker state**: `/var/lib/ladylinux/embedded_files.json` (created after first seed)
- **Vector DB (in-memory)**: Memory only, lost on restart
- **Vector DB (local)**: `/var/lib/ladylinux/qdrant/` (persists across restarts)

---

## Full Test Run (10 minutes)

```bash
# Terminal 1: Start app
cd /opt/ladylinux
source venv/bin/activate
QDRANT_MODE=memory uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000

# Wait for: "Seed complete - 75/75 files ingested"
# (takes 30-60 seconds first time)

# Terminal 2: Verify tracker file was created
ls -lh /var/lib/ladylinux/embedded_files.json
# Should show recently created file

# Terminal 3: Check vector count (in logs)
# Watch for "embedding" messages showing 2000+ chunks processed

# Browser: Test the UI
# http://localhost:8000/firewall
# Ask about SSH or UFW settings
# Should get contextual responses referencing actual files
```

---

## Expected Performance

| Scenario | Time | Details |
|----------|------|---------|
| First startup (in-memory) | 30-60 sec | Embeds 75 files, ~2264 chunks |
| Second startup (persistent) | < 5 sec | Reads tracker, skips all unchanged |
| Single query latency | 500-2000 ms | Retrieve + LLM inference |

---

## Rollback (if needed)

If you need to revert:
1. Remove `/var/lib/ladylinux/embedded_files.json`
2. Restart service
3. Seed will start from scratch

---

## Questions?

Check these docs:
- **Implementation details**: `SEED_FIX_IMPLEMENTATION_COMPLETE.md`
- **In-memory fix**: `SEED_FIX_INMEMORY_QDRANT.md`
- **Allowlist fix**: `SEED_FIX_ALLOWLIST_MISMATCH.md`

