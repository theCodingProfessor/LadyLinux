# Expected Output from Refactored Scripts

This document shows what you should expect to see when running the refactored installation and refresh scripts.

---

## Installation Script Output (Fresh System)

```
═══════════════════════════════════════════════════════════════════════
  Welcome to the LadyLinux Installation Wizard
═══════════════════════════════════════════════════════════════════════

[1/10] Updating package index...
All packages are up to date.
[2/10] Checking for system upgrades...
  → System is up to date. Skipping upgrade.
[3/10] Configuring DNS settings...
  → DNS already configured. Skipping.
[4/10] Checking required system packages...
  → All required packages already installed.
[5/10] Setting up LadyLinux repository...
  → Using branch: Capstone_Dev_01
  → Cloning LadyLinux repository from branch 'Capstone_Dev_01'...
Cloning into '/opt/ladylinux'...
remote: Enumerating objects: 765, done.
remote: Counting objects: 100% (206/206), done.
remote: Compressing objects: 100% (156/156), done.
remote: Total 765 (delta 85), reused 124 (delta 49), pack-reused 559
Receiving objects: 100% (765/765), 7.74 MiB | 2.87 MiB/s, done.
Resolving deltas: 100% (425/425), done.
  → Repository cloned successfully.
[6/10] Checking Ollama installation...
  → Ollama already installed (ollama version is 0.17.5). Skipping installation.
[7/10] Configuring Ollama service...
  → Ollama service is already running.
  → Ollama service already enabled at boot.
[8/10] Checking Mistral LLM model...
  → Mistral model already downloaded. Skipping.
[9/10] Configuring ladylinux service user...
  → User 'ladylinux' already exists.
  → Home directory exists. Verifying permissions...
  → Temporarily setting shell to /bin/bash for setup...
[10/10] Setting up Python environment...
  → uv package manager already installed (uv 0.10.8).
  → Virtual environment already exists.
  → Checking Python dependencies...
  → Fixing permissions on /opt/ladylinux...
  → Creating Python virtual environment with uv...
  → Creating venv if it doesn't exist
  → Installing Python dependencies from requirements.txt...
  → Installing fastapi>=0.110
  → Installing uvicorn>=0.29
  → Installing jinja2>=3.1
  → Installing pydantic>=2.0
  → Installing requests>=2.31
  → Installing qdrant-client>=1.9
  → Installing watchdog>=4.0
  → Python dependencies installed successfully.
  → Python environment setup complete.
  → Restoring shell to /usr/sbin/nologin for security...

[11/11] Setting up systemd service...
  → Copying service file to systemd...
  → Reloading systemd daemon...
  → Enabling service to start at boot...
Created symlink /etc/systemd/system/multi-user.target.wants/ladylinux-api.service → /etc/systemd/system/ladylinux-api.service.
  → Starting LadyLinux API service...
  → Service started successfully! ✓

═══════════════════════════════════════════════════════════════════════
  🎉 LadyLinux Installation Complete!
═══════════════════════════════════════════════════════════════════════

The LadyLinux API service is now running!

📍 Quick Access:
  • Web Interface:  http://localhost:8000
  • API Endpoint:   http://localhost:8000/docs

🔧 Service Management:
  • Check status:   sudo systemctl status ladylinux-api
  • Stop service:   sudo systemctl stop ladylinux-api
  • Start service:  sudo systemctl start ladylinux-api
  • Restart:        sudo systemctl restart ladylinux-api
  • View logs:      journalctl -u ladylinux-api -f

🐍 For Manual Testing (requires activating virtual environment):
  cd /opt/ladylinux
  source venv/bin/activate
  uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000

  To deactivate the virtual environment when done:
  deactivate

📚 Documentation:
  • Quick Reference: docs/SCRIPTS_QUICK_REFERENCE.md
  • Full Guide:      docs/SCRIPTS_INSTALLATION_AND_REFRESH.md
  • Quick Start:     QUICK_START_CHECKLIST.md

═══════════════════════════════════════════════════════════════════════
```

**Key Points in Output:**
- ✓ Shows `Capstone_Dev_01` as the branch being used
- ✓ Skips steps that are already done (DNS, packages, Ollama)
- ✓ Shows dependencies being installed from `requirements.txt`
- ✓ **Automatically sets up and starts systemd service**
- ✓ **Service is running immediately - no manual steps needed**
- ✓ **Shows how to activate venv for manual testing**
- ✓ Provides clear service management commands

---

## Installation Script Output (Re-run on Same System)

