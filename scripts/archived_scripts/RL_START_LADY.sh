RL_START_LADY.SH
# See REFRESH_UPDATE.SH at End

# Author: Ryan Little
# April 2024

#!/usr/bin/env bash

#===============================================================================
# LadyLinux Installation Script - User Friendly Edition
# File: start_lady.sh
#
# Purpose:
#   Idempotent installation script that checks existing system state before
#   installing components. Safe to run multiple times. Each step includes
#   clear explanations of what it does and why it's needed.
#
# Usage:
#   sudo ./start_lady.sh
#===============================================================================

set -euo pipefail

#----- Configuration Variables (consistent with install_ladylinux.sh) -----

BASE_DIR="/opt/ladylinux"
APP_DIR="$BASE_DIR/app"
VENV_DIR="$BASE_DIR/venv"
MODELS_DIR="$BASE_DIR/models"

ETC_DIR="/etc/ladylinux"
ENV_FILE="$ETC_DIR/ladylinux.env"

LOG_DIR="/var/log/ladylinux"
SUDOERS_FILE="/etc/sudoers.d/ladylinux-firewall"

SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"
SERVICE_NAME="ladylinux-api.service"

#----- Helper Functions -----

log()  { printf "[install] %s\n" "$*"; }
warn() { printf "[install][WARN] %s\n" "$*" >&2; }

mkdir_safe() {
  local d="$1"
  if [[ -d "$d" ]]; then
    log "Directory exists: $d"
  else
    log "Creating directory: $d"
    mkdir -p "$d"
  fi
}

echo "========================================================================="
echo "  Welcome to the LadyLinux Installation Wizard"
echo "  This script sets up a complete AI-powered Linux assistant with:"
echo "  - Fast Python environment (uv)"
echo "  - Local AI models (Ollama + Mistral)"
echo "  - Secure web API service"
echo "========================================================================="
echo ""

# --- Step 1: Update package index ---
echo "[1/13] Updating APT package index..."
echo "    Why: Ensures we have the latest package information for installations."
sudo apt update -qq
echo "    Package index updated."

# --- Step 2: Check/apply system upgrades ---
echo "[2/13] Checking for system security upgrades..."
echo "    Why: Keeps your system secure with latest patches and bug fixes."
UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c upgradable || true)
if [ "$UPGRADABLE" -gt 1 ]; then
    echo "    Found $((UPGRADABLE - 1)) upgradable packages. Applying upgrades..."
    sudo apt upgrade -y
    echo "    System upgraded."
else
    echo "    System up to date. No upgrades needed."
fi

# --- Step 3: Configure reliable DNS ---
echo "[3/13] Configuring fast, privacy-focused DNS (Cloudflare + Google)..."
echo "    Why: Improves internet speed/reliability for downloading models/packages."
if ! grep -q "^DNS=1.1.1.1 8.8.8.8" /etc/systemd/resolved.conf 2>/dev/null; then
    echo "    Updating /etc/systemd/resolved.conf with reliable DNS servers..."

    # Backup if needed
    if [ ! -f /etc/systemd/resolved.conf.bak ]; then
        sudo cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.bak
        echo "    Backup saved: /etc/systemd/resolved.conf.bak"
    fi

    # Apply DNS settings (uncomment and set primary/fallback)
    sudo sed -i 's/^#DNS=/DNS=/' /etc/systemd/resolved.conf
    sudo sed -i 's/^#FallbackDNS=/FallbackDNS=/' /etc/systemd/resolved.conf
    sudo sed -i 's/^DNS=.*/DNS=1.1.1.1 8.8.8.8/' /etc/systemd/resolved.conf
    sudo sed -i 's/^FallbackDNS=.*/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf

    sudo systemctl restart systemd-resolved
    echo "    DNS updated (1.1.1.1 primary, 8.8.8.8/8.8.4.4 fallback). Service restarted."
else
    echo "    DNS already optimized. Skipping."
fi

# --- Step 4: Install essential system packages ---
echo "[4/13] Installing core system dependencies..."
echo "    Why: git (source code), python3.12 (app runtime), curl (downloads), systemd (services)."
REQUIRED_PACKAGES="git python3.12 python3.12-venv curl systemd"
MISSING_PACKAGES=""

for pkg in $REQUIRED_PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg "; then
        MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
done

