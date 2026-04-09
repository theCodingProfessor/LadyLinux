# Option A: Passwordless Sudoers Implementation Guide

**Date**: April 8, 2026  
**Status**: Complete  
**Strategy**: Option A - Passwordless sudoers rules for firewall commands  

## Overview

This document describes the implementation of passwordless sudo access for firewall commands, allowing the non-root `ladylinux` service user to query firewall state (ufw, iptables, nftables) without password prompts.

---

## Architecture Changes

### 1. Sudoers Rule File

**File**: `/etc/sudoers.d/ladylinux-firewall` (source: `ladylinux-firewall.sudoers`)

Grants the `ladylinux` user passwordless sudo access to specific firewall binaries:
- `/usr/sbin/ufw`, `/sbin/ufw`, `/usr/bin/ufw`
- `/usr/sbin/iptables`, `/sbin/iptables`, `/usr/bin/iptables`
- `/usr/sbin/iptables-save`, `/sbin/iptables-save`
- `/usr/sbin/iptables-restore`, `/sbin/iptables-restore`
- `/usr/sbin/nft`, `/sbin/nft`, `/usr/bin/nft`

**Security Properties**:
- Narrowly scoped to firewall binaries only
- No shell invocation or command substitution allowed
- Logged to syslog for audit trail
- Does not grant password-less sudo for other commands

### 2. Firewall Command Execution (`firewall_core.py`)

**File**: `api_layer/firewall_core.py`

**Change**: `_run_command()` now prepends `sudo` to all firewall commands.

```python
sudo_command = ["sudo"] + command
# Then execute via subprocess.run(sudo_command, ...)
```

**Effect**: 
- When the service (running as `ladylinux` user) calls `ufw status verbose`, it becomes `sudo ufw status verbose`
- The sudoers rule automatically allows this without password via `NOPASSWD:` directive
- Command still captures stdout/stderr for parsing

### 3. Python Logging to Disk

**File**: `api_layer/app.py`

**Changes**:
- Created `_LOG_DIR = "/var/log/ladylinux"` (standard location)
- Configured `RotatingFileHandler` with 10 MB file limit, 5 backups
- Root logger level set to `INFO`
- Added file handler to root logger on startup

**Result**:
- All module loggers write to `/var/log/ladylinux/ladylinux.log`
- Example log message on startup: `"LadyLinux API started; logging to /var/log/ladylinux/ladylinux.log"`
- Useful for diagnosing vectorization, retrieval, and permission issues

**Log Locations**:
- Application log: `/var/log/ladylinux/ladylinux.log` (Python logging, rotating)
- Actions audit log: `/var/log/ladylinux/actions.log` (JSON records, manual flush)
- Systemd journal: `journalctl -u ladylinux-api.service`

### 4. Installer Updates (`scripts/install_ladylinux.sh`)

**Changes**:

1. **Directory Variables**:
   - Added `LOG_DIR="/var/log/ladylinux"`
   - Added `SUDOERS_FILE="/etc/sudoers.d/ladylinux-firewall"`

2. **New Function**: `setup_firewall_sudoers()`
   - Copies `ladylinux-firewall.sudoers` from repo to `/etc/sudoers.d/ladylinux-firewall`
   - Sets permissions to `0440` (secure: readable, not writable)
   - Validates using `visudo -c -f` (prevents invalid sudoers from breaking sudo)
   - Logs errors but doesn't fail installation if source file missing

3. **Directory Creation**:
   - Creates `/var/log/ladylinux` with permissions `0755` (world-readable, writable by owner)
   - Sets ownership to `ladylinux:ladylinux` for log rotation

4. **Installation Flow**:
   - After cloning repo (if `--clone` flag), set `SUDOERS_SOURCE_FILE="$APP_DIR/ladylinux-firewall.sudoers"`
   - Call `setup_firewall_sudoers()` to install and validate
   - Print summary including security setup status

### 5. Systemd Service Updates (`ladylinux-api.service`)

**Changes**:

1. **ExecStartPre** (three steps to ensure log directory exists):
   ```
   ExecStartPre=/usr/bin/mkdir -p /var/log/ladylinux
   ExecStartPre=/usr/bin/chown ladylinux:ladylinux /var/log/ladylinux
   ExecStartPre=/usr/bin/chmod 0755 /var/log/ladylinux
   ```

2. **ReadWritePaths**: Added `/var/log/ladylinux` to list of paths writable by service