```
═══════════════════════════════════════════════════════════════════════
  Welcome to the LadyLinux Installation Wizard
═══════════════════════════════════════════════════════════════════════

[1/10] Updating package index...
All packages are up to date.
[2/10] Checking for system upgrades...
  → System is up to date. Skipping upgrade.
[3/10] Configuring DNS settings...
  → DNS already configured. Skipping.
[4/10] Checking required system packages...
  → All required packages already installed.
[5/10] Setting up LadyLinux repository...
  → Using branch: Capstone_Dev_01
  → Repository already exists at /opt/ladylinux
  → Checking for updates...
  → Switching from branch 'main' to 'Capstone_Dev_01'...
  → Updates available. Pulling latest changes...
  → Repository is up to date on branch 'Capstone_Dev_01'.
[6/10] Checking Ollama installation...
  → Ollama already installed (ollama version is 0.17.5). Skipping installation.
[7/10] Configuring Ollama service...
  → Ollama service is already running.
  → Ollama service already enabled at boot.
[8/10] Checking Mistral LLM model...
  → Mistral model already downloaded. Skipping.
[9/10] Configuring ladylinux service user...
  → User 'ladylinux' already exists.
  → Home directory exists. Verifying permissions...
  → Shell is already /bin/bash. No change needed.
[10/10] Setting up Python environment...
  → uv package manager already installed (uv 0.10.8).
  → Virtual environment already exists.
  → Checking Python dependencies...
  → Installing Python dependencies from requirements.txt...
  → Python dependencies installed successfully.
  → Python environment setup complete.

═══════════════════════════════════════════════════════════════════════
  LadyLinux Installation Complete!
═══════════════════════════════════════════════════════════════════════

[Service is already installed. To update, run:]
sudo systemctl restart ladylinux-api

═══════════════════════════════════════════════════════════════════════
```

**Key Points in Output:**
- ✓ Much faster (mostly skips)
- ✓ Detects branch mismatch (main → Capstone_Dev_01) and switches
- ✓ Shows updates were pulled
- ✓ Idempotent (safe to run multiple times)

---

## Refresh Script Output (No Changes)

```bash
$ sudo ./scripts/refresh_vm.sh
```

```
[refresh] ======================================================================
[refresh] LadyLinux Refresh Script
[refresh] ======================================================================
[refresh] Branch:  Capstone_Dev_01
[refresh] App:     /opt/ladylinux/app
[refresh] Venv:    /opt/ladylinux/venv
[refresh] Service: ladylinux-api.service
[refresh] User:    ladylinux
[refresh] ======================================================================

[refresh] Ensuring correct ownership of application directories...
[refresh] Stopping service: ladylinux-api.service
[refresh] Syncing repo in /opt/ladylinux/app to origin/Capstone_Dev_01 (as ladylinux)
[refresh]   Fetching from remote...
[refresh]   Repo now at commit: a1b2c3d (branch: Capstone_Dev_01)
[refresh] Venv rebuild not needed; dependency fingerprint unchanged.
[refresh] To force rebuild, set: ALWAYS_REBUILD_VENV=true
[refresh] Preparation step: (none configured)
[refresh] Starting service: ladylinux-api.service
[refresh] Summary:
[refresh]   Branch:  Capstone_Dev_01
[refresh]   Commit:  a1b2c3d
[refresh]   App:     /opt/ladylinux/app
[refresh]   Venv:    /opt/ladylinux/venv
[refresh]   Service: ladylinux-api.service

[refresh] Service status:
[refresh] ● ladylinux-api.service - LadyLinux API Service
     Loaded: loaded (/etc/systemd/system/ladylinux-api.service; enabled; vendor preset: enabled)
     Active: active (running) since Tue 2026-03-03 10:15:22 UTC; 2s ago
   Main PID: 12345 (uvicorn)
      Tasks: 4 (limit: 4915)
     Memory: 85.2M
        CPU: 2.341s
     CGroup: /system.slice/ladylinux-api.service
             └─12345 /opt/ladylinux/venv/bin/python -m uvicorn api_layer.app:app

[refresh] ======================================================================
[refresh] Refresh complete. ✓
[refresh] ======================================================================
```

**Key Points in Output:**
- ✓ Fast (no venv rebuild needed)
- ✓ Service stopped and restarted cleanly
- ✓ Shows current commit hash
- ✓ Service running and responsive
- ✓ Total time: ~10 seconds

---

## Refresh Script Output (Dependencies Changed)

