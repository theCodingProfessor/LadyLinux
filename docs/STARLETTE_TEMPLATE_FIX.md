# Starlette TemplateResponse Signature Fix

## Problem

After the permission fix, a new error emerged when accessing HTML template pages (`/`, `/os`, `/network`, etc.):

```
TypeError: unhashable type: 'dict'
```

This occurred in Jinja2's template cache system when trying to render templates.

## Root Cause

The code was using the **old Starlette/FastAPI template signature**:
```python
templates.TemplateResponse("template.html", {"request": request})  # ❌ Old signature
```

However, **newer versions of Starlette (>= 0.24.0)** changed to require **named parameters**:
```python
templates.TemplateResponse(request=request, name="template.html", context={...})  # ✅ New signature
```

The old positional-only approach causes Jinja2's internal cache to misinterpret the context dict, leading to the "unhashable type" error.

## Solution

Added a compatibility helper function `_render_template()` that tries both signatures:

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

Then updated all template endpoints to use this helper:

**Before:**
```python
@app.get("/os")
def os_page(request: Request):
    return templates.TemplateResponse("os.html", {"request": request})
```

**After:**
```python
@app.get("/os")
def os_page(request: Request):
    return _render_template(request, "os.html")
```

## Changes Made

**File: `api_layer/app.py`**
1. Added `_render_template()` helper function (lines 83-99)
2. Updated 5 template endpoints to use the helper:
   - `/` (index)
   - `/network`
   - `/users`
   - `/os`
   - `/logs`

## Testing

After these changes, template pages should load without the `TypeError`:

```bash
cd /opt/ladylinux
source venv/bin/activate
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000

# Test endpoints:
# GET http://localhost:8000/
# GET http://localhost:8000/os
# GET http://localhost:8000/users
# GET http://localhost:8000/network
# GET http://localhost:8000/logs
```

## Compatibility

This fix maintains **backward compatibility** with both:
- ✅ Older Starlette/FastAPI versions (positional signature)
- ✅ Newer Starlette/FastAPI versions (named parameters)

The `try/except TypeError` pattern gracefully falls back if the new signature isn't supported.

## Related

- This fix follows the same pattern already used in `api_layer/v3/app.py` lines 101-119
- Starlette release notes: https://github.com/encode/starlette/releases/tag/0.24.0

