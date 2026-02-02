# LadyLinux Installation Guide

**Status:** v0.1  
**Audience:** Developers, Contributors, Instructors, Platform Engineers  
**Scope:** Local, VM, and physical installations  
**Out of Scope:** OS installer (.iso) generation

---

## 1. Purpose

This document describes how to **install and initialize a LadyLinux system** on a Linux host.

It explains:
- What “installation” means in the LadyLinux project
- How repository contents map to the runtime filesystem
- How to bootstrap a system safely using provided scripts
- How the installation supports rapid iteration and future CI/CD

This document complements (but does not replace):
- `docs/deployment.md`
- `docs/refresh_workflow.md`

---

## 2. What “Installation” Means in LadyLinux

LadyLinux does **not** install a custom operating system image.

Instead, installation consists of:
- Preparing a standard Linux system (e.g., Linux Mint)
- Creating a predictable runtime filesystem layout
- Installing a managed application service
- Cloning the LadyLinux GitHub repository into a runtime location

This approach avoids large `.iso` artifacts and enables faster iteration.

---

## 3. Prerequisites

Before installing LadyLinux, ensure the host system has:

- A supported Linux distribution (tested on Linux Mint)
- Root or sudo access
- Network access to GitHub (for initial clone)
- The following packages installed:
  - `git`
  - `python3`
  - `python3-venv`
  - `systemd`

---

## 4. Repository vs. Runtime Filesystem

A key concept in LadyLinux is the separation between:

- **Source repository** (GitHub)
- **Runtime filesystem** (the installed system)

### 4.1 Repository (Source of Truth)

The GitHub repository contains:
- Application source code
- Scripts for installation and refresh
- Documentation and architecture specs

The repository itself is **not** the installed system.

---

### 4.2 Runtime Filesystem (On the Host)

During installation, the repository is cloned into a standard Linux layout.

```text
/opt/ladylinux/
├── app/ ← cloned Git repository
├── venv/ ← Python virtual environment
├── models/ ← LLM weights (persistent)
└── containers/ ← reserved for future use

/etc/ladylinux/
└── ladylinux.env ← local configuration (not in Git)

/var/lib/ladylinux/
├── data/ ← persistent application state
├── cache/ ← runtime caches
└── logs/ ← persistent logs
```

**Important:**
- `/opt`, `/var`, and `/etc` are created on the host system
- They are not committed to Git
- Scripts in the repo *operate on* these directories

---

## 5. Installation Steps

### Step 1: Clone the Repository (if not already done)

On the host system:

```bash
git clone https://github.com/theCodingProfessor/LadyLinux
cd LadyLinux
```

### Step 2: Run the Install Bootstrap Script

The install script prepares the runtime filesystem and service user.

```bash
sudo ./scripts/install_ladylinux.sh --clone --branch develop
```

This script will:

- Create /opt/ladylinux, /var/lib/ladylinux, and /etc/ladylinux
- Create the ladylinux service user
- Set safe ownership and permissions
- Clone the repository into /opt/ladylinux/app
- Create a template /etc/ladylinux/ladylinux.env file (if missing)

What it will not do:

- Delete existing data
- Install system services
- Download LLM models

### Step 3: Review Configuration

Edit the environment file as needed:

```bash
sudo nano /etc/ladylinux/ladylinux.env
```

Typical values include:

- API host and port
- Model directory path
- Environment mode (dev/test/prod)

<hr> 

### Step 4: Install and Start the Service

The LadyLinux API runs as a systemd service.

The service unit file (ladylinux-api.service) should exist in the repository
(either at the repo root or in scripts/).

Run the refresh script to install and start the service:

```bash
sudo ./scripts/refresh_vm.sh develop
```

If the service unit is missing, it will be installed automatically.

---

## 6. Verifying the Installation

Check service status:

```bash
systemctl status ladylinux-api.service
```

View logs: 

```bash
journalctl -u ladylinux-api.service -n 200
```
If the service is running and logs show successful startup, installation is complete.

---

## 7. Updating an Existing Installation

After initial installation, do not re-run the install script.

To update the application:

```bash
sudo ./scripts/refresh_vm.sh develop
```

This will:

- Pull latest code
- Rebuild the Python environment if needed
- Restart the service safely

Persistent data and models are preserved.

---

## 8. Virtual Machine Recommendations

For VM-based development and testing:

- Create a VM snapshot after installation
- Use refresh_vm.sh for daily iteration
- Revert to snapshot only for major failures

This provides both fast iteration and reliable recovery.

---

## 9. Future CI/CD Alignment

This installation model is intentionally aligned with future automation:

- Non-interactive scripts
- Deterministic filesystem layout
- Externalized configuration
- Managed services

The same scripts can later be executed by:

- CI runners
- Deployment pipelines
- Container build processes

---

## 10. Summary

Installing LadyLinux consists of:

- Preparing a standard Linux host
- Running a safe bootstrap script
- Refreshing the application from GitHub
- Running the system as a managed service

This approach balances:

- Simplicity for contributors
- Safety for persistent data
- Flexibility for future growth

Model expectations are documented in models/manifest.json. The manifest is descriptive only and does not trigger automatic downloads.
