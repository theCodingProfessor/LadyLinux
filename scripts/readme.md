# LadyLinux Scripts

This directory contains **operational and lifecycle scripts** used to install, update, and maintain a LadyLinux system.

Scripts here are intended to be run on a **host system** (virtual or physical). They operate on the LadyLinux runtime filesystem (`/opt`, `/var`, `/etc`) and are designed to be:
- **Safe by default** (non-destructive unless explicitly forced)
- **Non-interactive** (automation/CI-friendly)
- **Idempotent** (safe to run repeatedly)

For architectural context, see:
- `docs/INSTALLATION.md`
- `docs/deployment.md`
- `docs/refresh_workflow.md`

---

## Quick Start

Bootstrap a new machine (creates directories + service user + clones repo):

```bash
sudo ./scripts/install_ladylinux.sh --clone --branch develop
```

Refresh/update the running system (pull latest code, update venv if needed, restart service):

``` bash
sudo ./scripts/refresh_vm.sh develop
``` 

``` bash
journalctl -u ladylinux-api.service -n 200 --no-pager
``` 

<hr> 

### Script Overview

``` bash
install_ladylinux.sh
``` 

Bootstraps a host system for a LadyLinux installation.

**What it does**:

- Creates required runtime directories:
- - /opt/ladylinux/{app,venv,models,containers}
- - /var/lib/ladylinux/{data,cache,logs}
- - /etc/ladylinux/
- Creates the ladylinux service user (unless disabled)
- Sets safe ownership and permissions
- Optionally clones the GitHub repo into /opt/ladylinux/app
- Creates a template /etc/ladylinux/ladylinux.env file if missing

What it does NOT do:

- Install or modify the operating system
- Delete existing data, models, or configuration
- Install systemd service units
- Download LLM model weights

Typical usage:

``` bash
sudo ./scripts/install_ladylinux.sh
sudo ./scripts/install_ladylinux.sh --clone --branch develop
sudo ./scripts/install_ladylinux.sh --dry-run
``` 

<hr>

``` text
refresh_vm.sh
```
Refreshes the LadyLinux application layer from the GitHub repository and restarts the API service.

**What it does**:

- Ensures runtime directories exist (non-destructive)
- Ensures the ladylinux-api.service unit exists:
- - If missing, installs it automatically to /etc/systemd/system/
- Stops the service (unless disabled)
- Hard-aligns /opt/ladylinux/app to origin/<branch>
- Rebuilds or updates the Python virtual environment:
- - Rebuilds when dependency fingerprint changes (default)
- - Can be forced to rebuild every run
- Restarts the service and prints status information

What it does NOT do:

- Reinstall the OS
- Remove or overwrite LLM models (/opt/ladylinux/models)
- Delete persistent application state (/var/lib/ladylinux)
- Overwrite machine configuration (/etc/ladylinux/ladylinux.env)

Typical usage:

``` bash
sudo ./scripts/refresh_vm.sh develop
sudo ./scripts/refresh_vm.sh develop --always-rebuild-venv
sudo ./scripts/refresh_vm.sh develop --dry-run
```

Useful options:

``` bash
--force-unit-install
```

Overwrites an existing systemd unit file (use when the unit definition changes).

``` bash
--unit-source <path>
```
Use a specific service file path from the repo.

``` text
--no-service
```
Performs git sync + venv logic without stopping/starting the systemd service.

<hr>

### Systemd Unit File Location

The refresh script can auto-install the service unit if it is missing.

To support that, keep the unit file in one of these locations in the repo:

``` text
ladylinux-api.service (repo root; recommended)
``` 
or
``` text
scripts/ladylinux-api.service
``` 
The installed location on the host is:
``` text
/etc/systemd/system/ladylinux-api.service
``` 
<hr>

### Conventions for New Scripts

If you add scripts, follow these conventions:

Include a header block describing purpose, usage, assumptions, exit codes

Prefer flags and environment variables over interactive prompts

Avoid destructive operations unless explicitly forced

Print clear status output suitable for log capture

<hr>

### Notes for Contributors:

Do not commit secrets or machine-local configuration

If a script changes behavior or assumptions, update:

- the script header comment
- this README (if it affects usage)
- related docs (docs/INSTALLATION.md, docs/refresh_workflow.md) when the workflow contract changes
