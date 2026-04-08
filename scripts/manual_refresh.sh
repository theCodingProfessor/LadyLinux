#!/usr/bin/env bash
set -Eeuo pipefail

# ── Must match install_ladylinux.sh exactly ───────────────────────────────────
REPO_URL="https://github.com/Brown-DJ/LadyLinux_test.git"   # FIX 1: was missing entirely
BRANCH="${1:-main}"

APP_DIR="/opt/ladylinux/app"
VENV_DIR="/opt/ladylinux/venv"
SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"                                    # FIX 3: installer uses a named group

API_SERVICE="ladylinux-api.service"
LLM_SERVICE="ollama.service"   # Must match install_ladylinux.sh
API_PORT="8000"

ENV_FILE="/etc/ladylinux/ladylinux.env"                      # FIX 10: installer writes this; reference it

log()  { echo "[refresh] $*"; }
warn() { echo "[refresh][WARN] $*" >&2; }
die()  { echo "[refresh][ERROR] $*" >&2; exit 1; }

# ── FIX 2: require_root() must run FIRST — original called chown before this ──
require_root() {
    if [[ "$EUID" -ne 0 ]]; then
        die "Run with sudo"
    fi
}

stop_services() {
    log "Stopping LadyLinux services"
    systemctl stop "$API_SERVICE" || true
    systemctl stop "$LLM_SERVICE" || true   # ollama.service
    pkill -f "uvicorn" || true
    sleep 2                                 # give ports time to free
}

sync_repo() {
    log "Updating repository"

    # FIX 6: ladylinux user has shell=/usr/sbin/nologin after install.
    # Temporarily restore /bin/bash so git commands work, same as installer does.
    usermod -s /bin/bash "$SERVICE_USER"

    # FIX 8: safe.directory must be set AFTER the shell is restored to /bin/bash,
    # otherwise sudo -u ladylinux is rejected by nologin and the config is never written.
    # Also set it for root so the final rev-parse (which runs as root) works too.
    sudo -u "$SERVICE_USER" git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
    git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

    cd "$APP_DIR"

    # FIX 1: validate the remote URL matches, correct it if not
    local current_remote
    current_remote="$(sudo -u "$SERVICE_USER" git remote get-url origin 2>/dev/null || true)"
    if [[ "$current_remote" != "$REPO_URL" ]]; then
        log "Correcting remote origin to $REPO_URL"
        if sudo -u "$SERVICE_USER" git remote | grep -Fxq origin; then
            sudo -u "$SERVICE_USER" git remote set-url origin "$REPO_URL"
        else
            sudo -u "$SERVICE_USER" git remote add origin "$REPO_URL"
        fi
    fi

    sudo -u "$SERVICE_USER" git fetch --prune origin

    # Validate branch exists before hard-reset (mirrors installer guard)
    if ! sudo -u "$SERVICE_USER" git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
        usermod -s /usr/sbin/nologin "$SERVICE_USER"
        die "Branch '$BRANCH' not found on remote. Aborting before reset."
    fi

    sudo -u "$SERVICE_USER" git checkout -f "$BRANCH" 2>/dev/null || true
    sudo -u "$SERVICE_USER" git reset --hard "origin/$BRANCH"
    sudo -u "$SERVICE_USER" git clean -fd

    # FIX 6: restore nologin shell after git ops, same as installer
    usermod -s /usr/sbin/nologin "$SERVICE_USER"

    log "Repo now at: $(git -C "$APP_DIR" rev-parse --short HEAD) ($BRANCH)"
}

