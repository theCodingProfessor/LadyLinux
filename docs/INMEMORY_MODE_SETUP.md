# In-Memory Mode Setup (No Reload)

**Configuration**: QDRANT_MODE = "memory"  
**Reload Flag**: NOT used  
**Storage**: RAM only (lost on restart)  
**Best For**: Development without frequent code changes  

---

## ✅ Configuration Verified

**File**: `core/rag/config.py` (Line 19)

```python
QDRANT_MODE = os.getenv("QDRANT_MODE", "memory")  # ← CORRECT
```

✅ This is the ONLY setting needed for in-memory mode.

---

## 🚀 How to Run (In-Memory, No Reload)

### Option 1: Systemd Service

```bash
# Deploy updated config
cp core/rag/config.py /opt/ladylinux/core/rag/

# Start service (systemd handles startup)
systemctl restart ladylinux-api

# Monitor startup
journalctl -u ladylinux-api -f | grep -E "(Initialising|Seed:|Search returned)"
```

**Systemd service file** (`/etc/systemd/system/ladylinux-api.service`):
```ini
[Service]
ExecStart=/opt/ladylinux/venv/bin/uvicorn api_layer.app:app --host 0.0.0.0 --port 8000
# NO --reload flag
Environment="QDRANT_MODE=memory"
```

### Option 2: Manual Command Line

```bash
cd /opt/ladylinux
source venv/bin/activate

# Run WITHOUT --reload
QDRANT_MODE=memory uvicorn api_layer.app:app --host 0.0.0.0 --port 8000
```

**Key**: No `--reload` flag

---

## 📋 Data Lifecycle (In-Memory Mode)

```
SERVICE STARTS
    ↓
Qdrant initialized in RAM
    ↓
Seed runs → 75 files embedded to RAM
    ↓
Service running → Queries search RAM vectors
    ↓
CODE CHANGED → Manual restart needed
    ↓
SERVICE STOPS
    ↓
All 267 vectors LOST (in-memory only)
    ↓
SERVICE RESTARTS
    ↓
Seed runs again → Re-embeds all 75 files
```

---

## 🔄 Manual Restart When Code Changes

**When you modify code** and want changes active:

```bash
# Terminal 1: Currently running the service
# Press Ctrl+C to stop

^C
# Service stops, all vectors lost

# Then restart
QDRANT_MODE=memory uvicorn api_layer.app:app --host 0.0.0.0 --port 8000

# Wait 60 seconds for seed
# Changes are now active
```

---

## ⏱️ Startup Times

**First startup**: 30-60 seconds (embedding 75 files)  
**Subsequent restarts**: 30-60 seconds (always fresh, no persistence)  

---

## 🧪 Quick Test

```bash
# 1. Start service (or check it's running)
systemctl status ladylinux-api

# 2. Wait 60 seconds for seed to complete

# 3. Check logs
tail -f /var/log/ladylinux/ladylinux.log | grep "Search returned"

# 4. Test in browser
http://localhost:8000/firewall

# 5. Ask a question
"What are your firewall settings?"

# Expected: Response with /etc/ufw/ content
# Should see in logs: "Search returned 5 result(s)" or higher
```

---

## ✅ Configuration Checklist

- [x] QDRANT_MODE = "memory" (in config.py)
- [x] No --reload flag in uvicorn command
- [x] systemd service configured WITHOUT --reload
- [x] Manual restart method documented
- [x] Understand data is lost on restart

---

## 📌 Important Notes

1. **No persistence**: All vector data lost when service stops
2. **Fresh seed each startup**: Always takes 30-60 seconds
3. **Manual restart required**: Edit code, stop service, start service
4. **RAM-only storage**: No disk I/O, fast queries
5. **Single instance**: No reload means singleton stays valid

---

## When You Need to Change Code

**Option A: Manual restart (simple)**
```bash
# In systemd:
systemctl restart ladylinux-api
# Wait 60 seconds
# Done

# Or manually:
# Press Ctrl+C in terminal
# Wait for exit
QDRANT_MODE=memory uvicorn api_layer.app:app --host 0.0.0.0 --port 8000
```

**Option B: Use VS Code terminal + reload (if you want reload)**
- Create separate development session
- Run with `--reload` in that session only
- Understand reload = separate in-memory instances
- Test in that environment only

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Search returned 0 result(s)" | Wait 60 sec after startup for seed |
| Service won't start | Check logs: `journalctl -u ladylinux-api -n 50` |
| Port already in use | Change port: `--port 8001` |
| venv not activated | `source venv/bin/activate` before running |
| Want reload back | Switch to QDRANT_MODE=local mode |

---

## Summary

✅ **Your setup is correct for in-memory, no-reload mode**

- QDRANT_MODE = "memory" ✅
- uvicorn without --reload ✅
- Manual restart when code changes ✅
- Vectors lost on restart (by design) ✅

**Ready to deploy!**