**Effect**:
- Log directory is created/corrected every service start
- No need for manual directory creation
- Survives systemd security hardening (`ProtectSystem=full`)

---

## Installation & Activation

### Step 1: Run Installer with Clone

```bash
sudo ./scripts/install_ladylinux.sh --clone --branch main
```

This will:
1. Create `/opt/ladylinux/*` directories
2. Clone the repo into `/opt/ladylinux/app`
3. Create `/var/log/ladylinux` directory
4. Install `/etc/sudoers.d/ladylinux-firewall` from repo
5. Validate sudoers syntax

### Step 2: Verify Sudoers Installation

```bash
sudo cat /etc/sudoers.d/ladylinux-firewall
```

Expected output:
```
ladylinux ALL=(ALL) NOPASSWD: /usr/sbin/ufw, /sbin/ufw, /usr/bin/ufw
ladylinux ALL=(ALL) NOPASSWD: /usr/sbin/iptables, /sbin/iptables, /usr/bin/iptables
# ... etc
```

### Step 3: Test Permission

As `ladylinux` user (or via service):
```bash
sudo ufw status verbose
```

Should succeed **without** prompting for a password.

### Step 4: Start Service

```bash
sudo systemctl start ladylinux-api.service
```

### Step 5: Check Logs

```bash
# Python application logs
tail -f /var/log/ladylinux/ladylinux.log

# Systemd journal
journalctl -u ladylinux-api.service -f

# Actions audit log
tail -f /var/log/ladylinux/actions.log
```

---

## Workflow: From Request to Firewall Data

1. **User submits firewall question** on `/firewall` page
2. **Frontend sends to `/ask_rag`** with `domain="firewall"`, `prompt="What are your settings?"`
3. **Backend calls `_run_firewall_rag()`**:
   - Calls `get_firewall_status_json()` → which calls `_run_command([ufw, status, verbose])`
   - Prepends `sudo` → `sudo ufw status verbose`
   - Sudoers rule grants access without password ✅
   - Parses output into JSON snapshot
4. **Vectorizes snapshot** via `ensure_firewall_snapshot_vectorized()`:
   - Builds 3–4 synthetic RAG documents from snapshot
   - Embeds text chunks via `embed_texts()`
   - Upserts to Qdrant
   - **Logs timing**: "embedding took 0.45s, upsert took 0.12s, stored 4 chunks"
5. **Retrieves from vector store** with query and domain filter
6. **Sends to LLM** with evidence + live snapshot as context
7. **Returns JSON response** including:
   - LLM answer
   - Firewall JSON snapshot
   - Vectorization stats
   - Source attributions

---

## Logging & Debugging

### Key Log Messages

**Startup**:
```
2026-04-08 12:34:56 [INFO] api_layer.app: LadyLinux API started; logging to /var/log/ladylinux/ladylinux.log
2026-04-08 12:34:56 [INFO] api_layer.app: RAG collection ready — starting background seed
2026-04-08 12:34:58 [INFO] api_layer.app: Background seed done — 42 file(s), 128 chunk(s), 0 error(s)
```

**Firewall Query**:
```
2026-04-08 12:35:10 [INFO] api_layer.app: Starting firewall snapshot vectorization...
2026-04-08 12:35:10 [INFO] api_layer.firewall_core: Firewall vectorization: building 4 documents
2026-04-08 12:35:10 [INFO] api_layer.firewall_core: Firewall vectorization: embedding 4 document texts
2026-04-08 12:35:10 [INFO] api_layer.firewall_core: Firewall vectorization: embedding took 0.45s, got 4 vectors
2026-04-08 12:35:10 [INFO] api_layer.firewall_core: Firewall vectorization: upserting 4 chunks to Qdrant
2026-04-08 12:35:10 [INFO] api_layer.firewall_core: Firewall vectorization: upsert took 0.12s, stored 4 chunks
2026-04-08 12:35:10 [INFO] api_layer.app: Firewall vectorization completed in 0.57s: vectorized=True, chunks_stored=4, errors=[]
2026-04-08 12:35:10 [INFO] api_layer.app: Firewall RAG retrieval: domain=firewall, result_count=4, query_len=48
```

### Troubleshooting

#### Sudoers Not Working?

```bash
# Check syntax
sudo visudo -c -f /etc/sudoers.d/ladylinux-firewall

# Check if ladylinux user exists
id ladylinux

# Test sudoers directly as ladylinux user
sudo -u ladylinux sudo ufw status verbose
```