if [ -n "$MISSING_PACKAGES" ]; then
    echo "    Installing: ${MISSING_PACKAGES# }..."
    sudo apt install -y $MISSING_PACKAGES
    echo "    All core packages installed."
else
    echo "    All core packages already present."
fi

# --- Step 5: Setup LadyLinux source code ---
echo "[5/13] Downloading/updating LadyLinux source code..."
BRANCH="${LADYLINUX_BRANCH:-Capstone_Dev_01}"
echo "    Why: Fetches the AI assistant application code from GitHub."
echo "    Branch: $BRANCH"

if [ -d "$BASE_DIR" ]; then
    echo "    Repo exists. Checking for updates..."
    cd "$BASE_DIR"
    sudo git fetch origin
    CURRENT_BRANCH=$(sudo git rev-parse --abbrev-ref HEAD)
    LOCAL=$(sudo git rev-parse HEAD)
    REMOTE=$(sudo git rev-parse "origin/$BRANCH" 2>/dev/null || echo "not-found")

    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        echo "    Switching to branch '$BRANCH'..."
        sudo git checkout -f "$BRANCH"
    fi

    if [ "$LOCAL" != "$REMOTE" ] && [ "$REMOTE" != "not-found" ]; then
        echo "    New updates found! Applying latest code..."
        sudo git reset --hard "origin/$BRANCH"
        sudo git clean -fd
        echo "    Code refreshed."
    else
        echo "    Code up to date."
    fi
    cd - >/dev/null
else
    echo "    Cloning fresh from GitHub..."
    sudo git clone --branch "$BRANCH" https://github.com/theCodingProfessor/LadyLinux.git "$BASE_DIR"
    echo "    Source code downloaded to $BASE_DIR"
fi

# Make helper scripts executable
chmod +x "$BASE_DIR/scripts/"*.sh 2>/dev/null || true
echo "    Helper scripts ready."

# --- Step 6: Install Ollama (local AI engine) ---
echo "[6/13] Installing Ollama - your local AI model server..."
echo "    Why: Runs large language models (like Mistral) directly on your machine - no cloud needed."
if command -v ollama >/dev/null 2>&1; then
    OLLAMA_VERSION=$(ollama --version 2>/dev/null || echo "unknown")
    echo "    Ollama found (v$OLLAMA_VERSION). Skipping install."
else
    echo "    Downloading official Ollama installer..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "    Ollama installed and ready."
fi

# --- Step 7: Start Ollama service ---
echo "[7/13] Starting Ollama background service..."
echo "    Why: Keeps AI models running 24/7 as a system service."
if systemctl is-active --quiet ollama; then
    echo "    Ollama service already running."
else
    sudo systemctl start ollama
fi
if ! systemctl is-enabled --quiet ollama 2>/dev/null; then
    sudo systemctl enable ollama
    echo "    Auto-start on boot enabled."
fi
echo "    Ollama service active."

# --- Step 8: Download AI models ---
echo "[8/13] Downloading Mistral AI model (~4GB)..."
echo "    Why: Core 'brain' for natural language processing and chat."
if ollama list | grep -q "^mistral "; then
    echo "    Mistral ready."
else
    echo "    Downloading (takes 5-15 min depending on internet)..."
    ollama pull mistral
    echo "    Mistral downloaded."
fi

echo "[8a/13] Downloading embedding model for search features..."
echo "    Why: Enables semantic search in your documents/files."
if ollama list | grep -q "^nomic-embed-text "; then
    echo "    Embeddings ready."
else
    ollama pull nomic-embed-text
    echo "    Embeddings downloaded."
fi

# --- Step 9: Create secure service user ---
echo "[9/13] Setting up 'ladylinux' service account..."
echo "    Why: Runs the app with minimal privileges (security best practice)."
if id "ladylinux" >/dev/null 2>&1; then
    echo "    Service user exists."
else
    sudo useradd -r -m -d /home/ladylinux -s /usr/sbin/nologin "$SERVICE_USER"
    echo "    Secure user created (no login access)."
fi

sudo chown -R "$SERVICE_USER:$SERVICE_GROUP" /home/ladylinux "$BASE_DIR" 2>/dev/null || true

# Temp shell change for setup
RESTORE_SHELL=false
CURRENT_SHELL=$(getent passwd "$SERVICE_USER" | cut -d: -f7)
if [ "$CURRENT_SHELL" != "/bin/bash" ]; then
    sudo usermod -s /bin/bash "$SERVICE_USER"
    RESTORE_SHELL=true
