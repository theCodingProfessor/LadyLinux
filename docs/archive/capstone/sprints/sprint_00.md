
## LadyLinux Sprint 00, 2026 Capstone Project

# Backlog Update: Application-Layer Refresh Capability

**Feature Area:** Deployment & Operations  
**Related Sprint Item:** Application-layer redeploy for LadyLinux  
**Status:** Implemented (Pre-Test Phase)

---

## 1. Original Backlog Intent (Restated)

The original backlog item asked for:

User Story: As a developer, I need a way (i.e. script) to refresh my LadyLinux Test VM from the GitHub development repo in order to effectively test changes.

> A repeatable way to refresh a running LadyLinux test system from the GitHub development repository without rebuilding an `.iso` image or modifying the Linux base layer.

At the time this item was introduced, LadyLinux had already been installed multiple times across virtual and physical machines, making full OS rebuilds impractical for iterative development.

The core architectural assumptions were:

- **Base OS:** Linux Mint (Cinnamon), installed once and treated as stable  
- **LLM runtime and weights:** Large, persistent assets not suitable for GitHub  
- **Python / API layer:** Rapidly changing code that must be refreshed frequently from  

The backlog item was therefore interpreted as a need for a **repeatable application-layer redeploy mechanism**.

---

## 2. Architectural Direction Chosen

Rather than attempting to version entire system images, the project adopted a **layered deployment model**:

| Layer | Treatment |
|------|----------|
| Base OS | Installed once, rarely modified |
| Runtime directories | Created once, persistent |
| Application code | Replaceable, Git-managed |
| Python environment | Rebuildable |
| Models & state | Persistent, never auto-deleted |

This decision directly shaped the work that followed.

---

## 3. Key Changes and Artifacts Created

### 3.1 Defined a Clear Runtime Filesystem Contract

A standardized runtime layout was established on the host system:

- `/opt/ladylinux/` → application runtime (code, venv, models)
- `/etc/ladylinux/` → local configuration
- `/var/lib/ladylinux/` → persistent state and logs

**Why this mattered:**  
The refresh feature needed a predictable environment. Separating *replaceable code* from *persistent data* prevents accidental data loss during updates and aligns with production best practices.

---

### 3.2 Introduced a Dedicated Service User

A non-login system user (`ladylinux`) was introduced to own and run all LadyLinux services.

**Why this mattered:**  
- Prevents coupling the system to a specific developer account  
- Improves security isolation  
- Aligns with future container and CI/CD expectations  

---

### 3.3 Created an Installation Bootstrap Script

**Artifact:** `scripts/install_ladylinux.sh`

This script:
- Safely creates required directories under `/opt`, `/var`, and `/etc`
- Creates the service user
- Sets permissions and ownership
- Optionally clones the repository into `/opt/ladylinux/app`

**Why this mattered:**  
The refresh feature assumes the system already exists. This script ensures that assumption is valid and repeatable across machines without manual setup.

---

### 3.4 Implemented a Managed Application Service

**Artifact:** `ladylinux-api.service` (systemd unit)

The LadyLinux API now runs as a managed service using:
- A Python virtual environment
- Externalized configuration via `/etc/ladylinux/ladylinux.env`

**Why this mattered:**  
Refreshing the application layer requires deterministic stop/start behavior. A managed service provides that control and enables automation.

---

### 3.5 Implemented the Application Refresh Script

**Artifact:** `scripts/refresh_vm.sh`

This script:
- Stops the running service
- Hard-aligns the application code to a selected Git branch
- Rebuilds the Python virtual environment when dependencies change
- Restarts the service
- Emits clear status and version information

It also:
- Auto-installs the systemd unit if missing
- Never deletes models, state, or configuration

**Why this mattered:**  
This script is the **direct implementation of the backlog item**. It enables fast, repeatable redeploys of the Python / API layer without touching the OS or persistent assets.

---

### 3.6 Documented the Workflow Explicitly

New documentation was added to make the refresh capability understandable and transferable:

- `docs/INSTALLATION.md` — how a system becomes a LadyLinux system
- `docs/deployment.md` — structural deployment model
- `docs/refresh_workflow.md` — refresh behavior and guarantees
- `scripts/README.md` — operational overview of scripts

**Why this mattered:**  
The refresh feature is intended for students, contributors, and future automation—not just the original developer. Documentation ensures the workflow is reproducible and reviewable.

---

### 3.7 Introduced a Model Manifest (Descriptive Only)

**Artifact:** `models/manifest.json` (v0.1)

The manifest:
- Describes expected models
- Records source and local layout
- Does not trigger downloads or enforcement

**Why this mattered:**  
The backlog discussion explicitly separated *models* from *code*. The manifest documents that boundary and prepares the system for future automation without introducing complexity now.

---

## 4. How This Satisfies the Original Backlog Item

The original requirement was a way to refresh LadyLinux for testing without rebuilding the system.

That requirement is now met by:

- A stable base OS that is not modified during refresh
- A deterministic runtime layout
- A single command that:
  - Updates code from GitHub
  - Rebuilds dependencies safely
  - Restarts the application cleanly
- Preservation of large and persistent assets

In practice, this enables:

- Rapid iteration on the Python / API layer
- Consistent behavior across multiple machines
- Low-risk testing before broader rollout

---

## 5. Readiness for Testing

At this point:

- The refresh mechanism is implemented
- The installation and refresh paths are documented
- The system supports both VM and physical deployments
- The architecture aligns with future CI/CD and containerization

The project is now ready to move from **feature construction** into **system testing and validation**.

---

**Downstream Structure**

``` text
GitHub Repository
└── cloned into → /opt/ladylinux/app

Runtime Filesystem
├── /opt/ladylinux/venv
├── /opt/ladylinux/models
├── /etc/ladylinux
└── /var/lib/ladylinux
``` 

** Resources Created**

- ladylinux-api.service
- docs/deployment.md
- docs/deployment_workflow.md
- docs/installation.md
- docs/refresh_workflow.md
- /scripts/install_ladylinux.sh
- /scripts/readme.md
- /scripts/refresh_vm.sh

