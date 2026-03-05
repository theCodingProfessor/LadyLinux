# Virtual Environment (venv) - Quick Guide

## Understanding the Virtual Environment

LadyLinux uses a Python **virtual environment** (venv) located at `/opt/ladylinux/venv/`. This is an isolated Python environment that contains all the dependencies needed to run the application.

---

## Why Use a Virtual Environment?

**Problem without venv:**
- System Python doesn't have the required packages (fastapi, qdrant-client, etc.)
- Installing packages system-wide can cause conflicts
- Different projects need different package versions

**Solution with venv:**
- Each project has its own isolated environment
- Dependencies are cleanly separated
- No conflicts with system packages

---

## How the Service Uses the Venv

The systemd service automatically uses the venv - you don't need to do anything!

**In `/etc/systemd/system/ladylinux-api.service`:**
```ini
ExecStart=/opt/ladylinux/venv/bin/uvicorn api_layer.app:app --host 0.0.0.0 --port 8000
```

Notice it uses `/opt/ladylinux/venv/bin/uvicorn` (from the venv), not just `uvicorn` (from system).

---

## Manual Testing (When You Need to Activate)

### ❌ Wrong Way (Will Fail)
```bash
cd /opt/ladylinux
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

**Error:**
```
ModuleNotFoundError: No module named 'fastapi'
```

**Why it fails:** Uses system Python which doesn't have the dependencies.

---

### ✅ Correct Way #1: Activate the Venv First
```bash
cd /opt/ladylinux
source venv/bin/activate          # Activate the virtual environment
uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000

# When done:
deactivate                         # Exit the virtual environment
```

**What happens:**
- `source venv/bin/activate` changes your shell to use the venv's Python
- Now `uvicorn` and `python` refer to the venv versions
- All dependencies are available
- `deactivate` returns to system Python

---

### ✅ Correct Way #2: Use Venv Directly
```bash
cd /opt/ladylinux
./venv/bin/uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000
```

**What happens:**
- Runs uvicorn from the venv directly
- No need to activate/deactivate
- Good for one-off commands

---

## Common Commands

### Check What's in the Venv
```bash
# List installed packages
/opt/ladylinux/venv/bin/pip list

# Check specific package
/opt/ladylinux/venv/bin/pip show fastapi

# Check Python version
/opt/ladylinux/venv/bin/python --version
```

### Test Imports
```bash
# Test if api_layer can be imported
/opt/ladylinux/venv/bin/python -c "from api_layer import app; print('✓ API OK')"

# Test if rag_layer can be imported
/opt/ladylinux/venv/bin/python -c "from rag_layer import retrieve; print('✓ RAG OK')"

# Test if fastapi is available
/opt/ladylinux/venv/bin/python -c "import fastapi; print('✓ FastAPI OK')"
```

### Install/Update Dependencies
```bash
# Install from requirements.txt
/opt/ladylinux/venv/bin/pip install -r /opt/ladylinux/requirements.txt

# Install a single package
/opt/ladylinux/venv/bin/pip install some-package

# Upgrade a package
/opt/ladylinux/venv/bin/pip install --upgrade fastapi
```

---

## Recognizing When Venv is Activated

### Shell Prompt Changes
```bash
# Before activation:
lady@lady-virtual-machine:/opt/ladylinux$

# After activation:
(venv) lady@lady-virtual-machine:/opt/ladylinux$
```

Notice the `(venv)` prefix - this shows the venv is active.

### Which Python?
```bash
# Before activation:
which python
# Output: /usr/bin/python

# After activation:
which python
# Output: /opt/ladylinux/venv/bin/python
```

---

## When Do You Need to Activate?

### ✅ Need to Activate (Manual Testing)
- Running uvicorn manually for development
- Testing code interactively with Python REPL
- Running custom scripts that use the dependencies

### ❌ Don't Need to Activate (Service)
- Service managed by systemd
- The service file already points to venv
- Installation/refresh scripts handle it

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'fastapi'"

**Cause:** Not using the venv

**Solutions:**
```bash
# Option 1: Activate venv
source /opt/ladylinux/venv/bin/activate

# Option 2: Use venv directly
/opt/ladylinux/venv/bin/uvicorn api_layer.app:app

# Option 3: Use the service instead
sudo systemctl start ladylinux-api
```

---

### Issue: "Command 'uvicorn' not found"

**Cause:** Either not installed or venv not activated

**Solutions:**
```bash
# Check if uvicorn exists in venv
ls /opt/ladylinux/venv/bin/uvicorn

# If exists, use it directly:
/opt/ladylinux/venv/bin/uvicorn api_layer.app:app

# Or activate venv first:
source /opt/ladylinux/venv/bin/activate
uvicorn api_layer.app:app
```

---

### Issue: Venv seems corrupted or missing packages

**Solution: Rebuild the venv**
```bash
# Use the refresh script to rebuild
cd /opt/ladylinux
sudo ../scripts/refresh_vm.sh

# Or force rebuild
ALWAYS_REBUILD_VENV=true sudo ../scripts/refresh_vm.sh

# Or manually rebuild
cd /opt/ladylinux
rm -rf venv
python3.12 -m venv venv
venv/bin/pip install -r requirements.txt
```

---

## Best Practices

### For Regular Users
- Use the systemd service (already configured)
- No need to think about venv
- Just access http://localhost:8000

### For Developers
- Activate venv when testing manually
- Always deactivate when done
- Use refresh script to update dependencies

### For System Administrators
- Never install packages system-wide for LadyLinux
- Always use the venv or requirements.txt
- Let the installation/refresh scripts handle venv management

---

## Quick Reference Card

```bash
# Activate venv
cd /opt/ladylinux && source venv/bin/activate

# Deactivate venv
deactivate

# Run without activating
/opt/ladylinux/venv/bin/uvicorn api_layer.app:app

# Check what's installed
/opt/ladylinux/venv/bin/pip list

# Install dependencies
/opt/ladylinux/venv/bin/pip install -r requirements.txt

# Test imports
/opt/ladylinux/venv/bin/python -c "from api_layer import app"

# Use the service (recommended)
sudo systemctl status ladylinux-api
```

---

## Summary

- ✅ **Systemd service** - Uses venv automatically (no activation needed)
- ✅ **Manual testing** - Must activate venv first: `source venv/bin/activate`
- ✅ **One-off commands** - Use venv directly: `./venv/bin/python`
- ✅ **Dependencies** - Installed in venv, not system-wide
- ✅ **Installation/refresh scripts** - Handle venv management for you

**Bottom line:** For normal use, just use the systemd service. Only activate the venv if you're doing manual testing or development.


