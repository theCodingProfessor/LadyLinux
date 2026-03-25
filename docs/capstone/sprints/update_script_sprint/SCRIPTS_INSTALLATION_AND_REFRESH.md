# LadyLinux Installation and Refresh Scripts

## Overview

LadyLinux uses two complementary bash scripts to manage deployment and updates:

1. **`current_ladylinuxinstall.sh`** - Initial system setup and installation
2. **`refresh_vm.sh`** - Rolling updates and dependency management

Both scripts are now **idempotent** (safe to run multiple times) and include comprehensive checks before making changes.

---

## Script 1: `current_ladylinuxinstall.sh`

### Purpose
Complete system preparation for running LadyLinux, including:
- System package updates
- DNS configuration
- Required tools installation
- Repository cloning
- Ollama/Mistral setup
- Python environment initialization
- User and permission setup

### Usage
```bash
sudo ./scripts/current_ladylinuxinstall.sh
```

### Branch Configuration
By default, installs from the **`Capstone_Dev_01`** branch:
```bash
BRANCH="${LADYLINUX_BRANCH:-Capstone_Dev_01}"
```

To use a different branch:
```bash
LADYLINUX_BRANCH=main sudo ./scripts/current_ladylinuxinstall.sh
```

### Step-by-Step Process

| Step | Action | Check Before | Notes |
|------|--------|--------------|-------|
| 1/10 | Update package index | N/A | Always safe, gets latest metadata |
| 2/10 | Check for upgrades | `apt list --upgradable` | Only upgrades if updates available |
| 3/10 | Configure DNS | `grep DNS=1.1.1.1` | Skips if already set, backs up original |
| 4/10 | Install system packages | `dpkg -l` check for each | Only installs missing packages |
| 5/10 | Clone/update repository | Check `/opt/ladylinux` exists | Handles branch switching and updates |
| 6/10 | Install Ollama | `command -v ollama` | Shows version if already installed |
| 7/10 | Configure Ollama service | `systemctl is-active ollama` | Skips if already running/enabled |
| 8/10 | Pull Mistral model | `ollama list \| grep mistral` | Huge download (~4GB), skips if present |
| 9/10 | Setup ladylinux user | `id ladylinux` check | Creates user if needed, fixes permissions |
| 10/10 | Python environment | Check venv exists | Uses `requirements.txt` from repo |

### Key Features

**Idempotent Operations**
- Package checks prevent reinstalls
- DNS configuration only on first run
- Ollama/Mistral skip if present
- Repository smart update logic

**Permission Handling**
- Ensures `/opt/ladylinux` owned by `ladylinux:ladylinux`
- Temporarily grants shell access for setup
- Restores `/usr/sbin/nologin` after (security)

**Dependency Management**
```bash
# Requirements are installed from:
uv pip install -r /opt/ladylinux/requirements.txt
```

Contents of `requirements.txt`:
```
fastapi>=0.110
uvicorn>=0.29
jinja2>=3.1
pydantic>=2.0
requests>=2.31
qdrant-client>=1.9
watchdog>=4.0
```

---

## Script 2: `refresh_vm.sh`

### Purpose
Quick updates for running systems, including:
- Repository synchronization
- Branch switching/updates
- Dependency changes detection
- Virtual environment rebuilding (if needed)
- Service restart with minimal downtime

### Usage
```bash
# Refresh from current tracked branch (default: Capstone_Dev_01)
sudo ./scripts/refresh_vm.sh

# Refresh from specific branch
sudo ./scripts/refresh_vm.sh Capstone_Dev_01
sudo ./scripts/refresh_vm.sh main
```

### Configuration
```bash
# Default branch (can be overridden)
BRANCH="${1:-Capstone_Dev_01}"

# Force venv rebuild every run (slower, more deterministic)
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh

# Default: only rebuild if requirements.txt changed
sudo ./scripts/refresh_vm.sh
```

### Step-by-Step Process

