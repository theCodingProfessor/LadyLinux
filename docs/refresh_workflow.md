# LadyLinux Refresh Workflow

**Status:** v0.1  
**Audience:** Developers, Testers, CI/CD Engineers  
**Scope:** Application-layer updates only  
**Depends On:** DEPLOYMENT.md

---

## 1. Purpose

This document specifies the **refresh workflow** for LadyLinux.

The refresh workflow updates a running LadyLinux installation to the latest state of a GitHub branch **without**:

- Reinstalling the OS
- Rebuilding `.iso` images
- Removing LLM model assets
- Resetting persistent application state

---

## 2. Workflow Intent

The refresh process is designed to be:

- **Fast** — suitable for daily development
- **Deterministic** — no hidden local drift
- **Recoverable** — compatible with VM snapshots
- **CI/CD-ready** — scriptable and non-interactive

---

## 3. Scope of Refresh

### 3.1 Included

- Application source code
- Python virtual environment
- Python dependencies
- Application startup state

### 3.2 Excluded

- Base OS
- LLM model weights
- Persistent data
- Configuration files

---

## 4. Refresh Script

A refresh script MUST exist in the repository.

Recommended location:

scripts/refresh_vm.sh


The script MUST be executable and non-interactive.

---

## 5. Refresh Workflow (Normative)

The following steps MUST be executed in order.

### Step 1: Stop Application Service

The LadyLinux service MUST be stopped prior to refresh.

**Purpose:**
- Prevents file contention
- Ensures consistent state
- Avoids partial reloads

---

### Step 2: Synchronize Git Repository

The application source directory (`/opt/ladylinux/app`) MUST be force-aligned with the remote branch.

Required behavior:
- Fetch remote changes
- Hard reset to the selected branch
- Remove untracked files

**Purpose:**
- Eliminates configuration drift
- Ensures reproducible builds
- Mirrors CI/CD behavior

---

### Step 3: Rebuild Python Environment

The Python virtual environment MUST be recreated or deterministically updated.

Acceptable strategies:
- Always rebuild the virtual environment
- Rebuild only when dependency definitions change

**Purpose:**
- Prevents dependency contamination
- Ensures clean runtime state

---

### Step 4: Application Preparation

Optional preparation steps MAY be executed, including:
- Database migrations
- Asset compilation
- Index rebuilding
- Lightweight validation checks

**Purpose:**
- Ensure application readiness before restart

---

### Step 5: Restart Application Service

The LadyLinux service MUST be restarted after refresh.

**Purpose:**
- Return system to operational state
- Validate that refresh was successful

---

### Step 6: Emit Status Information

The script MUST emit diagnostic output, including:
- Active Git commit hash
- Python environment path
- Service status

**Purpose:**
- Support debugging
- Enable automated verification
- Aid CI/CD observability

---

## 6. Model Asset Handling

### 6.1 Persistence Rule

The refresh workflow MUST NOT delete or overwrite:

``` plaintext
/opt/ladylinux/models
```

### 6.2 Optional Verification

The workflow MAY verify:
- Model presence
- File checksums
- Manifest consistency

The workflow MUST NOT automatically delete existing models.

---

## 7. Failure & Recovery Model

### 7.1 Soft Failure

If the refresh fails:
- The service MUST remain stopped
- Errors MUST be clearly reported
- No partial restart should occur

### 7.2 Hard Recovery (VM-Based)

For VM deployments, the refresh workflow assumes the existence of:
- A baseline VM snapshot

This enables rapid recovery from:
- Dependency corruption
- Misconfiguration
- Experimental changes

---

## 8. CI/CD Alignment

This refresh workflow is intentionally compatible with CI/CD execution:

- No interactive prompts
- Deterministic behavior
- Clear success/failure signals
- Script-first execution model

The same script MAY be reused in:
- CI runners
- Build agents
- Deployment pipelines

---

## 9. Summary

This document defines a **safe, repeatable, and automation-friendly** method for refreshing LadyLinux systems from GitHub.

Together with `DEPLOYMENT.md`, it enables:
- Rapid development cycles
- Consistent testing environments
- A smooth path toward containerization and CI/CD

---

**End of Document**
