#!/usr/bin/env bash
# ==============================================================================
# LadyLinux Installer
#
# Responsibilities
# - Install system dependencies
# - Clone or update LadyLinux repository
# - Create Python virtual environment
# - Install Python requirements
# - Create desktop launcher integration
# - Create and enable systemd API service
# - Install and configure dedicated Ollama runtime service
#
# Idempotent: safe to run multiple times
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------

REPO_URL="https://github.com/Brown-DJ/LadyLinux_test.git"
BRANCH="${BRANCH:-main}"        # override via: BRANCH=main ./install.sh

APP_ROOT="/opt/ladylinux"
VENV_DIR="$APP_ROOT/venv"

SERVICE_USER="ladylinux"
SERVICE_NAME="ladylinux-api.service"
LLM_SERVICE_NAME="ladylinux-llm.service"
LLM_SERVICE_PATH="/etc/systemd/system/$LLM_SERVICE_NAME"
LLM_SERVICE_TEMPLATE="$SCRIPT_DIR/ladylinux-llm.service"

API_HOST="0.0.0.0"
API_PORT="8000"
OLLAMA_HOST="127.0.0.1:11434"

UVICORN_MODULE="api_layer:app"

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------

log() {
    echo
    echo "[LadyLinux Install] $1"
    echo
}

run_as_service() {
    sudo -u "$SERVICE_USER" -- "$@"
}

while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
echo "Waiting for package manager lock..."
sleep 2
done

# ------------------------------------------------------------------------------
# Root Check
# ------------------------------------------------------------------------------

require_root() {
    if [[ "$EUID" -ne 0 ]]; then
        echo "Run with sudo."
        exit 1
    fi
}
# ------------------------------------------------------------------------------
# Detect Python
# ------------------------------------------------------------------------------

detect_python() {
    if command -v python3.12 >/dev/null 2>&1; then
        echo python3.12
    else
        echo python3
    fi
}

# ------------------------------------------------------------------------------
# Install system dependencies
# ------------------------------------------------------------------------------

install_system_packages() {

    log "Installing system dependencies"

    if command -v apt >/dev/null; then
        apt update -y
        apt install -y git curl ca-certificates build-essential python3 python3-venv python3-pip
        apt install -y dos2unix || true
    elif command -v dnf >/dev/null; then
        dnf install -y git curl gcc python3 python3-venv python3-pip
    elif command -v pacman >/dev/null; then
        pacman -Sy --noconfirm git curl base-devel python python-pip
    else
        echo "Unsupported package manager. Install dependencies manually."
        exit 1
    fi

    log "Ensuring Chromium browser is installed (required for LadyLinux UI)"

    if ! command -v chromium >/dev/null 2>&1 && \
       ! command -v chromium-browser >/dev/null 2>&1; then

        if command -v apt >/dev/null 2>&1; then
            apt install -y chromium-browser fonts-liberation libgtk-3-0 || true
        fi

        if command -v snap >/dev/null 2>&1; then
            snap install chromium || true
        fi
    fi

    log "Installing mDNS service for hostname access (ladylinux.local)"

    if command -v apt >/dev/null 2>&1; then
        apt install -y avahi-daemon libnss-mdns
    fi

    systemctl enable --now avahi-daemon
}
# ------------------------------------------------------------------------------
# Ensure service user
# ------------------------------------------------------------------------------

ensure_service_user() {

    if ! id "$SERVICE_USER" >/dev/null 2>&1; then
        log "Creating service user: $SERVICE_USER"

        useradd \
            --system \
            --create-home \
            --home-dir "/home/$SERVICE_USER" \
            --shell /usr/sbin/nologin \
            "$SERVICE_USER"
    fi
}

set_system_hostname() {

    log "Setting system hostname to ladylinux"

    if [[ "$(hostname)" == "localhost" ]]; then
        hostnamectl set-hostname ladylinux
    fi
}

# ------------------------------------------------------------------------------
# Clone or update repository
# ------------------------------------------------------------------------------

setup_repo() {

    log "Preparing application directory"

    mkdir -p "$APP_ROOT"
    chown "$SERVICE_USER:$SERVICE_USER" "$APP_ROOT"

    log "Ensuring repository"

    if [[ ! -d "$APP_ROOT/.git" ]]; then
        log "Cloning repository"
        run_as_service git clone "$REPO_URL" "$APP_ROOT"
        find "$APP_ROOT" -type f -name "*.sh" -exec dos2unix {} +
        find "$APP_ROOT" -type f -name "*.py" -exec dos2unix {} +
    fi

    run_as_service git -C "$APP_ROOT" fetch origin
    run_as_service git -C "$APP_ROOT" checkout "$BRANCH"
    run_as_service git -C "$APP_ROOT" reset --hard "origin/$BRANCH"
}

# ------------------------------------------------------------------------------
# Python virtual environment
# ------------------------------------------------------------------------------

setup_venv() {

    log "Ensuring Python virtual environment"

    if [[ ! -d "$VENV_DIR" ]]; then

        log "Creating Python virtual environment"

        /usr/bin/python3 -m venv --system-site-packages "$VENV_DIR"

        chown -R "$SERVICE_USER:$SERVICE_USER" "$VENV_DIR"

    fi

    if [[ ! -f "$VENV_DIR/bin/python" ]]; then
        echo "ERROR: Virtual environment creation failed"
        exit 1
    fi

}