fi

# --- Step 10: Install uv (10x faster Python package manager) ---
echo "[10/13] Installing uv - ultra-fast Python tool..."
echo "    Why: Replaces slow pip/venv - installs packages in seconds vs minutes."
if sudo -u "$SERVICE_USER" bash -c "command -v uv" >/dev/null 2>&1; then
    UV_VERSION=$(sudo -u "$SERVICE_USER" bash -c "uv --version" 2>/dev/null || echo "unknown")
    echo "    uv ready (v$UV_VERSION)."
else
    echo "    Installing via official script..."
    sudo -u "$SERVICE_USER" bash -c "curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "    uv installed (~10x faster than pip)."
fi

# --- Step 11: Setup Python app environment ---
echo "[11/13] Creating Python virtual environment & installing app..."
echo "    Why: Isolates dependencies for stability, uses uv for speed."
sudo -u "$SERVICE_USER" bash -c "
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    cd $BASE_DIR

    if [ ! -d venv ]; then
        echo '    Creating isolated Python environment...'
        uv venv --python python3.12
    fi

    if [ -f requirements.txt ]; then
        echo '    Installing app dependencies (FastAPI, etc.)...'
        . venv/bin/activate
        uv pip install -r requirements.txt
        echo '    App ready to run!'
    else
        echo '    WARNING: requirements.txt missing - app may not work fully.'
    fi
"
echo "    Python environment complete."

if [ "$RESTORE_SHELL" = true ]; then
    sudo usermod -s /usr/sbin/nologin "$SERVICE_USER"
fi

# --- Step 12: Setup logging & data directories ---
echo "[12/13] Preparing logs and data storage..."
mkdir_safe "$LOG_DIR"
mkdir_safe "/var/lib/ladylinux"
sudo chown "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR" "/var/lib/ladylinux" 2>/dev/null || true
sudo chmod 0755 "$LOG_DIR" "/var/lib/ladylinux"
echo "    Logs: $LOG_DIR | Data: /var/lib/ladylinux"

# --- Step 13: Launch API service ---
echo "[13/13] Starting LadyLinux web API service..."
if [ -f "$BASE_DIR/ladylinux-api.service" ]; then
    sudo cp "$BASE_DIR/ladylinux-api.service" /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl start "$SERVICE_NAME"
    sleep 3
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo "    Service running! Access at:"
        echo "      Web UI:    http://localhost:8000"
        echo "      API Docs:  http://localhost:8000/docs"
    else
        echo "    WARNING: Service start issue. Check:"
        echo "      sudo systemctl status $SERVICE_NAME"
        echo "      journalctl -u $SERVICE_NAME -f"
    fi
else
    echo "    WARNING: Service file missing. Manual start needed."
fi

# --- Complete! ---
echo ""
echo "LadyLinux Installation Complete!"
echo ""
echo "Quick Commands:"
echo "  Status:     sudo systemctl status ladylinux-api"
echo "  Logs:       journalctl -u ladylinux-api -f"
echo "  Restart:    sudo systemctl restart ladylinux-api"
echo "  Stop:       sudo systemctl stop ladylinux-api"
echo ""
echo "Docs in $BASE_DIR/docs/"
echo "========================================================================="





REFRESH_UPDATE.SH

# Author: Ryan Little
# April 2024

#!/usr/bin/env bash

#===============================================================================
# LadyLinux VM Refresh Script - User Friendly Edition
# File: refresh_vm.sh
#
# Purpose:
#   Updates your LadyLinux application from GitHub without reinstalling OS
#   or deleting AI models. Safe to run anytime to get latest features.
#
# What it does:
#   [1/10] Stops service safely
#   [2/10] Pulls latest code from GitHub
#   [3/10] Rebuilds Python environment (only if needed)
#   [4/10] Updates service configuration
#   [5/10] Restarts service with new code
#
# Usage:
#   chmod +x refresh_vm.sh
#   sudo ./refresh_vm.sh          # Uses 'update' branch (default)
#   sudo ./refresh_vm.sh develop  # Use development branch
#   sudo ./refresh_vm.sh main     # Use main branch
#===============================================================================

set -Eeuo pipefail

#----- Configuration -----
BRANCH="${1:-update}"
APP_DIR="/opt/ladylinux"
VENV_DIR="$APP_DIR/venv"
SERVICE_NAME="ladylinux-api.service"
SERVICE_USER="ladylinux"
REPO_URL="https://github.com/theCodingProfessor/LadyLinux.git"

