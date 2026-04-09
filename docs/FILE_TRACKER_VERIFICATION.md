# Quick Verification Guide — File Tracker Fix

**Test the fix immediately after deployment**

---

## Step 1: Verify Directory Setup

```bash
# Check tracker directory exists
ls -la /var/lib/ladylinux/

# Expected:
# drwxr-xr-x ... ladylinux ladylinux ... /var/lib/ladylinux/
```

---

## Step 2: Restart Service

```bash
# Update systemd if needed
sudo systemctl daemon-reload

# Restart the service
sudo systemctl restart ladylinux-api.service

# Wait for startup
sleep 3
```

---

## Step 3: Check Service Status

```bash
# Should be running
sudo systemctl status ladylinux-api.service

# Expected: Active (running)
```

---

## Step 4: Watch Logs During Seed

```bash
# Watch logs in real-time (new terminal window)
journalctl -u ladylinux-api.service -f

# Should see:
# - Background seed starting
# - Embedding progress
# - NO "Failed to save tracker" warnings
# - Completion message
```

---

## Step 5: Make a Firewall Query

```bash
# While logs are running, make a request
curl -X POST http://localhost:8000/ask_rag \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are my firewall settings",
    "domain": "firewall"
  }'

# Should return LLM response with grounded evidence
```

---

## Step 6: Verify Tracker File

```bash
# Check if tracker was created
ls -la /var/lib/ladylinux/embedded_files.json

# Should exist and be readable
```

---

## What to Look For

### ✅ Success Indicators

- No "Failed to save tracker" warnings in logs
- `embedded_files.json` created in `/var/lib/ladylinux/`
- File has proper ownership (`ladylinux:ladylinux`)
- Firewall query returns grounded answer

### ❌ Failure Indicators

- Still seeing "Permission denied" warnings
- Tracker file not created
- Service fails to start
- Logs show permission errors

---

## Troubleshooting

**If still seeing permission errors:**

```bash
# Check permissions
ls -ld /var/lib/ladylinux/

# Fix if needed
sudo chown ladylinux:ladylinux /var/lib/ladylinux
sudo chmod 0755 /var/lib/ladylinux

# Restart
sudo systemctl restart ladylinux-api.service
```

**If tracker file not created:**

```bash
# Check logs for embedding errors
journalctl -u ladylinux-api.service -n 50 | grep -i embed

# Service should show seed in progress
journalctl -u ladylinux-api.service | grep -i "background seed"
```

**If service won't start:**

```bash
# Check full logs
journalctl -u ladylinux-api.service -n 100

# Check systemd errors
systemctl status ladylinux-api.service --no-pager
```

---

## Expected Log Output (Good)

```
INFO      Background seed done — 176 file(s), 394 chunk(s), 0 error(s)
INFO      Embedded 10 chunk(s) via nomic-embed-text
INFO      Upserted 10 point(s) into 'ladylinux'
INFO      ✓ /var/log/apt/history.log → 10 chunk(s)
```

Note: **NO "Failed to save tracker" warnings** ✅

---

## Expected Log Output (Bad)

```
WARNING   Failed to save tracker: [Errno 13] Permission denied: '/home/ladylinux'
```

If you see this, check permissions and restart service.

---

## Timeline

- **Embedding starts**: Check logs for progress
- **5-10 seconds**: Embedding completes
- **Next request**: Tracker prevents re-embedding same files
- **2nd run**: Much faster seed (uses existing tracker)

---

## Done!

Once you see the successful indicators, the fix is complete and working correctly.

Next run `start_lady.sh` or `refresh_lady.sh` should show:
```
[11/11] Ensuring logging infrastructure...
  → Ensuring RAG tracker directory: /var/lib/ladylinux
  → Setting tracker directory permissions...
  → Tracker directory ready: /var/lib/ladylinux
```