# ------------------------------------------------------------------------------
# Install requirements
# ------------------------------------------------------------------------------

install_requirements() {

    log "Installing Python requirements"

    REQUIREMENTS_FILE="$APP_ROOT/requirements.txt"

    if [[ ! -f "$REQUIREMENTS_FILE" ]]; then
        echo "requirements.txt not found"
        exit 1
    fi

    run_as_service "$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools

    run_as_service "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"
}

# ------------------------------------------------------------------------------
# Permissions
# ------------------------------------------------------------------------------

fix_permissions() {

    log "Ensuring consistent permissions"

    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_ROOT"
    mkdir -p /var/lib/ladylinux/{data,cache,logs}
    chown -R "$SERVICE_USER:$SERVICE_USER" /var/lib/ladylinux
}

# ------------------------------------------------------------------------------
# Desktop Launcher Integration
# ------------------------------------------------------------------------------

setup_desktop_launchers() {

    log "Configuring desktop launcher integration"

    run_as_service bash -lc "cat > '$APP_ROOT/launch_ladylinux.sh' <<'EOF'
#!/bin/bash

APP_DIR=\"/opt/ladylinux\"
PYTHON=\"\$APP_DIR/venv/bin/python\"
SCRIPT=\"\$APP_DIR/scripts/testbranchscripts/start_ladylinux.py\"

exec \"\$PYTHON\" \"\$SCRIPT\"
EOF
"
    run_as_service chmod +x "$APP_ROOT/launch_ladylinux.sh"

    cat > /usr/share/applications/ladylinux.desktop <<'EOF'
[Desktop Entry]
Name=Lady Linux
Comment=LadyLinux System Control Interface
Exec=/opt/ladylinux/launch_ladylinux.sh
Icon=utilities-terminal
Terminal=false
Type=Application
Categories=System;Utility;
StartupNotify=true
EOF
}

# ------------------------------------------------------------------------------
# Systemd Service
# ------------------------------------------------------------------------------

create_service() {

    log "Creating systemd service"

    SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"

    cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=LadyLinux API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_ROOT
Environment=PYTHONUNBUFFERED=1

ExecStart=$VENV_DIR/bin/python -m uvicorn $UVICORN_MODULE --host $API_HOST --port $API_PORT

Restart=always
RestartSec=3

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
}

# ------------------------------------------------------------------------------
# Dedicated LLM Service
# ------------------------------------------------------------------------------

create_llm_service() {

    log "Creating dedicated LLM service"

    if [[ -f "$LLM_SERVICE_TEMPLATE" ]]; then
        install -m 0644 "$LLM_SERVICE_TEMPLATE" "$LLM_SERVICE_PATH"
    else
        cat > "$LLM_SERVICE_PATH" <<EOF
[Unit]
Description=LadyLinux LLM Runtime
After=network-online.target

[Service]
ExecStart=/usr/bin/ollama serve
Restart=always
RestartSec=3
User=root
Environment="OLLAMA_HOST=$OLLAMA_HOST"

[Install]
WantedBy=multi-user.target
EOF
    fi

    systemctl daemon-reload
    systemctl enable "$LLM_SERVICE_NAME"
    systemctl restart "$LLM_SERVICE_NAME"
}

# ------------------------------------------------------------------------------
# Start service
# ------------------------------------------------------------------------------

start_service() {

    log "Starting LadyLinux API"

    systemctl restart "$SERVICE_NAME"

    systemctl --no-pager --full status "$SERVICE_NAME" || true
}

# ------------------------------------------------------------------------------
# Install Ollama runtime and wire dedicated LLM service
# ------------------------------------------------------------------------------

install_ollama() {

    if ! command -v ollama >/dev/null 2>&1; then
        log "Installing Ollama runtime"
        curl -fsSL https://ollama.com/install.sh | sh
    fi

    create_llm_service

    log "Waiting for LLM API to start..."
    until curl -s http://127.0.0.1:11434 >/dev/null; do
        sleep 2
    done

    log "Verifying LLM service"
    systemctl --no-pager --full status "$LLM_SERVICE_NAME" || true
    curl --silent --show-error --fail "http://127.0.0.1:11434" >/dev/null \
        && log "LLM health check passed: Ollama is running" \
        || log "LLM health check warning: endpoint did not respond yet"

    log "Ensuring Ollama embedding model is installed..."

    if ! ollama list | grep -q "nomic-embed-text"; then
        log "Pulling embedding model: nomic-embed-text"
        ollama pull nomic-embed-text
    fi

    log "Ensuring Mistral model is installed..."

    if ! ollama list | grep -q "^mistral"; then
        log "Pulling LLM model: mistral"
        ollama pull mistral
    fi
}



# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

main() {

    require_root

    cd /

    install_system_packages

    ensure_service_user

    set_system_hostname

    setup_repo

    setup_venv

    fix_permissions

    install_requirements

    setup_desktop_launchers

    create_service

    install_ollama

    start_service

    log "Installation complete"

    echo "API endpoint:"
    echo "http://127.0.0.1:$API_PORT"
    echo
    echo "View logs:"
    echo "journalctl -u $SERVICE_NAME -f"
}

main