echo "========================================================================="
echo "  LadyLinux VM Refresh Script"
echo "  Updates application code and Python environment from GitHub"
echo "  Branch: $BRANCH"
echo "========================================================================="
echo ""

#----- Step 1: Check Prerequisites -----
echo "[1/10] Checking system requirements..."
echo "    Why: Ensures git, python, and systemd are available."

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "    ERROR: Must run as root (sudo ./refresh_vm.sh $BRANCH)"
    exit 2
fi

command -v git >/dev/null 2>&1 || { echo "    ERROR: git not found. Install with: sudo apt install git"; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "    ERROR: python3 not found. Install with: sudo apt install python3 python3-venv"; exit 2; }
command -v systemctl >/dev/null 2>&1 || { echo "    ERROR: systemd not found"; exit 2; }

echo "    All prerequisites OK."

#----- Step 2: Setup Service User -----
echo "[2/10] Ensuring service user exists..."
echo "    Why: Runs app with minimal privileges for security."

if id "$SERVICE_USER" >/dev/null 2>&1; then
    echo "    Service user '$SERVICE_USER' exists."
else
    echo "    Creating secure service user..."
    useradd -r -m -d "/home/$SERVICE_USER" -s /usr/sbin/nologin "$SERVICE_USER"
    echo "    Service user created."
fi

#----- Step 3: Setup Application Directory -----
echo "[3/10] Preparing application directory..."
echo "    Why: Ensures code lives in standard location (/opt/ladylinux)."

if [[ ! -d "$APP_DIR/.git" ]]; then
    echo "    No repo found. Cloning fresh from GitHub..."
    mkdir -p "$APP_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
    sudo -u "$SERVICE_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    echo "    Repository cloned successfully."
else
    echo "    Repository exists at $APP_DIR."
fi

echo "    Fixing ownership..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
mkdir -p /var/lib/ladylinux/{data,cache,logs}
chown -R "$SERVICE_USER:$SERVICE_USER" /var/lib/ladylinux

#----- Step 4: Stop Running Service -----
echo "[4/10] Stopping service (if running)..."
echo "    Why: Prevents conflicts during code update."

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "    Stopping $SERVICE_NAME..."
    systemctl stop "$SERVICE_NAME"
    echo "    Service stopped."
else
    echo "    Service not running or not found. Continuing."
fi

#----- Step 5: Update Code from GitHub -----
echo "[5/10] Updating code from GitHub (branch: $BRANCH)..."
echo "    Why: Gets latest features, bug fixes, security updates."

cd "$APP_DIR"
sudo -u "$SERVICE_USER" git fetch origin
sudo -u "$SERVICE_USER" git checkout -f "$BRANCH"
sudo -u "$SERVICE_USER" git reset --hard "origin/$BRANCH"
sudo -u "$SERVICE_USER" git clean -fd --exclude=venv

COMMIT=$(sudo -u "$SERVICE_USER" git rev-parse --short HEAD)
echo "    Code updated to commit: $COMMIT"

#----- Step 6: Check if Python Environment Needs Rebuild -----
echo "[6/10] Checking Python environment..."
echo "    Why: Dependencies may have changed. Rebuilds only when needed."

if [[ ! -d "$VENV_DIR" || ! -x "$VENV_DIR/bin/python" ]]; then
    REBUILD_NEEDED=true
    echo "    No valid venv found. Will rebuild."
elif [[ ! -f "$APP_DIR/requirements.txt" ]]; then
    REBUILD_NEEDED=true
    echo "    No requirements.txt found. Will rebuild."
else
    REBUILD_NEEDED=false
    echo "    Python environment OK."
fi

#----- Step 7: Rebuild Python Environment (if needed) -----
if [[ "$REBUILD_NEEDED" == true ]]; then
    echo "[7/10] Rebuilding Python virtual environment..."
    echo "    Why: Installs/updated app dependencies (FastAPI, etc.)."

    rm -rf "$VENV_DIR"
    mkdir -p "$VENV_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$VENV_DIR"

    echo "    Creating new environment..."
    sudo -u "$SERVICE_USER" python3 -m venv "$VENV_DIR"

    echo "    Upgrading pip..."
    sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install --upgrade pip wheel setuptools

    if [[ -f "$APP_DIR/requirements.txt" ]]; then
        echo "    Installing dependencies:"
        grep -v "^#" "$APP_DIR/requirements.txt" | grep -v "^$" | sed 's/^/      /'
        sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt"
        echo "    Dependencies installed."
    fi

    echo "    Python environment rebuilt."
