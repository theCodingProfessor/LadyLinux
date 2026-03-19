# LadyLinux Backend Archive

This folder contains the minimal backend required for UI functionality.

## Required Endpoints

- /api/prompt
- /api/system/metrics
- /api/system/services
- /api/system/service/{name}/restart
- /api/theme/themes
- /api/theme/theme/{name}/apply

## Notes

- These files are copied directly from the original backend
- They are NOT standalone — dependencies must be wired when reused
- Intended for quick extraction into another FastAPI project

## Integration Steps

1. Copy routes into your FastAPI router
2. Register routes in your main app
3. Ensure services and utils are importable
4. Install required dependencies (psutil, subprocess access, etc.)
