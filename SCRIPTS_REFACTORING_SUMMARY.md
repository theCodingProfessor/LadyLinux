# Scripts Refactoring Summary

## Overview

Both `current_ladylinuxinstall.sh` and `refresh_vm.sh` have been refactored to:
1. Use **`Capstone_Dev_01` as the default branch** (includes api_layer and rag_layer)
2. Add **comprehensive idempotent checks** before all operations
3. Ensure **proper requirements.txt handling** throughout
4. Fix **permission issues** on directory creation
5. Add **branch validation** and switching logic

---

## Key Changes

### 1. Branch Management

#### Before
- Installation script didn't explicitly specify branch
- Could clone `main` instead of `Capstone_Dev_01`
- No branch switching in refresh script

#### After
```bash
# Installation script
BRANCH="${LADYLINUX_BRANCH:-Capstone_Dev_01}"
sudo git clone --branch "$BRANCH" https://github.com/theCodingProfessor/LadyLinux.git

# Refresh script
BRANCH="${1:-Capstone_Dev_01}"
# Validates and switches branches automatically
```

**Result:** 
✓ Ensures `/api_layer/` and `/rag_layer/` are always available
✓ Can override with environment variable or CLI argument
✓ Smart branch switching in refresh script

---

### 2. Repository Synchronization

#### Before (Installation)
```bash
# Simple clone, no update logic
sudo git clone https://github.com/theCodingProfessor/LadyLinux.git /opt/ladylinux
```

#### After (Installation)
```bash
if [ -d "/opt/ladylinux" ]; then
    # Smart update logic
    cd /opt/ladylinux
    sudo git fetch origin
    CURRENT_BRANCH=$(sudo git rev-parse --abbrev-ref HEAD)
    
    # Switch branch if needed
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        sudo git checkout -f "$BRANCH"
    fi
    
    # Pull updates if available
    if [ "$LOCAL" != "$REMOTE" ]; then
        sudo git reset --hard "origin/$BRANCH"
        sudo git clean -fd
    fi
else
    # Fresh clone with correct branch
    sudo git clone --branch "$BRANCH" ...
fi
```

**Result:**
✓ Installation script can run on existing systems
✓ Automatically detects and fixes branch mismatches
✓ Refresh script already had good logic, improved validation

---

### 3. Permission Fixes

#### Before (Installation)
```bash
# Created venv without ensuring directory ownership
sudo -u ladylinux bash -c "
    cd /opt/ladylinux
    uv venv venv  # Would fail if permissions wrong
"
```

#### After (Installation)
```bash
# Fix permissions BEFORE creating venv
echo "  → Fixing permissions on /opt/ladylinux..."
sudo chown -R ladylinux:ladylinux /opt/ladylinux

# Then create venv safely
sudo -u ladylinux bash -c "
    cd /opt/ladylinux
    if [ ! -d venv ]; then
        echo '  → Creating Python virtual environment with uv...'
        uv venv venv
    fi
"
```

**Result:**
✓ Fixes "Permission denied" errors on venv creation
✓ Ensures correct ownership baseline before operations
✓ Proper error detection and reporting

---

### 4. Requirements.txt Handling

#### Before (Installation)
```bash
# Manual package list
uv pip install --python venv/bin/python \
    fastapi \
    requests \
    pydantic \
    jinja2 \
    uvicorn \
    qdrant-client \
    watchdog
```

#### After (Installation)
```bash
# Use requirements.txt from repo
if [ -f 'requirements.txt' ]; then
    echo '  → Installing Python dependencies from requirements.txt...'
    uv pip install --python venv/bin/python -r requirements.txt
    if [ $? -eq 0 ]; then
        echo '  → Python dependencies installed successfully.'
    else
        echo '  → Warning: Some dependencies may not have installed correctly.'
        exit 1
    fi
else
    echo '  → requirements.txt not found! Skipping dependency installation.'
    exit 1
fi
```