else
    echo "[7/10] Python environment up to date. Skipping rebuild."
fi

#----- Step 8: Update Systemd Service File -----
echo "[8/10] Updating service configuration..."
echo "    Why: Ensures systemd knows how to run the updated app."

SERVICE_FILE="$APP_DIR/ladylinux-api.service"
if [[ -f "$SERVICE_FILE" ]]; then
    cp "$SERVICE_FILE" "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" 2>/dev/null || true
    echo "    Service file updated."
else
    echo "    WARNING: No service file found in repo."
fi

#----- Step 9: Start Service -----
echo "[9/10] Starting updated service..."
echo "    Why: Launches LadyLinux with new code."

systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
systemctl start "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "    Service started successfully!"
else
    echo "    WARNING: Service failed to start."
    echo "    Check: sudo systemctl status $SERVICE_NAME"
    echo "    Logs:  journalctl -u $SERVICE_NAME -f"
fi

#----- Step 10: Summary -----
echo ""
echo "[10/10] Refresh Complete!"
echo "========================================================================="
echo "Summary:"
echo "  Branch: $BRANCH"
echo "  Commit: $COMMIT"
echo "  Location: $APP_DIR"
echo "  Service: $SERVICE_NAME"
echo ""
echo "Quick Access:"
echo "  Web UI:     http://localhost:8000"
echo "  API Docs:   http://localhost:8000/docs"
echo ""
echo "Management Commands:"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    journalctl -u $SERVICE_NAME -f"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo ""
echo "To refresh again anytime: sudo ./refresh_vm.sh"
echo "========================================================================="

# Show service status
echo ""
echo "Service Status:"
systemctl status "$SERVICE_NAME" --no-pager -l --lines=10 2>&1 || true

RUN_II.SH


#!/usr/bin/env bash

#===============================================================================
# LadyLinux Quick Launch Script - User Friendly Edition
# File: launch_lady.sh
#
# Purpose:
#   Starts the LadyLinux web interface in the background and auto-opens browser.
#   Perfect for quick testing/development without systemd service.
#
# What it does:
#   [1/5] Checks Python environment
#   [2/5] Starts FastAPI server (port 8000)
#   [3/5] Waits for startup
#   [4/5] Opens browser automatically
#   [5/5] Shows access info and logs
#
# Usage:
#   chmod +x launch_lady.sh
#   cd /opt/ladylinux
#   ./launch_lady.sh
#===============================================================================

set -uo pipefail

#----- Configuration -----
APP_DIR="/opt/ladylinux"
VENV_DIR="$APP_DIR/venv"
LOG_FILE="/tmp/ladylinux.log"
PORT=8000
HOST="0.0.0.0"

echo "========================================================================="
echo "  LadyLinux Quick Launch"
echo "  Starts web server + auto-opens browser"
echo "========================================================================="
echo ""

#----- Step 1: Check Prerequisites -----
echo "[1/5] Checking environment..."
echo "    Why: Ensures LadyLinux code and Python environment exist."

if [[ ! -d "$APP_DIR" ]]; then
    echo "    ERROR: LadyLinux not found at $APP_DIR"
    echo "    Run install script first: sudo ./start_lady.sh"
    exit 1
fi

cd "$APP_DIR" || { echo "    ERROR: Cannot access $APP_DIR"; exit 1; }

if [[ ! -f "venv/bin/activate" ]]; then
    echo "    ERROR: Virtual environment missing!"
    echo "    Rebuild with: sudo ./refresh_vm.sh"
    exit 1
fi

if [[ ! -f "api_layer/app.py" ]]; then
    echo "    ERROR: API code missing (api_layer/app.py)"
    echo "    Check git status: git status"
    exit 1
fi

echo "    Environment OK."

#----- Step 2: Activate Virtual Environment -----
echo "[2/5] Activating Python environment..."
echo "    Why: Uses isolated dependencies (FastAPI, etc.)."

export PATH="$HOME/.local/bin:$PATH"
source "venv/bin/activate"

echo "    Python environment activated."

#----- Step 3: Start FastAPI Server -----
echo "[3/5] Starting web server..."
echo "    Why: Runs LadyLinux API on port $PORT (accessible from all interfaces)."

