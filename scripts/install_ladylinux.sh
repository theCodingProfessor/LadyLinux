#!/usr/bin/env bash
#===============================================================================
# LadyLinux Unified Installer
# File: setup_ladylinux.sh
# Repo: Brown-DJ/LadyLinux_test  Branch: main
#
# Purpose:
#   Full bootstrap of a LadyLinux system from a bare Linux Mint install:
#     1)  Pre-flight checks (root, OS, internet)
#     2)  System packages
#     3)  Service user + directory layout
#     4)  Hostname (sets to "ladylinux" if currently "localhost")
#     5)  Clone / refresh repo (Brown-DJ/LadyLinux_test @ main)
#     6)  Python venv (3.12 → 3.11 → 3) + dependencies
#     7)  Ownership / permissions / dos2unix all .sh files
#     8)  Ollama install + pull mistral + nomic-embed-text
#     9)  Systemd units (ladylinux-api.service + ladylinux-llm.service)
#    10)  launch_ladylinux.sh + .desktop entry
#    11)  Start services + runtime validation
#    12)  Print access URLs
#
# Usage:
#   sudo bash setup_ladylinux.sh
#
# Exit codes:
#   0  success
#   1  generic failure
#   2  missing prerequisite / invalid environment
#===============================================================================

set -Eeuo pipefail

#===============================================================================
# CONFIGURATION
#===============================================================================

REPO_URL="https://github.com/Brown-DJ/LadyLinux_test.git"
BRANCH="main"

SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"
TARGET_HOSTNAME="ladylinux"

BASE_DIR="/opt/ladylinux"
APP_DIR="$BASE_DIR/app"
VENV_DIR="$BASE_DIR/venv"
MODELS_DIR="$BASE_DIR/models"
CONTAINERS_DIR="$BASE_DIR/containers"

ETC_DIR="/etc/ladylinux"
ENV_FILE="$ETC_DIR/ladylinux.env"

VAR_DIR="/var/lib/ladylinux"
DATA_DIR="$VAR_DIR/data"
CACHE_DIR="$VAR_DIR/cache"
LOGS_DIR="$VAR_DIR/logs"

API_PORT="8000"
API_SERVICE="ladylinux-api.service"
LLM_SERVICE="ladylinux-llm.service"

LAUNCH_SCRIPT="/usr/local/bin/launch_ladylinux.sh"
DESKTOP_FILE="/usr/share/applications/ladylinux.desktop"

FALLBACK_LOG="$LOGS_DIR/uvicorn-install.log"

#===============================================================================
# HELPERS
#===============================================================================

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