1. **Pre-flight Checks**
   - Verify root permissions
   - Check required commands (git, python, systemctl, sha256sum)
   - Verify `/opt/ladylinux` is a valid git repo

2. **Stop Service**
   - Gracefully stops `ladylinux-api.service`
   - Skips if service not loaded

3. **Synchronize Repository**
   ```bash
   git fetch origin
   # Switch branch if needed
   git checkout -f <BRANCH>
   # Hard reset to remote (removes local drift)
   git reset --hard origin/<BRANCH>
   git clean -fd
   ```

4. **Check Venv Rebuild Need**
   - Calculates SHA256 hash of `requirements.txt`
   - Compares to stored fingerprint
   - Only rebuilds if:
     - Venv doesn't exist, OR
     - `ALWAYS_REBUILD_VENV=true`, OR
     - `requirements.txt` has changed

5. **Build Virtual Environment (if needed)**
   - Removes old venv
   - Creates fresh venv
   - Upgrades pip/wheel/setuptools
   - Installs from `requirements.txt`:
     ```bash
     pip install -r /opt/ladylinux/requirements.txt
     ```
   - Saves new fingerprint

6. **Preparation**
   - Placeholder for migrations, validations (future use)

7. **Start Service**
   - Restarts `ladylinux-api.service`
   - Service automatically pulls latest config

### Service Interaction

The refresh script manages the systemd service:

```bash
# Stop before changes
systemctl stop ladylinux-api.service

# Changes happen here (repo sync, venv build)

# Start after changes
systemctl start ladylinux-api.service

# Show status
systemctl status ladylinux-api.service
```

The service unit file should specify:
```ini
[Service]
ExecStart=/opt/ladylinux/venv/bin/uvicorn api_layer.app:app \
    --host 0.0.0.0 \
    --port 8000
```

---

## Dependencies and Requirements File

### Location
```
/opt/ladylinux/requirements.txt
```

### Usage in Scripts

**Installation script:**
```bash
# Step 10/10 installs from this file
sudo -u ladylinux bash -c "
    uv pip install --python venv/bin/python -r requirements.txt
"
```

**Refresh script:**
```bash
# Fingerprints requirements.txt for change detection
fingerprint_deps() {
  pushd "$APP_DIR" >/dev/null
  sha256sum requirements.txt | awk '{print $1}'
  popd >/dev/null
}

# Installs via pip with proper error handling
run_as_service "$PIP_BIN" install -r requirements.txt
```

### Module Structure

The requirements enable proper imports in API layer:

```python
# api_layer/app.py can now import:
from api_layer.firewall_core import get_firewall_status_json
from rag_layer import retrieve, build_context_block, ensure_collection
```

Required modules:
- **fastapi** - Web framework
- **uvicorn** - ASGI server
- **jinja2** - Template rendering
- **pydantic** - Data validation
- **requests** - HTTP client
- **qdrant-client** - Vector database (RAG layer)
- **watchdog** - File system monitoring

---

## Branch Management

### Why `Capstone_Dev_01`?

The repository has multiple branches serving different purposes:

| Branch | Purpose | Contents |
|--------|---------|----------|
| `Capstone_Dev_01` | **ACTIVE DEVELOPMENT** | Includes `/api_layer/`, `/rag_layer/`, latest features |
| `main` | Production-ready | Stable release (may lag dev) |
| Feature branches | Experimental | Work-in-progress features |

### Installation Behavior

**Installation script:**
- Clones with `--branch Capstone_Dev_01` flag
- Ensures fresh checkout from dev branch

**Refresh script:**
- Default: `Capstone_Dev_01`
- Can switch branches: `./refresh_vm.sh main`
- Hard-aligns to remote to prevent local drift

### Branch Switching Example

To switch an existing installation from `main` to `Capstone_Dev_01`:

```bash
sudo ./scripts/refresh_vm.sh Capstone_Dev_01
```

The script will:
1. Fetch latest refs
2. Detect current branch is `main`
3. Switch to `Capstone_Dev_01`
4. Pull latest commits
5. Rebuild venv if dependencies changed
6. Restart service