# Kill any existing instance using the same port
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "    Stopping existing server on port $PORT..."
    kill $(lsof -ti:$PORT) 2>/dev/null || true
    sleep 1
fi

# Clear old log
> "$LOG_FILE"

# Start server in background (new session = detached from terminal)
echo "    Launching uvicorn api_layer.app:app --host $HOST --port $PORT"
setsid uvicorn api_layer.app:app --host "$HOST" --port "$PORT" > "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo "    Server started (PID: $SERVER_PID)"
echo "    Log file: $LOG_FILE"

#----- Step 4: Wait for Startup -----
echo "[4/5] Waiting for server startup..."
echo "    Why: Ensures API is ready before opening browser."

sleep 3

# Check if server is actually running
if ! ps -p "$SERVER_PID" >/dev/null 2>&1; then
    echo "    ERROR: Server failed to start!"
    echo "    Check logs:"
    tail -20 "$LOG_FILE"
    exit 1
fi

if ! curl -s "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "    WARNING: Health check failed (normal for some setups)."
    echo "    Server may still be starting..."
fi

echo "    Server ready!"

#----- Step 5: Open Browser + Summary -----
echo "[5/5] Opening browser and showing access info..."
echo "    Why: Quick access to LadyLinux web interface."

# Auto-open browser (works on most Linux desktops)
if command -v xdg-open >/dev/null 2>&1; then
    setsid xdg-open "http://localhost:$PORT" &
    echo "    Browser opening: http://localhost:$PORT"
elif command -v firefox >/dev/null 2>&1; then
    setsid firefox "http://localhost:$PORT" &
    echo "    Firefox opening: http://localhost:$PORT"
elif command -v google-chrome >/dev/null 2>&1; then
    setsid google-chrome "http://localhost:$PORT" &
    echo "    Chrome opening: http://localhost:$PORT"
else
    echo "    No browser found. Open manually:"
    echo "    http://localhost:$PORT"
fi

echo ""
echo "========================================================================="
echo "LadyLinux Quick Launch Complete!"
echo "========================================================================="
echo ""
echo "Web Interface:  http://localhost:$PORT"
echo "API Docs:       http://localhost:$PORT/docs"
echo ""
echo "Management Commands:"
echo "  View logs:    tail -f $LOG_FILE"
echo "  Check server: ps aux | grep uvicorn"
echo "  Kill server:  kill $SERVER_PID"
echo "  Port check:   lsof -i :$PORT"
echo ""
echo "Pro Tips:"
echo "  - Browser auto-opens (wait 3-5 sec)"
echo "  - Logs update live: tail -f $LOG_FILE"
echo "  - Ctrl+C safe (detached from terminal)"
echo "  - Use systemd for production: sudo systemctl start ladylinux-api"
echo ""
echo "To stop: kill $SERVER_PID  (or reboot)"
echo "========================================================================="

# Show recent logs
echo ""
echo "Recent logs:"
tail -15 "$LOG_FILE" 2>/dev/null || echo "No logs yet (server starting...)"

# Keep terminal open briefly for user to read
sleep 5


STOP_II_.SH

#!/usr/bin/env bash

#===============================================================================
# LadyLinux Service Stop Script - User Friendly Edition
# File: stop_ll.sh
#
# Purpose:
#   Gracefully stops LadyLinux service and any orphaned processes.
#   Uses SIGTERM first, then SIGKILL if needed. Perfect for maintenance.
#
# What it does:
#   [1/6] Stops systemd service
#   [2/6] Finds/kills orphaned uvicorn processes
#   [3/6] Verifies everything stopped
#   [4/6] Shows service status
#   [5/6] Cleanup summary
#   [6/6] Log locations
#
# Usage:
#   chmod +x stop_ll.sh
#   sudo ./stop_ll.sh
#===============================================================================

set -euo pipefail

#----- Configuration -----
SERVICE_NAME="ladylinux-api.service"
LOG_DIR="/var/log/ladylinux"

#----- Helper Functions -----
log()  { printf "[stop] %s\n" "$*"; }
warn() { printf "[stop][WARN] %s\n" "$*" >&2; }