```bash
$ echo "new-library>=1.0" >> /opt/ladylinux/requirements.txt
$ sudo ./scripts/refresh_vm.sh
```

```
[refresh] ======================================================================
[refresh] LadyLinux Refresh Script
[refresh] ======================================================================
[refresh] Branch:  Capstone_Dev_01
[refresh] App:     /opt/ladylinux/app
[refresh] Venv:    /opt/ladylinux/venv
[refresh] Service: ladylinux-api.service
[refresh] User:    ladylinux
[refresh] ======================================================================

[refresh] Ensuring correct ownership of application directories...
[refresh] Stopping service: ladylinux-api.service
[refresh] Syncing repo in /opt/ladylinux/app to origin/Capstone_Dev_01 (as ladylinux)
[refresh]   Fetching from remote...
[refresh]   Repo now at commit: a1b2c3d (branch: Capstone_Dev_01)
[refresh] Venv rebuild needed (ALWAYS_REBUILD_VENV=false, or deps changed)
[refresh] Building Python venv at: /opt/ladylinux/venv (as ladylinux)
[refresh]   Removing existing venv...
[refresh]   Creating new virtual environment...
[refresh]   Upgrading pip, wheel, setuptools...
[refresh]   Installing dependencies from requirements.txt...
[refresh]     Dependencies:
[refresh]       fastapi>=0.110
[refresh]       uvicorn>=0.29
[refresh]       jinja2>=3.1
[refresh]       pydantic>=2.0
[refresh]       requests>=2.31
[refresh]       qdrant-client>=1.9
[refresh]       watchdog>=4.0
[refresh]       new-library>=1.0
[refresh]   Dependencies installed successfully.
[refresh] Venv built successfully.
[refresh] Preparation step: (none configured)
[refresh] Starting service: ladylinux-api.service
[refresh] Summary:
[refresh]   Branch:  Capstone_Dev_01
[refresh]   Commit:  a1b2c3d
[refresh]   App:     /opt/ladylinux/app
[refresh]   Venv:    /opt/ladylinux/venv
[refresh]   Service: ladylinux-api.service

[refresh] Service status:
[refresh] ● ladylinux-api.service - LadyLinux API Service
     Loaded: loaded (/etc/systemd/system/ladylinux-api.service; enabled; vendor preset: enabled)
     Active: active (running) since Tue 2026-03-03 10:20:45 UTC; 1s ago
   Main PID: 12456 (uvicorn)
      Tasks: 4 (limit: 4915)
     Memory: 92.1M
        CPU: 3.215s
     CGroup: /system.slice/ladylinux-api.service
             └─12456 /opt/ladylinux/venv/bin/python -m uvicorn api_layer.app:app

[refresh] ======================================================================
[refresh] Refresh complete. ✓
[refresh] ======================================================================
```

**Key Points in Output:**
- ✓ Detects dependency change (new-library added)
- ✓ Removes old venv
- ✓ Creates fresh venv
- ✓ Shows all dependencies being installed
- ✓ Includes new dependency
- ✓ Service restarts successfully
- ✓ Total time: ~1-2 minutes

---

## Refresh Script Output (Branch Switch)

```bash
$ sudo ./scripts/refresh_vm.sh main
```

```
[refresh] ======================================================================
[refresh] LadyLinux Refresh Script
[refresh] ======================================================================
[refresh] Branch:  main
[refresh] App:     /opt/ladylinux/app
[refresh] Venv:    /opt/ladylinux/venv
[refresh] Service: ladylinux-api.service
[refresh] User:    ladylinux
[refresh] ======================================================================

[refresh] Ensuring correct ownership of application directories...
[refresh] Stopping service: ladylinux-api.service
[refresh] Syncing repo in /opt/ladylinux/app to origin/main (as ladylinux)
[refresh]   Fetching from remote...
[refresh]   Switching from branch 'Capstone_Dev_01' to 'main'...
[refresh]   Hard-aligning to origin/main...
[refresh]   Repo now at commit: b2c3d4e (branch: main)
[refresh] Venv rebuild needed (ALWAYS_REBUILD_VENV=false, or deps changed)
[refresh] Building Python venv at: /opt/ladylinux/venv (as ladylinux)
[refresh]   Removing existing venv...
[refresh]   Creating new virtual environment...
[refresh]   Upgrading pip, wheel, setuptools...
[refresh]   Installing dependencies from requirements.txt...
[refresh]     Dependencies:
[refresh]       fastapi>=0.110
[refresh]       uvicorn>=0.29
[refresh]       jinja2>=3.1
[refresh]       pydantic>=2.0
[refresh]       requests>=2.31
[refresh]   Dependencies installed successfully.
[refresh] Venv built successfully.
[refresh] Preparation step: (none configured)
[refresh] Starting service: ladylinux-api.service
[refresh] Summary:
[refresh]   Branch:  main
[refresh]   Commit:  b2c3d4e
[refresh]   App:     /opt/ladylinux/app
[refresh]   Venv:    /opt/ladylinux/venv
[refresh]   Service: ladylinux-api.service

[refresh] Service status:
[refresh] ● ladylinux-api.service - LadyLinux API Service
     Loaded: loaded (/etc/systemd/system/ladylinux-api.service; enabled; vendor preset: enabled)
     Active: active (running) since Tue 2026-03-03 10:25:00 UTC; 1s ago
   Main PID: 12567 (uvicorn)
      Tasks: 4 (limit: 4915)
     Memory: 78.3M
        CPU: 2.891s
     CGroup: /system.slice/ladylinux-api.service
             └─12567 /opt/ladylinux/venv/bin/python -m uvicorn api_layer.app:app

[refresh] ======================================================================
[refresh] Refresh complete. ✓
[refresh] ======================================================================
```