repair_venv() {
    log "Checking Python environment"

    if [[ ! -f "$VENV_DIR/bin/python" ]]; then
        log "Broken or missing venv — rebuilding"

        rm -rf "$VENV_DIR"
        mkdir -p "$VENV_DIR"
        # FIX 3/4: use SERVICE_GROUP, not SERVICE_USER:SERVICE_USER
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "$VENV_DIR"

        # FIX 5: installer tries python3.12 → 3.11 → python3; match that priority
        local python_bin=""
        for candidate in python3.12 python3.11 python3; do
            if command -v "$candidate" >/dev/null 2>&1; then
                python_bin="$candidate"
                break
            fi
        done
        [[ -n "$python_bin" ]] || die "No Python 3 interpreter found."

        # FIX 6: venv creation needs a real shell on the service user
        usermod -s /bin/bash "$SERVICE_USER"
        sudo -u "$SERVICE_USER" "$python_bin" -m venv "$VENV_DIR"
        usermod -s /usr/sbin/nologin "$SERVICE_USER"
    fi
}

install_dependencies() {
    log "Installing dependencies"

    # FIX 11: original ran the pip upgrade as root, then install as service user.
    # Both steps must run as the service user so the venv stays correctly owned.
    usermod -s /bin/bash "$SERVICE_USER"

    sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install --upgrade pip wheel setuptools --quiet

    if [[ -f "$APP_DIR/requirements.txt" ]]; then
        sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt" --quiet
    else
        warn "No requirements.txt found — installing default runtime stack"
        sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install \
            fastapi uvicorn requests jinja2 python-multipart pydantic --quiet
    fi

    usermod -s /usr/sbin/nologin "$SERVICE_USER"
}

fix_permissions() {
    # FIX 9: installer runs a full fix_permissions step; refresher was skipping it entirely.
    # After a git clean + venv rebuild, ownership can drift — realign it.
    log "Fixing ownership and permissions"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$VENV_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" /var/lib/ladylinux

    # Re-run dos2unix on any .sh files pulled in by git sync
    if command -v dos2unix >/dev/null 2>&1; then
        find "$APP_DIR" -name "*.sh" -type f | while read -r f; do
            dos2unix "$f" 2>/dev/null || true
            chmod +x "$f"
        done
    else
        find "$APP_DIR" -name "*.sh" -type f -exec chmod +x {} \;
    fi
}

restart_services() {
    log "Reloading systemd"
    systemctl daemon-reload

    # ── mDNS — ensure avahi is up after any reboot or service wipe ──
    if systemctl is-enabled avahi-daemon >/dev/null 2>&1; then
        systemctl start avahi-daemon 2>/dev/null || true
    else
        log "avahi-daemon not installed — skipping mDNS (run installer to enable)"
    fi

    log "Ensuring $LLM_SERVICE is running"
    systemctl start "$LLM_SERVICE" || warn "Could not start $LLM_SERVICE"

    log "Restarting API service"
    systemctl restart "$API_SERVICE"
}

validate_api() {
    log "Waiting for API on port $API_PORT"
    sleep 3

    local attempts=15
    local ready=0
    while (( attempts > 0 )); do
        # FIX 12: installer uses lsof OR ss; use both for robustness
        if lsof -i :"$API_PORT" >/dev/null 2>&1 || \
           ss -tlnp 2>/dev/null | grep -q ":$API_PORT "; then
            ready=1
            break
        fi
        sleep 1
        (( attempts-- ))
    done

    if [[ "$ready" -ne 1 ]]; then
        # FIX 12: original did exit 1 here — match installer's warn-and-continue
        warn "Port $API_PORT not listening after timeout."
        warn "  journalctl -u $API_SERVICE -n 50 --no-pager"
        warn "  journalctl -u $LLM_SERVICE -n 20 --no-pager"
        return 0
    fi

    log "Port $API_PORT is open."
    curl --silent --fail --max-time 5 "http://127.0.0.1:$API_PORT/" >/dev/null 2>&1 \
        && log "HTTP health check: OK" \
        || warn "Process listening but HTTP health check failed — may still be starting."
}

main() {
    # FIX 2: root check is the absolute first thing — original called chown before this
    require_root

    # FIX 2 (continued): APP_DIR ownership reset now lives here, safely after root check
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR" || true

    stop_services
    sync_repo
    repair_venv
    install_dependencies
    fix_permissions
    restart_services
    validate_api

    log "Refresh complete. Branch: $BRANCH  Commit: $(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}

main "$@"