**Before (Refresh)**
```bash
# Same as original, uses requirements.txt
run_as_service "$PIP_BIN" install -r requirements.txt
```

**After (Refresh)**
```bash
# Enhanced error handling and reporting
if [[ -f "requirements.txt" ]]; then
    log "  Installing dependencies from requirements.txt..."
    log "    Dependencies:"
    grep -v "^#" requirements.txt | grep -v "^$" | sed 's/^/      /'
    
    run_as_service "$PIP_BIN" install -r requirements.txt \
      || die "Failed to install dependencies from requirements.txt" 1
      
    log "  Dependencies installed successfully."
fi
```

**Result:**
✓ Installation script now uses `requirements.txt` from repo
✓ Avoids duplication and maintenance issues
✓ Both scripts properly report what's being installed
✓ Both handle missing dependencies appropriately

---

### 5. Idempotent Checks

#### Installation Script - Step by Step

| Step | Check Before | Skip If | Benefit |
|------|--------------|---------|---------|
| Update index | N/A | N/A | Always safe |
| Check upgrades | `apt list --upgradable` | None needed | Fast on up-to-date system |
| DNS config | `grep DNS=1.1.1.1` | Already set | No unnecessary restarts |
| System packages | `dpkg -l` per package | Already installed | Selective install |
| Git clone | `[ -d /opt/ladylinux ]` | Exists + branch match | Smart update logic |
| Ollama install | `command -v ollama` | Already installed | Skip reinstall |
| Ollama service | `systemctl is-active ollama` | Already running | No service bounce |
| Mistral model | `ollama list \| grep mistral` | Already present | Save 4GB download |
| User creation | `id ladylinux` | Already exists | Idempotent |
| Python venv | `[ -d venv ]` | Exists | Create only if needed |

#### Refresh Script - Key Checks

```bash
# Service checks
if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME"
fi

# Venv rebuild decision
venv_rebuild_needed() {
  if [[ "$ALWAYS_REBUILD_VENV" == "true" ]]; then
    return 0  # Force rebuild
  fi
  
  if [[ ! -d "$VENV_DIR" || ! -x "$VENV_DIR/bin/python" ]]; then
    return 0  # No venv, must build
  fi
  
  # Check if requirements.txt changed
  new_fp="$(fingerprint_deps)"
  old_fp="$(cat "$FINGERPRINT_FILE" || true)"
  
  if [[ "$new_fp" != "$old_fp" ]]; then
    return 0  # Dependencies changed, rebuild
  fi
  
  return 1  # No rebuild needed
}
```

**Result:**
✓ Both scripts are now fully idempotent
✓ Can safely run multiple times
✓ Skips unnecessary operations
✓ Faster on systems already configured

---

### 6. Branch Validation

#### Refresh Script - New Logic

```bash
# Check if remote branch exists
if ! run_as_service git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    die "Remote branch 'origin/$BRANCH' does not exist."
fi

# Get current branch and switch if needed
current_branch="$(run_as_service git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$BRANCH" ]; then
    log "  Switching from branch '$current_branch' to '$BRANCH'..."
    run_as_service git checkout -f "$BRANCH" 2>/dev/null || \
    run_as_service git checkout -b "$BRANCH" "origin/$BRANCH"
fi

# Hard align to remote (removes local drift)
run_as_service git reset --hard "origin/$BRANCH"
run_as_service git clean -fd
```

**Result:**
✓ Prevents errors from non-existent branches
✓ Automatically switches branches when requested
✓ Ensures clean state (removes local modifications)
✓ Better error messages

---

## Verification Commands

### Test Installation Script (Syntax)
```bash
bash -n scripts/current_ladylinuxinstall.sh
```

### Test Refresh Script (Syntax)
```bash
bash -n scripts/refresh_vm.sh
```

### Verify Branch Default
```bash
# In current_ladylinuxinstall.sh:
BRANCH="${LADYLINUX_BRANCH:-Capstone_Dev_01}"

# In refresh_vm.sh:
BRANCH="${1:-Capstone_Dev_01}"
```