---

## Common Issues and Solutions

### Issue: "Permission denied" on venv creation

**Cause:** Wrong ownership on `/opt/ladylinux`

**Solution (in install script):**
```bash
sudo chown -R ladylinux:ladylinux /opt/ladylinux
```

**Solution (manual):**
```bash
sudo chown -R ladylinux:ladylinux /opt/ladylinux
sudo ./scripts/refresh_vm.sh
```

---

### Issue: Missing modules (`api_layer`, `rag_layer`)

**Cause:** Wrong branch checked out

**Solution:**
```bash
# Check current branch
cd /opt/ladylinux && git branch -v

# Switch to correct branch
sudo ./scripts/refresh_vm.sh Capstone_Dev_01
```

---

### Issue: Ollama/Mistral not available

**Cause:** Service not running or model not pulled

**Solution:**
```bash
# Check Ollama status
systemctl status ollama

# Start if stopped
sudo systemctl start ollama

# Check models
ollama list

# Pull Mistral manually
ollama pull mistral
```

---

### Issue: Service fails to start after refresh

**Cause:** Python dependencies missing or venv corrupted

**Solution:**
```bash
# Force venv rebuild
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh

# Or manually check
cd /opt/ladylinux
./venv/bin/python -c "from api_layer import app; print('OK')"
```

---

## Troubleshooting Commands

```bash
# Show installation progress
tail -f /var/log/apt/apt.log

# Check refresh script execution
sudo ./scripts/refresh_vm.sh 2>&1 | tee refresh.log

# Check service logs
journalctl -u ladylinux-api.service -f

# List Python packages in venv
/opt/ladylinux/venv/bin/pip list

# Test API import
sudo -u ladylinux /opt/ladylinux/venv/bin/python -c "from api_layer.app import app; print('API OK')"

# Check git status
cd /opt/ladylinux && sudo -u ladylinux git status
```

---

## Security Considerations

1. **Service User Separation**
   - Runs as dedicated `ladylinux` user (not root)
   - Temporary shell access during setup only
   - Reverted to `/usr/sbin/nologin` after installation

2. **Minimal Sudo Usage**
   - Only system operations need sudo
   - Python operations run as service user

3. **Systemd Sandboxing**
   - Service has restricted filesystem access
   - Read-only root filesystem where applicable
   - Temporary directories isolated

4. **File Permissions**
   - App directory owned by service user
   - Log directory writable only by service user
   - Cache/data directories properly isolated

---

## Future Enhancements

1. **Dry-run Mode**
   - `--dry-run` flag to show what would execute
   - No actual changes made

2. **Rollback Capability**
   - Save git commit before refresh
   - Ability to roll back to previous commit

3. **Advanced Logging**
   - Log all operations to `/var/log/ladylinux/install.log`
   - Structured JSON logging for monitoring

4. **Health Checks**
   - Verify service started successfully
   - Check API endpoints responding
   - Validate database connections

5. **Multi-Python Support**
   - Handle Python 3.11, 3.12, 3.13
   - Version detection and selection

6. **Containerization**
   - Docker image building
   - Container registry integration

---

## Support and Debugging

For issues with these scripts:

1. **Check logs**
   ```bash
   journalctl -u ladylinux-api.service -n 50
   tail -20 refresh.log
   ```

2. **Verify environment**
   ```bash
   echo $BRANCH
   git -C /opt/ladylinux branch -v
   /opt/ladylinux/venv/bin/python --version
   ```

3. **Test imports**
   ```bash
   /opt/ladylinux/venv/bin/python -c "import qdrant_client; print('OK')"
   /opt/ladylinux/venv/bin/python -c "from api_layer import app; print('OK')"
   ```

4. **Report issues with**
   - OS version (`lsb_release -a`)
   - Python version (`python3 --version`)
   - Current branch (`cd /opt/ladylinux && git branch -v`)
   - Last 20 lines of error output