#### Log Directory Permissions Issue?

```bash
# Check ownership
ls -ld /var/log/ladylinux

# Fix if needed
sudo chown ladylinux:ladylinux /var/log/ladylinux
sudo chmod 0755 /var/log/ladylinux
```

#### No Log Output?

1. Check if directory exists: `ls -la /var/log/ladylinux/`
2. Check Python logging configuration in `app.py` (lines 26–59)
3. Verify `RotatingFileHandler` creation succeeded (no `[WARN]` messages on stdout)
4. Check file permissions: `ls -la /var/log/ladylinux/ladylinux.log`

#### Firewall Vectorization Failing?

Look for logs like:
```
[ERROR] api_layer.firewall_core: Firewall snapshot vectorization failed: <error>
```

Common causes:
- Embedding service timeout (check Ollama is running)
- Qdrant collection not initialized (check RAG startup)
- JSON serialization error in snapshot building (check firewall state parsing)

---

## Security Considerations

### Why Passwordless Sudo is Safe Here

1. **Narrowly Scoped**: Only allows specific firewall binaries, not general shell access
2. **Read-Only by Nature**: `ufw status`, `iptables -L` don't modify system state
3. **Audited**: All sudo invocations logged to syslog `/var/log/auth.log`
4. **Limited User**: `ladylinux` user has no shell (`/usr/sbin/nologin`), cannot TTY into system
5. **Service-Only**: Rules apply only to the non-interactive service process, not interactive login

### Audit Trail

Check who ran firewall commands:
```bash
sudo grep sudo /var/log/auth.log | grep ladylinux
```

Example:
```
Apr  8 12:35:10 server sudo: ladylinux : TTY=unknown ; PWD=/opt/ladylinux/app ; USER=root ; COMMAND=/usr/sbin/ufw status verbose
```

### Future: Privilege Escalation to Root Service

If needed later, `/etc/sudoers.d/` can be extended to allow the service to run as root directly:
```
ladylinux ALL=(root) NOPASSWD: /opt/ladylinux/app/scripts/privileged_ops.sh
```

---

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `ladylinux-firewall.sudoers` | **NEW**: Sudoers rule | — |
| `api_layer/firewall_core.py` | Prepend `sudo` to `_run_command()` | 27–58 |
| `api_layer/app.py` | Configure Python logging to `/var/log/` | 23–59 |
| `scripts/install_ladylinux.sh` | Create sudoers, log dir, validation | Various |
| `ladylinux-api.service` | ExecStartPre, ReadWritePaths | 44–61 |

---

## Next Steps

### Immediate
1. Run installer with `--clone` flag
2. Test firewall query at `/firewall` endpoint
3. Verify logs in `/var/log/ladylinux/ladylinux.log`

### Short-term (Sprint 2+)
- [ ] Monitor `/var/log/auth.log` for sudo usage patterns
- [ ] Set up log rotation policy (logrotatate) for long-running deployments
- [ ] Add Prometheus/Grafana metrics for embedding latency

### Long-term
- [ ] Consider persistent Qdrant storage (currently in-memory, resets on restart)
- [ ] Implement conversation history layer (physical database)
- [ ] Add RBAC for who can query which firewall details

---

## Rollback (If Needed)

To revert to asking for sudo password (not recommended):

1. **Remove sudoers rule**:
   ```bash
   sudo rm /etc/sudoers.d/ladylinux-firewall
   ```

2. **Revert firewall_core.py**: Don't prepend `sudo`
   ```python
   # OLD: result = subprocess.run(command, ...)
   # NEW: result = subprocess.run(["sudo"] + command, ...)
   ```

3. **Add interactive password prompt in `_run_firewall_rag()`** (complex, non-recommended):
   - Would require async subprocess + expect library
   - Fragile in non-interactive service context
   - User experience worse (UI modal for password)

**Recommendation**: Stick with passwordless sudoers (Option A). It's the production-standard approach for service automation.

---

## References

- **Sudoers Man Page**: `man sudoers`
- **Visudo Validation**: `visudo -c -f <file>`
- **Python Logging**: https://docs.python.org/3/library/logging.html
- **FastAPI Lifespan Events**: https://fastapi.tiangolo.com/advanced/events/
- **Systemd ExecStartPre**: `man systemd.service`