### Verify requirements.txt Usage
```bash
# Installation script should:
grep -n "requirements.txt" scripts/current_ladylinuxinstall.sh

# Refresh script should:
grep -n "requirements.txt" scripts/refresh_vm.sh
```

---

## Testing Recommendations

### Scenario 1: Fresh Installation
```bash
# On clean Ubuntu system
sudo ./scripts/current_ladylinuxinstall.sh
# Should fetch Capstone_Dev_01 and include api_layer/rag_layer/
```

### Scenario 2: Re-run Installation
```bash
# Run again on same system
sudo ./scripts/current_ladylinuxinstall.sh
# Should skip all "already installed" steps
```

### Scenario 3: Refresh Current Branch
```bash
# With repo on Capstone_Dev_01
sudo ./scripts/refresh_vm.sh
# Should pull latest without switching
```

### Scenario 4: Switch Branches
```bash
# Switch from Capstone_Dev_01 to main
sudo ./scripts/refresh_vm.sh main
# Should switch, pull main branch
```

### Scenario 5: Dependency Update
```bash
# Modify requirements.txt to add a package
echo "new-package>=1.0" >> /opt/ladylinux/requirements.txt
sudo ./scripts/refresh_vm.sh
# Should detect change and rebuild venv
```

### Scenario 6: Force Rebuild
```bash
# Force complete rebuild
ALWAYS_REBUILD_VENV=true sudo ./scripts/refresh_vm.sh
# Should rebuild even if no changes
```

---

## Files Modified

1. **`scripts/current_ladylinuxinstall.sh`**
   - Added branch variable and logic
   - Smart repository clone/update
   - Fixed permission issues
   - Use requirements.txt from repo
   - Enhanced status messages
   - Better error handling

2. **`scripts/refresh_vm.sh`**
   - Changed default branch to Capstone_Dev_01
   - Improved branch validation
   - Better branch switching logic
   - Enhanced venv rebuild logic
   - Improved error messages
   - Better service status reporting

## Files Created

1. **`docs/SCRIPTS_INSTALLATION_AND_REFRESH.md`**
   - Comprehensive documentation
   - Usage examples
   - Troubleshooting guide
   - Security considerations
   - Future enhancements

2. **`docs/SCRIPTS_QUICK_REFERENCE.md`**
   - Quick command reference
   - Common tasks
   - Frequently needed operations
   - Emergency procedures

3. **`INSTALLATION_SCRIPT_REFACTOR.md`**
   - Original refactoring summary
   - Step-by-step improvements
   - Idempotent operations explanation

---

## Migration Path

### For Existing Installations

If you have an existing system on the `main` branch:

```bash
# Option 1: Update to Capstone_Dev_01
sudo ./scripts/refresh_vm.sh Capstone_Dev_01

# Option 2: Full reinstall
sudo ./scripts/current_ladylinuxinstall.sh
```

### For New Installations

```bash
# Just run - will use Capstone_Dev_01 by default
sudo ./scripts/current_ladylinuxinstall.sh

# Or specify different branch
LADYLINUX_BRANCH=main sudo ./scripts/current_ladylinuxinstall.sh
```

---

## Backward Compatibility

Both scripts maintain backward compatibility:
- Environment variable `LADYLINUX_BRANCH` still works
- Refresh script `./refresh_vm.sh <branch>` still works
- No changes to service file or directory structure

---

## Summary

✅ Both scripts now default to `Capstone_Dev_01` branch  
✅ Full idempotent operation (safe to run multiple times)  
✅ Proper `requirements.txt` usage in both scripts  
✅ Fixed permission issues on directory creation  
✅ Better branch validation and switching  
✅ Comprehensive documentation provided  
✅ Syntax validated - no errors  
✅ Backward compatible with existing deployments  

The scripts are now production-ready and follow best practices for system deployment automation.

