# Testing & Verification Guide

## Quick Start After Fixes

Follow these steps to verify both fixes are working:

### Step 1: Deploy Changes
```bash
cd /opt/ladylinux/scripts
sudo chmod +x refresh_lady_mix.sh
sudo ./refresh_lady_mix.sh
```

This will:
- ✅ Set permissions to `0777` (fixes permission issue)
- ✅ Pull latest code with template fix
- ✅ Restart the service

### Step 2: Check Service Status
```bash
sudo systemctl status ladylinux-api
```

**Expected output:** `Active: active (running)` with no errors

### Step 3: Test Manual Run
```bash
cd /opt/ladylinux
source venv/bin/activate
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started server process [XXXX]
INFO:     Waiting for application startup.
2026-04-10 XX:XX:XX,XXX  INFO      Initialising Qdrant client in **local** mode (path=/var/lib/ladylinux/qdrant)
INFO:     Application startup complete.
```

**Key signs of success:**
- ✅ No `PermissionError` on `/var/lib/ladylinux/qdrant/.lock`
- ✅ No `TypeError: unhashable type: 'dict'`
- ✅ Qdrant initializes successfully
- ✅ Application ready for requests

### Step 4: Test Web Pages
In a separate terminal, test the template rendering:

```bash
# Test home page
curl http://localhost:8000/

# Test OS page (this was failing with TypeError)
curl http://localhost:8000/os

# Test other pages
curl http://localhost:8000/users
curl http://localhost:8000/network
curl http://localhost:8000/logs
```

**Expected:** HTTP 200 responses with HTML content (no errors)

### Step 5: Browser Testing
Open http://localhost:8000 in a browser and verify:
- ✅ Home page loads
- ✅ Navigation links work
- ✅ System pages render (System, Users, Network, Logs)
- ✅ No console errors

---

## Troubleshooting

### If Permission Error Still Occurs:
```bash
# Verify permissions were set
ls -ld /var/lib/ladylinux
ls -ld /var/log/ladylinux

# Should show: drwxrwxrwx (or d777...) for both

# If not, manually fix:
sudo chmod -R 0777 /var/lib/ladylinux /var/log/ladylinux
```

### If Template Error Still Occurs:
```bash
# Verify the fix was applied
grep -A 15 "def _render_template" /opt/ladylinux/api_layer/app.py

# Should show the helper function with try/except
```

### If Still Issues:
```bash
# Check logs
sudo journalctl -u ladylinux-api -f  # Service logs
python -u -m api_layer.app  # Direct run with unbuffered output
```

---

## What Changed

| Issue | File | Change |
|-------|------|--------|
| Permission | `ladylinux-api.service` | `0775` → `0777` (line 53) |
| Permission | `scripts/refresh_lady_mix.sh` | `0775` → `0777` (lines 376, 447) |
| Permission | `scripts/refresh_lady.sh` | `0755` → `0777`, added chmod (lines 376, 447) |
| Template | `api_layer/app.py` | Added `_render_template()` helper + updated 5 endpoints |

---

## Expected Behavior After Fixes

✅ **Permission Fix:**
- User `lady` can write to `/var/lib/ladylinux/qdrant/`
- Qdrant lock file created successfully
- No permission denied errors

✅ **Template Fix:**
- All HTML pages render without errors
- Jinja2 cache works correctly
- Template endpoints respond with HTTP 200

---

## Revert Instructions (If Needed)

Not recommended, but if you need to revert:

```bash
# Revert permissions to 0775
sudo chmod -R 0775 /var/lib/ladylinux /var/log/ladylinux

# Revert code changes
git -C /opt/ladylinux checkout api_layer/app.py
git -C /opt/ladylinux checkout ladylinux-api.service
git -C /opt/ladylinux checkout scripts/refresh_lady_mix.sh
git -C /opt/ladylinux checkout scripts/refresh_lady.sh
```

---

## Questions?

Check the detailed documentation:
- `docs/PERMISSION_FIX_MULTIUSER.md` - Permission details
- `docs/STARLETTE_TEMPLATE_FIX.md` - Template fix details
- `docs/BUGFIX_SUMMARY_2026_04_10.md` - Complete summary

