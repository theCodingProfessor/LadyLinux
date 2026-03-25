# Script Path Updates: chat.js References Fixed ✓

## Summary
Updated all template files to reference `/static/js/chat.js` instead of relative paths.

## Files Updated

### Changed From Relative to Absolute Paths:
| File | Line | Old | New |
|------|------|-----|-----|
| `templates/index.html` | 58 | `src="js/chat.js"` | `src="/static/js/chat.js"` |
| `templates/firewall.html` | 66 | `src="js/chat.js"` | `src="/static/js/chat.js"` |
| `templates/os.html` | 51 | `src="js/chat.js"` | `src="/static/js/chat.js"` |
| `templates/system.html` | 100 | `src="js/chat.js"` | `src="/static/js/chat.js"` |
| `templates/users.html` | 93 | `src="js/chat.js"` | `src="/static/js/chat.js"` |

## Already Correct (Old Versions)
- ✅ `templates/index_old.html`
- ✅ `templates/firewall_old.html`
- ✅ `templates/os_old.html`
- ✅ `templates/users_old.html`

These already had the correct `/static/js/chat.js` path and were not changed.

## Why This Matters
- FastAPI mounts static files at `/static/` via `app.mount("/static", StaticFiles(directory="static"), name="static")`
- The JavaScript file is located at `static/js/chat.js`
- Browser requests must use the mounted path: `/static/js/chat.js`
- Relative paths like `js/chat.js` would look for the file relative to the current page URL, which won't work with FastAPI routing

## Verification
All 5 active template files now correctly reference:

```html

<script src="/static/js/chat.js"></script>
```

This ensures the chat functionality will work across all pages.

## Status ✓
- [x] Updated `templates/index.html`
- [x] Updated `templates/firewall.html`
- [x] Updated `templates/os.html`
- [x] Updated `templates/system.html`
- [x] Updated `templates/users.html`
- [x] Verified all paths are absolute `/static/js/chat.js`