stop_by_pattern() {
  local pattern="$1"
  local label="$2"
  local wait_seconds="${3:-2}"

  mapfile -t pids < <(pgrep -f -- "$pattern" 2>/dev/null || true)

  if [ ${#pids[@]} -eq 0 ]; then
    log "No $label processes found."
    return 0
  fi

  log "Found $label PID(s): ${pids[*]}"
  log "Sending SIGTERM (graceful stop)..."
  kill "${pids[@]}" 2>/dev/null || true

  sleep "$wait_seconds"

  mapfile -t remaining < <(pgrep -f -- "$pattern" 2>/dev/null || true)
  if [ ${#remaining[@]} -gt 0 ]; then
    log "$label still running. Force kill (SIGKILL): ${remaining[*]}"
    kill -9 "${remaining[@]}" 2>/dev/null || true
    sleep 1
  fi

  log "$label: fully stopped."
}

#----- Step 1: Check Root and Service -----
echo "========================================================================="
echo "  LadyLinux Service Stopper"
echo "  Gracefully stops service + cleans orphaned processes"
echo "========================================================================="
echo ""

echo "[1/6] Checking permissions..."
echo "    Why: Needs root to control systemd services."

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "    ERROR: Must run as root: sudo ./stop_ll.sh"
    exit 1
fi

echo "[2/6] Checking service status..."
echo "    Why: Shows if service exists and current state."

if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
    echo "    Service file exists."
else
    echo "    WARNING: Service '$SERVICE_NAME' not found in systemd."
    echo "    Will clean orphaned processes only."
fi

echo "    All checks passed."

#----- Step 3: Stop Systemd Service -----
echo ""
echo "[3/6] Stopping systemd service..."
echo "    Why: Primary method - clean shutdown with systemd."

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "    Service is running. Graceful stop..."
    systemctl stop "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo "    Still running. Force kill..."
        systemctl kill -s SIGKILL "$SERVICE_NAME"
        sleep 1
    fi
    echo "    Systemd service stopped."
else
    echo "    Service not running (or not enabled). Skipping."
fi

#----- Step 4: Kill Orphaned Uvicorn Processes -----
echo ""
echo "[4/6] Cleaning orphaned web processes..."
echo "    Why: Catches manual uvicorn or crashed systemd instances."

stop_by_pattern 'uvicorn.*api_layer.app:app' 'LadyLinux web server' 2
stop_by_pattern 'uvicorn.*ladylinux' 'uvicorn LadyLinux' 1

#----- Step 5: Verify Everything Stopped -----
echo ""
echo "[5/6] Verifying clean shutdown..."
echo "    Why: Confirms no zombie processes remain."

SERVICE_PIDS=$(pgrep -f "uvicorn.*(api_layer|ladylinux)" 2>/dev/null || true)
OLLAMA_PIDS=$(pgrep -f "ollama serve" 2>/dev/null || true)

if [[ -z "$SERVICE_PIDS" && -z "$OLLAMA_PIDS" ]]; then
    echo "    Clean shutdown - no LadyLinux processes running."
else
    echo "    WARNING: Some processes may still be running:"
    [[ -n "$SERVICE_PIDS" ]] && echo "      Web PIDs: $SERVICE_PIDS"
    [[ -n "$OLLAMA_PIDS" ]] && echo "      Ollama PIDs: $OLLAMA_PIDS"
    echo "      Manual cleanup: pkill -f 'uvicorn.*ladylinux'"
fi

#----- Step 6: Status Summary + Logs -----
echo ""
echo "[6/6] Final status and logs..."
echo "    Why: Shows service state and where to find logs."

echo ""
echo "Service Status:"
systemctl status "$SERVICE_NAME" --no-pager -l --lines=8 2>/dev/null || echo "Service not found."

echo ""
echo "========================================================================="
echo "LadyLinux Stop Complete!"
echo "========================================================================="
echo ""
echo "What was done:"
echo "  - Systemd service stopped"
echo "  - Orphaned uvicorn processes killed"
echo "  - Process verification complete"
echo ""
echo "Log Locations:"
echo "  Service: journalctl -u $SERVICE_NAME -f"
echo "  App:     tail -f $LOG_DIR/*.log"
echo "  Temp:    tail -f /tmp/ladylinux.log"
echo ""
echo "To restart:"
echo "  sudo systemctl start $SERVICE_NAME"
echo "  # Or quick launch: cd /opt/ladylinux && ./launch_lady.sh"
echo ""
echo "Port check (should be empty):"
lsof -i :8000 2>/dev/null || echo "  Port 8000: CLEAR"
echo "========================================================================="

