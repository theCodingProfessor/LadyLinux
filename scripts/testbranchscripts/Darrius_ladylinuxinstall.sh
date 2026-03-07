#!/usr/bin/env bash
# ==============================================================================
# LadyLinux Installer
#
# Responsibilities
# - Install system dependencies
# - Clone or update LadyLinux repository
# - Create Python virtual environment
# - Install Python requirements
# - Create and enable systemd API service
# - Optionally install Ollama runtime
#
# Idempotent: safe to run multiple times
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------

REPO_URL="https://github.com/theCodingProfessor/LadyLinux.git"
BRANCH="${BRANCH:-darrius}"        # override via: BRANCH=main ./install.sh

APP_ROOT="/opt/ladylinux"
VENV_DIR="$APP_ROOT/venv"

SERVICE_USER="ladylinux"
SERVICE_NAME="ladylinux-api.service"

API_HOST="0.0.0.0"
API_PORT="8000"

UVICORN_MODULE="api_layer:app"

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------

log() {
    echo
    echo "[LadyLinux Install] $1"
    echo
}

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

    apt update -y

    apt install -y \
        git \
        curl \
        ca-certificates \
        build-essential \
        python3 \
        python3-venv \
        python3-pip \
        systemd
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

# ------------------------------------------------------------------------------
# Clone or update repository
# ------------------------------------------------------------------------------

setup_repo() {

    log "Preparing repository"

    if [[ ! -d "$APP_ROOT/.git" ]]; then

        log "Cloning repository"

        rm -rf "$APP_ROOT"

        git clone "$REPO_URL" "$APP_ROOT"

    fi

    cd "$APP_ROOT"

    git fetch origin

    git checkout "$BRANCH"

    git reset --hard "origin/$BRANCH"
}

# ------------------------------------------------------------------------------
# Python virtual environment
# ------------------------------------------------------------------------------

setup_venv() {

    PYTHON_BIN=$(detect_python)

    if [[ ! -d "$VENV_DIR" ]]; then

        log "Creating Python virtual environment"

        $PYTHON_BIN -m venv "$VENV_DIR"

    fi

    "$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools
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

    "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"

    log "Verifying qdrant-client"

    "$VENV_DIR/bin/python" -c "import qdrant_client; print('qdrant_client OK')"
}

# ------------------------------------------------------------------------------
# Permissions
# ------------------------------------------------------------------------------

fix_permissions() {

    log "Setting directory ownership"

    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_ROOT"
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
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_ROOT
Environment=PYTHONUNBUFFERED=1

ExecStart=$VENV_DIR/bin/uvicorn $UVICORN_MODULE --host $API_HOST --port $API_PORT

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
# Start service
# ------------------------------------------------------------------------------

start_service() {

    log "Starting LadyLinux API"

    systemctl restart "$SERVICE_NAME"

    systemctl --no-pager --full status "$SERVICE_NAME" || true
}

# ------------------------------------------------------------------------------
# Install Ollama (optional runtime)
# ------------------------------------------------------------------------------

install_ollama() {

    if ! command -v ollama >/dev/null 2>&1; then
        log "Installing Ollama runtime"
        curl -fsSL https://ollama.com/install.sh | sh
    fi

    systemctl enable --now ollama || true

    log "Waiting for Ollama API to start..."
    sleep 3

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

    install_system_packages

    ensure_service_user

    setup_repo

    setup_venv

    install_requirements

    fix_permissions

    create_service

    start_service

    install_ollama

    log "Installation complete"

    echo "API endpoint:"
    echo "http://127.0.0.1:$API_PORT"
    echo
    echo "View logs:"
    echo "journalctl -u $SERVICE_NAME -f"
}

main