**Key Points in Output:**
- ✓ Switches branch (Capstone_Dev_01 → main)
- ✓ Shows different commit hash for different branch
- ✓ Shows different dependencies (fewer on main)
- ✓ Venv rebuilds for new branch
- ✓ Service running cleanly
- ✓ Total time: ~1-2 minutes

---

## Force Rebuild Output

```bash
$ ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
```

```
[refresh] Venv rebuild needed (ALWAYS_REBUILD_VENV=true, or deps changed)
[refresh] Building Python venv at: /opt/ladylinux/venv (as ladylinux)
[refresh]   Removing existing venv...
[refresh]   Creating new virtual environment...
[refresh]   Upgrading pip, wheel, setuptools...
[refresh]   Installing dependencies from requirements.txt...
[refresh]     Dependencies:
[refresh]       fastapi>=0.110
[refresh]       uvicorn>=0.29
[refresh]       jinja2>=3.1
[refresh]       pydantic>=2.0
[refresh]       requests>=2.31
[refresh]       qdrant-client>=1.9
[refresh]       watchdog>=4.0
[refresh]   Dependencies installed successfully.
[refresh] Venv built successfully.
```

**Key Points:**
- ✓ Rebuilds even if no changes (deterministic)
- ✓ Useful for troubleshooting
- ✓ More time but more reliable

---

## What These Outputs Tell You

### Installation Script
- ✅ Capstone_Dev_01 branch being used (confirms api_layer/rag_layer available)
- ✅ Requirements.txt dependencies shown
- ✅ All checks working correctly
- ✅ Service configuration steps provided

### Refresh Script
- ✅ Current branch shown
- ✅ Commit hash confirms code version
- ✅ Service running and responsive
- ✅ Dependency management working
- ✅ Branch switching working

---

## Troubleshooting Based on Output

### If you see "Permission denied"
- Installation script should now catch this and fix permissions
- Run with `sudo` and ensure ladylinux user exists

### If you see "requirements.txt not found"
- Script is in wrong directory
- Check current working directory
- Verify `/opt/ladylinux/requirements.txt` exists

### If you see service not starting
- Check logs: `journalctl -u ladylinux-api.service -n 20`
- Test import: `/opt/ladylinux/venv/bin/python -c "from api_layer import app"`
- Force rebuild: `ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh`

### If you see "api_layer not found"
- Branch is wrong (should be Capstone_Dev_01)
- Run: `sudo ./scripts/refresh_vm.sh Capstone_Dev_01`
- Verify branch: `cd /opt/ladylinux && git branch -v`

---

## Expected Times

| Operation | Time |
|-----------|------|
| First installation | 10-15 minutes (Mistral download slow) |
| Installation re-run (no changes) | ~3 minutes |
| Refresh (no changes) | ~30 seconds |
| Refresh (dependencies changed) | ~1-2 minutes |
| Refresh (branch switch) | ~1-2 minutes |
| Force rebuild | ~2-3 minutes |

---

## Success Indicators

You know everything is working when you see:
1. ✓ `Capstone_Dev_01` as the branch (install script)
2. ✓ `requirements.txt` dependencies listed
3. ✓ Service shows as `active (running)`
4. ✓ No error lines in output
5. ✓ Final line: "Refresh complete. ✓"


