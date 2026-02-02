# LadyLinux Deployment & Refresh Workflow Specification

**Status:** v0.1 (Pre-CI/CD)  
**Audience:** Developers, Contributors, Future CI/CD Maintainers  
**Scope:** Local, VM, and physical LadyLinux installations  
**Out of Scope:** ISO rebuilds, OS installer generation

---

## 1. Purpose

This document specifies the **deployment, refresh, and update workflow** for LadyLinux systems.  
It defines how a running LadyLinux environment refreshes its **application layer** from the GitHub development repository without rebuilding or redistributing operating system images.

The goal is to:

- Enable rapid iteration on the LadyLinux Python/FastAPI layer
- Preserve large assets (LLM weights) outside of GitHub
- Support reproducible testing across virtual and physical machines
- Align early design decisions with future CI/CD and container-based deployment

---

## 2. Architectural Assumptions

LadyLinux is composed of **layered components**, each with different stability and update frequency.

### 2.1 Layer Overview

| Layer | Description | Update Frequency |
|-----|------------|-----------------|
| Base OS | Linux Mint (Cinnamon) | Rare |
| Runtime Environment | Python, system libraries | Occasional |
| LLM Runtime & Models | Local inference runtime + model weights | Infrequent |
| Application Layer | Python + FastAPI services | Frequent |
| Configuration & State | Local config, caches, logs | Persistent |

This workflow explicitly targets **refreshing only the Application Layer**.

---

## 3. Design Constraints

- `.iso` images are too large for GitHub distribution
- LLM weights are too large for GitHub and must remain external
- Systems may be:
  - Virtual machines
  - Physical installs
  - Offline or intermittently connected
- CI/CD infrastructure **does not yet exist**, but must be anticipated

---

## 4. Deployment Model

### 4.1 Service User

LadyLinux services MUST run under a dedicated system user:


**Rationale:**
- Improves security isolation
- Simplifies permissions management
- Aligns with container and CI/CD expectations
- Avoids coupling application state to developer accounts

---

## 5. Filesystem Layout (Normative)

The following directory layout is REQUIRED for all LadyLinux installations.

``` plaintext
/opt/ladylinux/
├── app/ # Git-managed application source (replaceable)
├── venv/ # Python virtual environment (rebuildable)
├── models/ # LLM weights and tokenizers (persistent)
└── containers/ # Reserved for future container images

/etc/ladylinux/
├── ladylinux.env # Environment variables and configuration

/var/lib/ladylinux/
├── data/ # Application state (vector DBs, indexes)
├── cache/ # Runtime caches
└── logs/ # Persistent logs
```

### 5.1 Mutability Rules

| Path | May Be Deleted During Refresh |
|----|------------------------------|
| `/opt/ladylinux/app` | YES |
| `/opt/ladylinux/venv` | YES |
| `/opt/ladylinux/models` | NO |
| `/var/lib/ladylinux` | NO |
| `/etc/ladylinux` | NO |

---

## 6. Application Execution Model

### 6.1 Service Management

The LadyLinux API MUST run as a managed service (e.g., `systemd`).

**Responsibilities of the service:**
- Launch FastAPI (e.g., via `uvicorn`)
- Use the virtual environment in `/opt/ladylinux/venv`
- Load configuration from `/etc/ladylinux/ladylinux.env`
- Restart cleanly after refresh operations

This abstraction ensures compatibility with:
- Local development
- VM-based testing
- Future container orchestration

---

## 7. Refresh Workflow (Core Specification)

### 7.1 Purpose

The refresh workflow updates a running LadyLinux system to the **latest GitHub development state** without:

- Reinstalling the OS
- Rebuilding ISO images
- Re-downloading LLM models

### 7.2 Refresh Script

A refresh script (e.g., `scripts/refresh_vm.sh`) MUST exist in the repository.

#### Responsibilities (Executed in Order)

1. **Stop the LadyLinux service**
   - Prevents inconsistent state during update

2. **Synchronize Git Repository**
   - Fetch remote changes
   - Hard-reset local source to the selected branch
   - Remove untracked files

3. **Rebuild Python Environment**
   - Recreate virtual environment OR
   - Reinstall dependencies deterministically

4. **Prepare Application**
   - Run migrations, compile assets, or preload resources as needed

5. **Restart the Service**
   - Ensure application returns to a known-good running state

6. **Emit Status Output**
   - Active git commit hash
   - Service status
   - Python environment confirmation

---

## 8. Model Asset Management

### 8.1 Git Exclusion

LLM model weights MUST NOT be committed to GitHub.

### 8.2 Manifest-Based Resolution (Recommended)

The repository SHOULD include a lightweight model manifest:

This manifest MAY define:
- Model name
- Source URL
- Expected checksum
- Target directory

The refresh workflow MAY verify model presence but MUST NOT delete existing models.

---

## 9. Virtual Machine Strategy (Recommended)

For VM-based testing, the following reset levels are supported:

| Reset Type | Mechanism | Use Case |
|---------|----------|---------|
| Soft Reset | Refresh Script | Daily development |
| Hard Reset | VM Snapshot | Corrupted state, major refactors |

Snapshots SHOULD represent a **baseline installation** with:
- OS installed
- System dependencies present
- No application code assumptions

---

## 10. Container Alignment (Forward-Looking)

Although containers are not yet required, this workflow intentionally mirrors container best practices:

- Immutable application layer
- Externalized configuration
- Persistent volumes for state and models
- Single responsibility services

### 10.1 Future Compatibility

This design supports seamless transition to:
- Docker
- Podman
- CI/CD-managed deployment pipelines
- Artifact-based releases

No part of this workflow conflicts with containerization.

---

## 11. Summary

This specification defines a **repeatable, safe, and future-aligned** workflow for refreshing LadyLinux systems from GitHub.

It enables:
- Fast iteration without OS rebuilds
- Clear separation of concerns
- Predictable behavior across machines
- Smooth evolution toward CI/CD and containers

---

**End of Specification**
