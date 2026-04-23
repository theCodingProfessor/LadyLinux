# Local Mode Switch - Quick Deploy Card

**Status**: ✅ IMPLEMENTED  
**Change**: Default QDRANT_MODE "memory" → "local"  
**File**: `core/rag/config.py` (line 19)  
**Benefit**: Persistent disk storage, reload-safe, production-ready  

---

## 🚀 Deploy in 5 Commands

```bash
# 1. Stop service
systemctl stop ladylinux-api

# 2. Deploy updated config
cp core/rag/config.py /opt/ladylinux/core/rag/

# 3. Create storage directory
mkdir -p /var/lib/ladylinux/qdrant && chmod 755 /var/lib/ladylinux/qdrant

# 4. Start service
systemctl start ladylinux-api

# 5. Wait for seed, then test
sleep 60 && curl -s http://localhost:8000/firewall | head -20
```

---

## 🧪 Test Immediately

**Browser**: http://localhost:8000/firewall  
**Ask**: "What are your firewall settings?"  
**Expect**: Response with `/etc/ufw/` content  
**Verify**: Logs show `Search returned X result(s)` where X > 0  

---

## ✅ Verify Deployment

```bash
# Check QDRANT_MODE changed
grep QDRANT_MODE /opt/ladylinux/core/rag/config.py
# Should show: QDRANT_MODE = os.getenv("QDRANT_MODE", "local")

# Check directory created
ls /var/lib/ladylinux/qdrant/
# Should show: collections/ directory

# Check logs for success
tail -f /var/log/ladylinux/ladylinux.log | grep -E "(local|Search returned)"
# Should see: "Initialising Qdrant client in **local** mode"
# Should see: "Search returned X result(s)" with X > 0
```

---

## 📊 What Changed

| Aspect | Before | After |
|--------|--------|-------|
| **Storage** | RAM only | Disk persistence |
| **Location** | Memory | `/var/lib/ladylinux/qdrant/` |
| **Reload Safe** | ❌ Breaks | ✅ Works |
| **Data on Restart** | Lost | Preserved |
| **Startup Time** | 30-60 sec | 30-60 sec (1st), <5 sec (cached) |

---

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| Directory not found | `mkdir -p /var/lib/ladylinux/qdrant` |
| Permission denied | `chmod 755 /var/lib/ladylinux/qdrant` |
| Still 0 results | Restart service + wait 60 sec for seed |
| Need in-memory | `QDRANT_MODE=memory systemctl start ladylinux-api` |

---

## 📖 Full Guide

See: `/opt/ladylinux/docs/LOCAL_MODE_SWITCH_GUIDE.md`

---

**Ready to deploy**: Copy `core/rag/config.py` to `/opt/ladylinux/` and follow 5 commands above.