log()     { printf "${GREEN}[setup]${NC} %s\n" "$*"; }
warn()    { printf "${YELLOW}[setup][WARN]${NC} %s\n" "$*" >&2; }
die()     { printf "${RED}[setup][ERROR]${NC} %s\n" "$*" >&2; exit "${2:-1}"; }
section() { printf "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${CYAN}  %s${NC}\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" "$*"; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

run_as_service() { sudo -u "$SERVICE_USER" -- "$@"; }

#===============================================================================
# STEP 1 — PRE-FLIGHT
#===============================================================================

preflight() {
    section "Step 1 — Pre-flight checks"

    # Root check
    if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
        die "Please run as root:  sudo bash $0" 2
    fi
    log "Running as root: OK"

    # OS check — warn but don't abort for non-Mint systems
    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        log "Detected OS: ${PRETTY_NAME:-unknown}"
        if [[ "${ID:-}" != "linuxmint" && "${ID_LIKE:-}" != *"ubuntu"* && "${ID_LIKE:-}" != *"debian"* ]]; then
            warn "This installer is designed for Linux Mint / Ubuntu / Debian derivatives."
            warn "Continuing anyway — some steps may fail on unsupported distros."
        fi
    else
        warn "Could not detect OS (no /etc/os-release). Proceeding cautiously."
    fi

    # Internet check
    log "Checking internet connectivity..."
    if ! curl --silent --max-time 10 --head https://github.com >/dev/null 2>&1; then
        die "No internet access. Please check your network connection and retry." 2
    fi
    log "Internet connectivity: OK"

    log "Pre-flight checks passed."
}

#===============================================================================
# STEP 2 — SYSTEM PACKAGES
#===============================================================================

install_system_packages() {
    section "Step 2 — System packages"

    log "Updating package lists..."
    apt-get update -qq

    log "Upgrading installed packages..."
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

    PACKAGES=(
        git
        curl
        dos2unix
        lsof
        avahi-daemon
        chromium-browser
        python3
        python3-venv
        python3-pip
        python3.12
        python3.12-venv
        systemd
        build-essential
    )

    log "Installing required packages: ${PACKAGES[*]}"
    # Some packages (e.g. python3.12) may not exist on older Ubuntu LTS; tolerate failure
    for pkg in "${PACKAGES[@]}"; do
        if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" 2>/dev/null; then
            log "  Installed: $pkg"
        else
            warn "  Could not install $pkg — skipping (may not be available on this release)"
        fi
    done

    # Update DNS for reliable model downloads (mirrors Darrius installer)
    log "Updating DNS settings for reliable downloads..."
    if [[ -f /etc/systemd/resolved.conf ]]; then
        cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.bak
        sed -i 's/^#\?DNS=.*$/DNS=1.1.1.1 8.8.8.8/'         /etc/systemd/resolved.conf
        sed -i 's/^#\?FallbackDNS=.*$/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf
        systemctl restart systemd-resolved 2>/dev/null || true
        log "DNS updated: 1.1.1.1 / 8.8.8.8 (fallback 8.8.4.4)"
    else
        warn "/etc/systemd/resolved.conf not found — skipping DNS update"
    fi

    log "System packages installed."
}

#===============================================================================
# STEP 3 — SERVICE USER + DIRECTORY LAYOUT
#===============================================================================

create_user_and_dirs() {
    section "Step 3 — Service user + directory layout"

    # Group
    if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
        log "Group already exists: $SERVICE_GROUP"
    else
        groupadd --system "$SERVICE_GROUP"
        log "Created group: $SERVICE_GROUP"
    fi

    # User
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        log "User already exists: $SERVICE_USER"
    else
        useradd \
            --system \
            --gid "$SERVICE_GROUP" \
            --create-home \
            --home-dir /home/ladylinux \
            --shell /usr/sbin/nologin \
            "$SERVICE_USER"
        log "Created system user: $SERVICE_USER (home: /home/ladylinux)"
    fi

    # Ensure home dir exists with correct ownership
    mkdir -p /home/ladylinux
    chown "$SERVICE_USER":"$SERVICE_GROUP" /home/ladylinux
    chmod 0750 /home/ladylinux

    # Create directory tree
    for d in \
        "$BASE_DIR" "$APP_DIR" "$VENV_DIR" "$MODELS_DIR" "$CONTAINERS_DIR" \
        "$ETC_DIR" \
        "$VAR_DIR" "$DATA_DIR" "$CACHE_DIR" "$LOGS_DIR"
    do
        if [[ -d "$d" ]]; then
            log "Directory exists: $d"
        else
            mkdir -p "$d"
            log "Created directory: $d"
        fi
    done

    # .env template (never overwrite)
    if [[ -f "$ENV_FILE" ]]; then
        log "Env file exists (not modified): $ENV_FILE"
    else
        cat > "$ENV_FILE" <<'ENVEOF'
# LadyLinux environment configuration
# Location: /etc/ladylinux/ladylinux.env
# This file is machine-local — keep secrets out of Git.

LADYLINUX_HOST=0.0.0.0
LADYLINUX_PORT=8000
LADYLINUX_MODELS_DIR=/opt/ladylinux/models
LADYLINUX_STATE_DIR=/var/lib/ladylinux/data
LADYLINUX_ENV=production
ENVEOF
        log "Created env template: $ENV_FILE"
    fi

    log "User and directories ready."
}

#===============================================================================
# STEP 4 — HOSTNAME
#===============================================================================

set_hostname() {
    section "Step 4 — Hostname"

    local current_hostname
    current_hostname="$(hostname)"

    if [[ "$current_hostname" == "localhost" || "$current_hostname" == "localhost.localdomain" ]]; then
        log "Current hostname is '$current_hostname' — changing to '$TARGET_HOSTNAME'"
        hostnamectl set-hostname "$TARGET_HOSTNAME"
        # Update /etc/hosts so sudo doesn't warn about unknown hostname
        if ! grep -q "$TARGET_HOSTNAME" /etc/hosts; then
            echo "127.0.1.1  $TARGET_HOSTNAME" >> /etc/hosts
        fi
        log "Hostname set to: $TARGET_HOSTNAME"
    else
        log "Current hostname is '$current_hostname' — leaving unchanged (not 'localhost')"
    fi
}

#===============================================================================
# STEP 5 — CLONE / REFRESH REPO
#===============================================================================

sync_repo() {
    section "Step 5 — Clone / refresh repo ($REPO_URL @ $BRANCH)"

    # Temporarily give ladylinux a shell for git operations
    usermod -s /bin/bash "$SERVICE_USER"

    # Configure git safe.directory
    run_as_service git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

    if [[ -d "$APP_DIR/.git" ]]; then
        log "Existing repo found — syncing to origin/$BRANCH"

        pushd "$APP_DIR" >/dev/null

        # Fix remote URL if needed
        local current_remote
        current_remote="$(run_as_service git remote get-url origin 2>/dev/null || true)"
        if [[ "$current_remote" != "$REPO_URL" ]]; then
            if run_as_service git remote | grep -Fxq origin; then
                run_as_service git remote set-url origin "$REPO_URL"
            else
                run_as_service git remote add origin "$REPO_URL"
            fi
            log "Remote origin set to: $REPO_URL"
        fi

        run_as_service git fetch --prune origin

        # Validate branch exists on remote before hard-reset
        if ! run_as_service git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
            printf "${RED}[setup][ERROR]${NC} Branch '%s' not found on remote.\n" "$BRANCH" >&2
            log "Available remote branches:"
            run_as_service git branch -r || true
            popd >/dev/null
            die "Aborting — refusing to hard-reset to a non-existent branch." 1
        fi

        run_as_service git checkout -f "$BRANCH" 2>/dev/null || true
        run_as_service git reset --hard "origin/$BRANCH"
        run_as_service git clean -fd

        popd >/dev/null
        log "Repo updated to: $(cd "$APP_DIR" && run_as_service git rev-parse --short HEAD) ($BRANCH)"

    else
        log "No existing repo — cloning..."

        # APP_DIR must be empty for clone
        if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
            warn "$APP_DIR is non-empty but has no .git — clearing it before clone"
            rm -rf "$APP_DIR"
            mkdir -p "$APP_DIR"
        fi

        git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
        chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$APP_DIR"
        log "Cloned repo to: $APP_DIR"
    fi

    # Restore secure shell
    usermod -s /usr/sbin/nologin "$SERVICE_USER"
    log "Repo sync complete."
}

#===============================================================================
# STEP 6 — PYTHON VENV + DEPENDENCIES
#===============================================================================

build_venv() {
    section "Step 6 — Python venv + dependencies"

    # Auto-pick best available python
    local python_bin=""
    for candidate in python3.12 python3.11 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            python_bin="$candidate"
            log "Using Python: $(command -v $candidate) ($(${candidate} --version 2>&1))"
            break
        fi
    done
    [[ -n "$python_bin" ]] || die "No Python 3 interpreter found. Install python3 and retry."

    local pip_bin="$VENV_DIR/bin/pip"

    log "Building venv at $VENV_DIR (as $SERVICE_USER)..."
    rm -rf "$VENV_DIR"
    mkdir -p "$VENV_DIR"
    chown "$SERVICE_USER":"$SERVICE_GROUP" "$VENV_DIR"

    # Temporarily allow shell for venv creation
    usermod -s /bin/bash "$SERVICE_USER"

    run_as_service "$python_bin" -m venv "$VENV_DIR"
    run_as_service "$pip_bin" install --upgrade pip wheel setuptools --quiet

    pushd "$APP_DIR" >/dev/null

    if [[ -f "requirements.txt" ]]; then
        log "Installing from requirements.txt..."
        run_as_service "$pip_bin" install -r requirements.txt --quiet
    elif [[ -f "pyproject.toml" ]]; then
        log "pyproject.toml found — installing default runtime stack..."
        run_as_service "$pip_bin" install fastapi uvicorn requests jinja2 python-multipart pydantic --quiet
    else
        log "No dependency manifest found — installing default runtime stack..."
        run_as_service "$pip_bin" install fastapi uvicorn requests jinja2 python-multipart pydantic --quiet
    fi

    popd >/dev/null

    # Restore secure shell
    usermod -s /usr/sbin/nologin "$SERVICE_USER"

    log "Python environment ready."
}

#===============================================================================
# STEP 7 — OWNERSHIP, PERMISSIONS, DOS2UNIX
#===============================================================================

fix_permissions() {
    section "Step 7 — Ownership, permissions, line endings"

    chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$BASE_DIR"
    chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$VAR_DIR"
    chown -R root:"$SERVICE_GROUP"            "$ETC_DIR"

    chmod 0755 "$BASE_DIR"
    chmod 0755 "$APP_DIR" "$VENV_DIR" "$CONTAINERS_DIR"
    chmod 0750 "$MODELS_DIR"
    chmod 0755 "$VAR_DIR"
    chmod 0750 "$DATA_DIR" "$CACHE_DIR" "$LOGS_DIR"
    chmod 0750 "$ETC_DIR"
    chmod 0640 "$ENV_FILE" 2>/dev/null || true

    # Make every .sh file in the repo executable + fix line endings
    log "Fixing line endings and permissions on .sh files..."
    if command -v dos2unix >/dev/null 2>&1; then
        find "$APP_DIR" -name "*.sh" -type f | while read -r f; do
            dos2unix "$f" 2>/dev/null || true
            chmod +x "$f"
            log "  Fixed: $f"
        done
    else
        warn "dos2unix not available — skipping CRLF conversion"
        find "$APP_DIR" -name "*.sh" -type f -exec chmod +x {} \;
    fi

    log "Permissions set."
}

#===============================================================================
# STEP 8 — OLLAMA + MODELS
#===============================================================================

install_ollama_and_models() {
    section "Step 8 — Ollama + model pull (mistral, nomic-embed-text)"

    if command -v ollama >/dev/null 2>&1; then
        log "Ollama already installed: $(ollama --version 2>/dev/null || true)"
    else
        log "Installing Ollama..."
        curl -fsSL https://ollama.com/install.sh | sh
        log "Ollama installed."
    fi

    log "Enabling and starting Ollama service..."
    systemctl enable ollama 2>/dev/null || true
    systemctl start  ollama
    sleep 3

    # Pull models (ollama pull is idempotent)
    log "Pulling mistral LLM (this may take several minutes)..."
    ollama pull mistral

    log "Pulling nomic-embed-text model..."
    ollama pull nomic-embed-text

    log "Models ready."
}

#===============================================================================
# STEP 9 — SYSTEMD UNITS
#===============================================================================

write_systemd_units() {
    section "Step 9 — Systemd service units"

    # ── ladylinux-llm.service ──────────────────────────────────────────────────
    log "Writing $LLM_SERVICE..."
    cat > "/etc/systemd/system/$LLM_SERVICE" <<LLMEOF
[Unit]
Description=LadyLinux LLM Runtime (Ollama / Mistral)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/ollama serve
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ladylinux-llm

[Install]
WantedBy=multi-user.target
LLMEOF

    # ── ladylinux-api.service ──────────────────────────────────────────────────
    log "Writing $API_SERVICE..."
    cat > "/etc/systemd/system/$API_SERVICE" <<APIEOF
[Unit]
Description=LadyLinux FastAPI Server
After=network-online.target $LLM_SERVICE
Wants=network-online.target
Requires=$LLM_SERVICE

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ENV_FILE
Environment="PATH=$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$VENV_DIR/bin/uvicorn api_layer:app --host 0.0.0.0 --port $API_PORT
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ladylinux-api

[Install]
WantedBy=multi-user.target
APIEOF

    systemctl daemon-reload
    systemctl enable "$LLM_SERVICE"
    systemctl enable "$API_SERVICE"
    log "Systemd units written and enabled."
}

#===============================================================================
# STEP 10 — LAUNCH SCRIPT + DESKTOP ENTRY
#===============================================================================

write_launch_and_desktop() {
    section "Step 10 — Launch script + .desktop entry"

    log "Writing $LAUNCH_SCRIPT..."
    cat > "$LAUNCH_SCRIPT" <<'LAUNCHEOF'
#!/usr/bin/env bash
set -euo pipefail

echo "Launching LadyLinux..."

# Ensure Ollama is running
if ! systemctl is-active --quiet ollama 2>/dev/null && \
   ! systemctl is-active --quiet ladylinux-llm.service 2>/dev/null; then
    sudo systemctl start ollama 2>/dev/null || sudo systemctl start ladylinux-llm.service 2>/dev/null || true
fi

# Ensure API is running
if ! pgrep -f "uvicorn api_layer:app" >/dev/null 2>&1; then
    sudo systemctl start ladylinux-api.service 2>/dev/null || true
    sleep 3
fi

URL="http://localhost:8000"

# Open browser
if command -v chromium-browser >/dev/null 2>&1; then
    chromium-browser --app="$URL" --class=LadyLinuxApp &
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" &
else
    echo "Please open your browser and visit: $URL"
fi

echo "LadyLinux launched at $URL"
LAUNCHEOF

    chmod +x "$LAUNCH_SCRIPT"
    log "Launch script written: $LAUNCH_SCRIPT"

    log "Writing $DESKTOP_FILE..."
    cat > "$DESKTOP_FILE" <<DESKTOPEOF
[Desktop Entry]
Version=1.0
Type=Application
Name=LadyLinux
Comment=LadyLinux LLM Chat Interface
Exec=$LAUNCH_SCRIPT
Icon=utilities-terminal
Terminal=false
Categories=Utility;AI;
Keywords=LLM;AI;Chat;Mistral;
StartupNotify=true
DESKTOPEOF

    chmod 0644 "$DESKTOP_FILE"
    log "Desktop entry written: $DESKTOP_FILE"

    # Update desktop database if available
    update-desktop-database 2>/dev/null || true
}

#===============================================================================
# STEP 11 — START SERVICES + RUNTIME VALIDATION
#===============================================================================

start_and_validate() {
    section "Step 11 — Start services + validation"

    log "Starting $LLM_SERVICE..."
    systemctl start "$LLM_SERVICE" || warn "Could not start $LLM_SERVICE — check: journalctl -u $LLM_SERVICE"

    log "Starting $API_SERVICE..."
    systemctl start "$API_SERVICE" || {
        warn "systemd start failed — attempting fallback uvicorn startup..."
        mkdir -p "$(dirname "$FALLBACK_LOG")"
        touch "$FALLBACK_LOG"
        chown "$SERVICE_USER":"$SERVICE_GROUP" "$FALLBACK_LOG"
        sudo -u "$SERVICE_USER" bash -c \
            "cd '$APP_DIR' && nohup '$VENV_DIR/bin/uvicorn' api_layer:app \
             --host 0.0.0.0 --port $API_PORT >> '$FALLBACK_LOG' 2>&1 &"
    }

    # Wait for port 8000 to open (up to 20 seconds)
    log "Waiting for API to become available on port $API_PORT..."
    local attempts=20
    local ready=0
    while (( attempts > 0 )); do
        if lsof -i :"$API_PORT" >/dev/null 2>&1 || \
           ss -tlnp 2>/dev/null | grep -q ":$API_PORT "; then
            ready=1
            break
        fi
        sleep 1
        (( attempts-- ))
    done

    if [[ "$ready" -ne 1 ]]; then
        warn "Port $API_PORT is not yet listening after 20s."
        warn "Check logs:"
        warn "  journalctl -u $API_SERVICE -n 50 --no-pager"
        warn "  cat $FALLBACK_LOG"
    else
        log "Port $API_PORT is open — API is running."

        if command -v curl >/dev/null 2>&1; then
            if curl --silent --fail --max-time 5 "http://127.0.0.1:$API_PORT/" >/dev/null 2>&1; then
                log "HTTP health check: OK (200 response from localhost:$API_PORT)"
            else
                warn "Process is listening but HTTP health check did not return 200."
                warn "The app may still be initialising — try again in a moment."
            fi
        fi
    fi
}

#===============================================================================
# STEP 12 — PRINT ACCESS URLS
#===============================================================================

print_access_urls() {
    section "Step 12 — Access URLs"

    local lan_ip=""
    lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

    printf "\n"
    printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}\n"
    printf "${GREEN}║           LadyLinux Installation Complete!                  ║${NC}\n"
    printf "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}\n"
    printf "${GREEN}║${NC}  Localhost:  ${CYAN}http://localhost:$API_PORT${NC}\n"
    if [[ -n "$lan_ip" ]]; then
    printf "${GREEN}║${NC}  LAN IP:     ${CYAN}http://$lan_ip:$API_PORT${NC}\n"
    fi
    printf "${GREEN}║${NC}  mDNS:       ${CYAN}http://ladylinux.local:$API_PORT${NC}\n"
    printf "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}\n"
    printf "${GREEN}║${NC}  Launch app: ${CYAN}$LAUNCH_SCRIPT${NC}\n"
    printf "${GREEN}║${NC}  API logs:   ${CYAN}journalctl -u $API_SERVICE -f${NC}\n"
    printf "${GREEN}║${NC}  LLM logs:   ${CYAN}journalctl -u $LLM_SERVICE -f${NC}\n"
    printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    printf "\n"

    log "Setup finished successfully."
}

#===============================================================================
# MAIN
#===============================================================================

main() {
    preflight
    install_system_packages
    create_user_and_dirs
    set_hostname
    sync_repo
    build_venv
    fix_permissions
    install_ollama_and_models
    write_systemd_units
    write_launch_and_desktop
    start_and_validate
    print_access_urls
}

main "$@"