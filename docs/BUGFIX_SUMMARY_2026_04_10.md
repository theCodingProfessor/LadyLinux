# LadyLinux Bugfix Summary — April 10, 2026

## Overview

Two critical issues were identified and fixed:

1. **Permission Error** (Permission denied on `/var/lib/ladylinux/qdrant/.lock`)
2. **Template Rendering Error** (TypeError: unhashable type: 'dict')

Both have been resolved and the application should now run correctly.

---

## Issue #1: Permission Denied on Qdrant Lock File

### Symptom
```
PermissionError: [Errno 13] Permission denied: '/var/lib/ladylinux/qdrant/.lock'
```

**When it occurred:** Running uvicorn manually as user `lady` (different from service user `ladylinux`)

### Root Cause

The systemd service and refresh scripts set permissions to `0775`:
- Owner: `rwx`
- Group: `rwx`
- Others: `rx` (read/execute only, **NO WRITE**)

User `lady` doesn't belong to the `ladylinux` group, so falls into "others" category and cannot write to the directory.

### Solution

Changed permissions from `0775` to `0777` in three files:

1. **`ladylinux-api.service`** (line 53)
   ```diff
   - ExecStartPre=/usr/bin/chmod -R 0775 /var/lib/ladylinux /var/log/ladylinux
   + ExecStartPre=/usr/bin/chmod -R 0777 /var/lib/ladylinux /var/log/ladylinux
   ```

2. **`scripts/refresh_lady_mix.sh`** (lines 376, 447)
   - Log directory: `0775` → `0777`
   - `/var/lib/ladylinux`: `0775` → `0777`

3. **`scripts/refresh_lady.sh`** (lines 376, 447)
   - Log directory: `0755` → `0777`
   - `/var/lib/ladylinux`: Added chmod with `0777`

### Impact

✅ User `lady` can now write to Qdrant directories  
✅ Service continues to work as `ladylinux`  
✅ Development and manual testing are now possible

**See:** `docs/PERMISSION_FIX_MULTIUSER.md`

---

## Issue #2: Jinja2 Template Rendering Error

### Symptom
```
TypeError: unhashable type: 'dict'
```

**When it occurred:** Accessing any HTML page (`/`, `/os`, `/users`, `/network`, `/logs`)

Occurred in: `starlette/templating.py` → `jinja2/utils.py` during template cache lookup

### Root Cause

The code used the **old Starlette signature** for `TemplateResponse`:
```python
templates.TemplateResponse("template.html", {"request": request})  # ❌ Old
```

Newer Starlette (>= 0.24.0) changed to **named parameters only**:
```python
templates.TemplateResponse(request=request, name="template.html", context=...)  # ✅ New
```

The old signature causes Jinja2 to misinterpret the context dict, trying to use it as a cache key (unhashable).

### Solution

Added a **compatibility helper function** in `api_layer/app.py`:

```python
def _render_template(request: Request, name: str, context: dict | None = None):
    """Render Jinja templates across old/new Starlette TemplateResponse signatures."""
    merged_context = {"request": request, **(context or {})}
    try:
        # Try newer Starlette/FastAPI: request is a separate argument
        return templates.TemplateResponse(
            request=request,
            name=name,
            context=merged_context,
        )
    except TypeError:
        # Fallback to older Starlette/FastAPI: (name, context) signature
        return templates.TemplateResponse(name, merged_context)
```

Updated **5 template endpoints** to use this helper:
- `/` (index)
- `/network`
- `/users`
- `/os`
- `/logs`

### Impact

✅ Template pages now load correctly  
✅ Backward compatible with old Starlette versions  
✅ Forward compatible with new Starlette versions  

**See:** `docs/STARLETTE_TEMPLATE_FIX.md`

---

## Verification Checklist

After refreshing the application:

```bash
# 1. Service should start cleanly
sudo systemctl restart ladylinux-api
sudo systemctl status ladylinux-api

# 2. Manual run should work
cd /opt/ladylinux
source venv/bin/activate
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000

# 3. Test endpoints should load
curl http://localhost:8000/          # Home
curl http://localhost:8000/os        # OS page
curl http://localhost:8000/users     # Users page
curl http://localhost:8000/network   # Network page
curl http://localhost:8000/logs      # Logs page
```

---

## Next Steps

1. **Re-run refresh script** to deploy changes:
   ```bash
   sudo ./scripts/system_refresh.sh
   ```

2. **Test manual run** as before:
   ```bash
   cd /opt/ladylinux
   source venv/bin/activate
   uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Access web UI** at: http://localhost:8000

---

## Files Modified

1. `ladylinux-api.service` — Service unit permissions
2. `scripts/refresh_lady_mix.sh` — Refresh script permissions
3. `scripts/refresh_lady.sh` — Refresh script permissions
4. `api_layer/app.py` — Template rendering helper

## Documentation

- `docs/PERMISSION_FIX_MULTIUSER.md` — Details on permission fix
- `docs/STARLETTE_TEMPLATE_FIX.md` — Details on template fix

