# Implementation Checklist: Passwordless Sudoers (Option A)

## ✅ Completed Changes

### Code Changes
- [x] **`ladylinux-firewall.sudoers`** (NEW)
  - Passwordless sudoers rule for ufw, iptables, nftables
  - Validated syntax, secure permissions

- [x] **`api_layer/firewall_core.py`**
  - Updated `_run_command()` to prepend `sudo` to all firewall commands
  - Enhanced docstring explaining privilege escalation mechanism

- [x] **`api_layer/app.py`**
  - Configured Python logging to `/var/log/ladylinux/ladylinux.log`
  - Set up `RotatingFileHandler` (10 MB per file, 5 backups)
  - Added startup log message confirming logging is enabled
  - Fixed PEP 8 style issues (blank lines, spacing)

- [x] **`scripts/install_ladylinux.sh`**
  - Added `LOG_DIR="/var/log/ladylinux"` and `SUDOERS_FILE` variables
  - Created `setup_firewall_sudoers()` function with validation
  - Creates `/var/log/ladylinux` directory with proper permissions
  - Sets ownership to `ladylinux:ladylinux` for log writing
  - Integrated sudoers setup into main installation flow
  - Updated `print_summary()` to show security setup status

- [x] **`ladylinux-api.service`**
  - Added `ExecStartPre` commands to create log directory on service start
  - Added `/var/log/ladylinux` to `ReadWritePaths` (systemd hardening)
  - Ensures log directory permissions are correct every startup

### Documentation
- [x] **`docs/SUDOERS_IMPLEMENTATION.md`** (NEW)
  - Complete implementation guide
  - Architecture overview
  - Installation & activation steps
  - Logging & debugging guide
  - Security considerations
  - Troubleshooting section
  - Rollback procedures

---

## 🚀 Next Steps: Deploy & Test

### 1. Clone & Install (One-time)
```bash
cd /opt/ladylinux/app
sudo ./scripts/install_ladylinux.sh --clone --branch main
```

Expected output includes:
```
[install] Firewall sudoers rule installed and validated: /etc/sudoers.d/ladylinux-firewall
[install] Summary:
  ...
  Security:    /etc/sudoers.d/ladylinux-firewall (firewall sudoers)
```

### 2. Verify Sudoers
```bash
sudo cat /etc/sudoers.d/ladylinux-firewall
# Should show firewall binaries with NOPASSWD
```

### 3. Start Service
```bash
sudo systemctl start ladylinux-api.service
sudo systemctl status ladylinux-api.service
```

### 4. Check Logs
```bash
# Watch Python application logs
tail -f /var/log/ladylinux/ladylinux.log

# Watch systemd journal
journalctl -u ladylinux-api.service -f
```

### 5. Test Firewall Query
```bash
# Via browser: http://localhost:8000/firewall
# Ask: "What are the settings for my firewall?"

# Via curl:
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the settings for my firewall?",
    "domain": "firewall",
    "top_k": 6
  }'
```

Expected response includes:
```json
{
  "output": "Lady Linux: The firewall is currently...",
  "vectorization": {
    "vectorized": true,
    "chunks_stored": 4,
    "errors": []
  },
  "retrieval": {
    "result_count": 4
  },
  "firewall_json": { ... }
}
```

### 6. Verify Logs Show Sudoers Success
Look in `/var/log/ladylinux/ladylinux.log` for:
```
[INFO] api_layer.firewall_core: Firewall vectorization: embedding took 0.45s, got 4 vectors
[INFO] api_layer.firewall_core: Firewall vectorization: upsert took 0.12s, stored 4 chunks
[INFO] api_layer.app: Firewall RAG retrieval: domain=firewall, result_count=4
```

---

## 🔍 Troubleshooting Reference

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Sudoers not found | `sudo cat /etc/sudoers.d/ladylinux-firewall` fails | Re-run installer with `--clone` flag |
| Log directory missing | `ls -la /var/log/ladylinux/` fails | Systemd `ExecStartPre` will create on next service start |
| Logs not writing | No `/var/log/ladylinux/ladylinux.log` file | Check `_LOG_FILE` is writable by `ladylinux` user |
| Firewall query fails | Response says "permission denied" | Check sudoers syntax: `sudo visudo -c -f /etc/sudoers.d/ladylinux-firewall` |
| No vectorized evidence | LLM response says "no evidence found" | Check embedding/upsert logs for timing, errors |

---

## 📋 Files Reference

### New Files
- `ladylinux-firewall.sudoers` — Sudoers rule (copied to `/etc/sudoers.d/` during install)
- `docs/SUDOERS_IMPLEMENTATION.md` — Full implementation guide

### Modified Files
- `api_layer/firewall_core.py` — Sudo prepend + logging
- `api_layer/app.py` — Python logging setup
- `scripts/install_ladylinux.sh` — Installation logic
- `ladylinux-api.service` — Systemd integration

---

## 📌 Key Takeaways

✅ **What This Enables**:
- Non-root service user (`ladylinux`) can read firewall state
- No password prompts in automated workflows
- All commands logged to syslog for audit trail

✅ **What This Secures**:
- Narrowly scoped to firewall binaries only
- Passwordless sudo is **safe** for read-only commands
- No shell access for `ladylinux` user (`/usr/sbin/nologin`)

✅ **What Changed in User Experience**:
- Firewall assistant now returns **vectorized evidence** from Qdrant
- LLM answers are **grounded in actual firewall state**
- Logs show **embedding + retrieval timing** for debugging
- Users see **source attributions** (which config files informed the answer)

---

## 📞 Support

For issues or questions, refer to:
1. `docs/SUDOERS_IMPLEMENTATION.md` (full guide)
2. Log messages in `/var/log/ladylinux/ladylinux.log`
3. Systemd journal: `journalctl -u ladylinux-api.service -n 50`


