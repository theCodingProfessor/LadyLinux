# LadyLinux Deployment Architecture

**Status:** v0.1  
**Audience:** Developers, Contributors, Platform & CI/CD Engineers  
**Scope:** Local, VM, and physical installations  
**Out of Scope:** OS installer (.iso) generation

``` plaintext
GitHub Repository
└── cloned into → /opt/ladylinux/app

Runtime Filesystem
├── /opt/ladylinux/venv
├── /opt/ladylinux/models
├── /etc/ladylinux
└── /var/lib/ladylinux
```
---

## 1. Purpose

This document defines the **deployment architecture** for LadyLinux.  
It describes how LadyLinux is installed, structured, and executed on a host system, and establishes constraints that enable reproducible development, testing, and future CI/CD integration.

This document intentionally avoids procedural update steps, which are defined separately in `REFRESH_WORKFLOW.md`.

---

## 2. Architectural Overview

LadyLinux is a **layered system** designed to minimize rebuild costs and isolate frequently changing components.

### 2.1 Layer Model

| Layer | Description | Stability |
|-----|------------|----------|
| Base OS | Linux Mint (Cinnamon) | High |
| System Runtime | Python, system libraries | Medium |
| LLM Runtime & Models | Local inference + weights | Medium |
| Application Layer | FastAPI + Python services | Low |
| Configuration & State | Env vars, data, logs | Persistent |

The deployment architecture assumes:
- The OS is installed once
- The application layer is refreshed frequently
- Large artifacts (LLM models) remain outside GitHub

---

## 3. Design Constraints

- GitHub is the authoritative source for application code
- GitHub **must not** host:
  - OS images
  - LLM model weights
- Deployments must function:
  - On VMs and physical machines
  - With or without continuous internet access
- The design must align with **future containerization and CI/CD**

---

## 4. Service User Model

### 4.1 Dedicated Service User

LadyLinux services MUST run under a dedicated system user:


**Rationale:**
- Prevents permission leakage
- Decouples services from human users
- Aligns with container security models
- Simplifies automated deployment

All application processes, file ownership, and services assume this user unless explicitly documented otherwise.

---

## 5. Filesystem Layout (Normative)

All LadyLinux deployments MUST follow this directory layout.

``` plaintext
/opt/ladylinux/
├── app/ # Application source (Git-managed)
├── venv/ # Python virtual environment
├── models/ # LLM weights and tokenizers
└── containers/ # Reserved for future container images

/etc/ladylinux/
├── ladylinux.env # Environment configuration

/var/lib/ladylinux/
├── data/ # Persistent application state
├── cache/ # Runtime caches
└── logs/ # Persistent logs
```

### 5.1 Directory Semantics

| Directory | Purpose |
|---------|--------|
| `app/` | Replaceable application code |
| `venv/` | Rebuildable runtime environment |
| `models/` | Large, persistent assets |
| `data/` | Durable application state |
| `logs/` | Diagnostics and auditing |

---

## 6. Configuration Management

Configuration MUST be externalized from the application code.

### 6.1 Environment File

All runtime configuration SHOULD be defined in:

``` plaintext
/etc/ladylinux/ladylinux.env
```

Examples:
- Model paths
- Port numbers
- Feature flags
- Environment mode (dev/test/prod)

This enables:
- Immutable application code
- Environment-specific behavior
- CI/CD injection later

---

## 7. Application Execution Model

### 7.1 Managed Service Requirement

LadyLinux APIs MUST run as a managed service (e.g., `systemd`).

The service is responsible for:
- Activating the Python virtual environment
- Launching the FastAPI application
- Restarting cleanly after updates
- Emitting logs to the system journal

This abstraction layer ensures:
- Deterministic startup
- Clean restarts
- Compatibility with future container runtimes

---

## 8. Model Asset Management

### 8.1 GitHub Exclusion

LLM model weights MUST NOT be committed to the repository.

### 8.2 Local Persistence

Models MUST reside in:

``` plaintext
/opt/ladylinux/models
```

This directory is considered **stateful** and MUST survive application refreshes.

A manifest-based approach MAY be used to describe required models without embedding them in Git.

---

## 9. Virtual and Physical Deployment Parity

This deployment model is identical for:
- Virtual machines
- Physical installations
- Development and test systems

The only difference is **how the base OS is provisioned**, not how LadyLinux runs on top of it.

---

## 10. Container & CI/CD Alignment (Forward-Looking)

Although containers are not yet mandatory, this architecture intentionally mirrors container best practices:

- Immutable application layer
- Externalized configuration
- Persistent volumes
- Single-responsibility services

This enables a future transition to:
- Docker / Podman
- CI/CD-managed builds
- Artifact-based releases

No redesign is required to make this transition.

---

## 11. Summary

This document defines the **structural contract** of a LadyLinux deployment.

It establishes:
- Clear separation of concerns
- Predictable filesystem layout
- Security-conscious execution
- Compatibility with modern deployment pipelines

Procedural update steps are defined in `REFRESH_WORKFLOW.md`.

---

Model expectations are documented in models/manifest.json. The manifest is descriptive only and does not trigger automatic downloads.

**End of Document**
