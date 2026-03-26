#!/usr/bin/env bash

#===============================================================================
# LadyLinux Installation Script
# File: current_ladylinuxinstall.sh
#
# Purpose:
#   Idempotent installation script that checks existing system state before
#   installing components. Safe to run multiple times.
#
# Usage:
#   sudo ./current_ladylinuxinstall.sh
#===============================================================================

set -euo pipefail

echo "═══════════════════════════════════════════════════════════════════════"
echo "  Welcome to the LadyLinux Installation Wizard"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# --- Update package index (always safe to run) ---
echo "[1/10] Updating package index..."
sudo apt update -qq

# --- Check if system upgrade is needed ---
echo "[2/10] Checking for system upgrades..."
UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c upgradable || true)
if [ "$UPGRADABLE" -gt 1 ]; then
    echo "  → Found $((UPGRADABLE - 1)) upgradable packages. Upgrading..."
    sudo apt upgrade -y
else
    echo "  → System is up to date. Skipping upgrade."
fi

# --- Configure DNS settings (only if not already configured) ---
echo "[3/10] Configuring DNS settings..."
if ! grep -q "^DNS=1.1.1.1 8.8.8.8" /etc/systemd/resolved.conf 2>/dev/null; then
    echo "  → Updating DNS configuration..."

    # Backup original file if backup doesn't exist
    if [ ! -f /etc/systemd/resolved.conf.bak ]; then
        sudo cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.bak
        echo "  → Backup created at /etc/systemd/resolved.conf.bak"
    fi

    # Update DNS settings
    sudo sed -i 's/^#DNS=.*$/DNS=1.1.1.1 8.8.8.8/' /etc/systemd/resolved.conf
    sudo sed -i 's/^#FallbackDNS=.*$/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf
    sudo sed -i 's/^DNS=.*$/DNS=1.1.1.1 8.8.8.8/' /etc/systemd/resolved.conf
    sudo sed -i 's/^FallbackDNS=.*$/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf

    sudo systemctl restart systemd-resolved
    echo "  → DNS settings applied and service restarted."
else
    echo "  → DNS already configured. Skipping."
fi

# --- Install required system packages (only missing ones) ---
echo "[4/10] Checking required system packages..."
REQUIRED_PACKAGES="git python3.12 python3.12-venv curl systemd"
MISSING_PACKAGES=""

for pkg in $REQUIRED_PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg "; then
        MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
done

if [ -n "$MISSING_PACKAGES" ]; then
    echo "  → Installing missing packages:$MISSING_PACKAGES"
    sudo apt install -y $MISSING_PACKAGES
else
    echo "  → All required packages already installed."
fi

# --- Clone or update LadyLinux repository ---
echo "[5/10] Setting up LadyLinux repository..."
BRANCH="${LADYLINUX_BRANCH:-Capstone_Dev_01}"
echo "  → Using branch: $BRANCH"

if [ -d "/opt/ladylinux" ]; then
    echo "  → Repository already exists at /opt/ladylinux"
    echo "  → Checking for updates..."
    cd /opt/ladylinux
    sudo git fetch origin

    # Get current branch and commit
    CURRENT_BRANCH=$(sudo git rev-parse --abbrev-ref HEAD)
    LOCAL=$(sudo git rev-parse HEAD)
    REMOTE=$(sudo git rev-parse origin/$BRANCH 2>/dev/null || echo "not-found")

    # If on different branch, switch
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        echo "  → Switching from branch '$CURRENT_BRANCH' to '$BRANCH'..."
        sudo git checkout -f "$BRANCH"
    fi

    # If remote commit differs from local, pull updates
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "  → Updates available. Pulling latest changes..."
        sudo git reset --hard "origin/$BRANCH"
        sudo git clean -fd
    else
        echo "  → Repository is up to date on branch '$BRANCH'."
    fi

    cd - >/dev/null
else
    echo "  → Cloning LadyLinux repository from branch '$BRANCH'..."
    sudo git clone --branch "$BRANCH" https://github.com/theCodingProfessor/LadyLinux.git /opt/ladylinux
    echo "  → Repository cloned successfully."
fi

# --- Make installer scripts executable (if they exist) ---
if [ -f "/opt/ladylinux/scripts/install_ladylinux.sh" ]; then
    sudo chmod +x /opt/ladylinux/scripts/install_ladylinux.sh
fi
if [ -f "/opt/ladylinux/scripts/refresh_vm.sh" ]; then
    sudo chmod +x /opt/ladylinux/scripts/refresh_vm.sh
fi

# --- Install Ollama ---
echo "[6/10] Checking Ollama installation..."
if command -v ollama >/dev/null 2>&1; then
    OLLAMA_VERSION=$(ollama --version 2>/dev/null || echo "unknown")
    echo "  → Ollama already installed ($OLLAMA_VERSION). Skipping installation."
else
    echo "  → Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "  → Ollama installed successfully."
fi

# --- Initialize Ollama service ---
echo "[7/10] Configuring Ollama service..."
if systemctl is-active --quiet ollama; then
    echo "  → Ollama service is already running."
else
    echo "  → Starting Ollama service..."
    sudo systemctl start ollama
fi

if systemctl is-enabled --quiet ollama 2>/dev/null; then
    echo "  → Ollama service already enabled at boot."
else
    echo "  → Enabling Ollama service at boot..."
    sudo systemctl enable ollama
fi

# --- Pull Mistral LLM model ---
echo "[8/10] Checking Mistral LLM model..."
if ollama list | grep -q "mistral"; then
    echo "  → Mistral model already downloaded. Skipping."
else
    echo "  → Pulling Mistral LLM model (this may take a while)..."
    ollama pull mistral
    echo "  → Mistral model downloaded successfully."
fi

# --- Pull nomic-embed-text embedding model ---
echo "[8a/10] Checking nomic-embed-text embedding model..."
if ollama list | grep -q "nomic-embed-text"; then
    echo "  → nomic-embed-text model already downloaded. Skipping."
else
    echo "  → Pulling nomic-embed-text embedding model (this may take a while)..."
    ollama pull nomic-embed-text
    echo "  → nomic-embed-text model downloaded successfully."
fi

# --- Ensure ladylinux user exists and is properly configured ---
echo "[9/10] Configuring ladylinux service user..."

# Check if ladylinux user exists
if id "ladylinux" >/dev/null 2>&1; then
    echo "  → User 'ladylinux' already exists."
else
    echo "  → Creating 'ladylinux' system user..."
    sudo useradd -r -m -d /home/ladylinux -s /usr/sbin/nologin ladylinux
    echo "  → User created successfully."
fi

# Ensure home directory exists and has correct permissions
if [ ! -d "/home/ladylinux" ]; then
    echo "  → Creating home directory for ladylinux user..."
    sudo mkdir -p /home/ladylinux
    sudo chown ladylinux:ladylinux /home/ladylinux
    sudo usermod -d /home/ladylinux ladylinux
else
    echo "  → Home directory exists. Verifying permissions..."
    sudo chown ladylinux:ladylinux /home/ladylinux
fi

# Temporarily set shell to bash for installation tasks
CURRENT_SHELL=$(getent passwd ladylinux | cut -d: -f7)
if [ "$CURRENT_SHELL" != "/bin/bash" ]; then
    echo "  → Temporarily setting shell to /bin/bash for setup..."
    sudo usermod -s /bin/bash ladylinux
    RESTORE_SHELL=true
else
    RESTORE_SHELL=false
fi

# --- Install uv package manager ---
echo "[10/10] Setting up Python environment..."

if sudo -u ladylinux bash -c "command -v uv" >/dev/null 2>&1; then
    UV_VERSION=$(sudo -u ladylinux bash -c "uv --version" 2>/dev/null || echo "unknown")
    echo "  → uv package manager already installed ($UV_VERSION)."
else
    echo "  → Installing uv package manager for ladylinux user..."
    sudo -u ladylinux bash -c "curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "  → uv installed successfully."
fi

# --- Create virtual environment and install dependencies ---
if [ -d "/opt/ladylinux/venv" ]; then
    echo "  → Virtual environment already exists."
    echo "  → Checking Python dependencies..."
else
    echo "  → Creating virtual environment..."

    # Ensure /opt/ladylinux directory is owned by ladylinux user
    echo "  → Fixing permissions on /opt/ladylinux..."
    sudo chown -R ladylinux:ladylinux /opt/ladylinux
fi

sudo -u ladylinux bash -c "
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    cd /opt/ladylinux

    # Create venv if it doesn't exist
    if [ ! -d venv ]; then
        echo '  → Creating Python virtual environment with uv...'
        uv venv venv
        if [ \$? -eq 0 ]; then
            echo '  → Virtual environment created successfully.'
        else
            echo '  → Error creating virtual environment. Checking permissions...'
            exit 1
        fi
    fi

    # Install/upgrade dependencies from requirements.txt
    if [ -f 'requirements.txt' ]; then
        echo '  → Installing Python dependencies from requirements.txt...'
        uv pip install --python venv/bin/python -r requirements.txt
        if [ \$? -eq 0 ]; then
            echo '  → Python dependencies installed successfully.'
        else
            echo '  → Warning: Some dependencies may not have installed correctly.'
            exit 1
        fi
    else
        echo '  → requirements.txt not found! Skipping dependency installation.'
        exit 1
    fi
"
echo "  → Python environment setup complete."

# --- Restore shell to nologin for security ---
if [ "$RESTORE_SHELL" = true ]; then
    echo "  → Restoring shell to /usr/sbin/nologin for security..."
    sudo usermod -s /usr/sbin/nologin ladylinux
fi

# --- Set up systemd service ---
echo ""
echo "[11/11] Setting up systemd service..."

# Check if service file exists in repo
if [ -f "/opt/ladylinux/ladylinux-api.service" ]; then
    echo "  → Copying service file to systemd..."
    sudo cp /opt/ladylinux/ladylinux-api.service /etc/systemd/system/

    echo "  → Reloading systemd daemon..."
    sudo systemctl daemon-reload

    echo "  → Enabling service to start at boot..."
    sudo systemctl enable ladylinux-api.service

    echo "  → Starting LadyLinux API service..."
    sudo systemctl reset-failed ladylinux-api.service >/dev/null 2>&1 || true
    sudo systemctl start ladylinux-api.service

    # Give service a moment to start
    sleep 2

    # Check if service started successfully
    if systemctl is-active --quiet ladylinux-api.service; then
        echo "  → Service started successfully! ✓"
    else
        echo "  → Warning: Service may not have started correctly."
        echo "  → Check status with: sudo systemctl status ladylinux-api.service"
        echo "  → View logs with: journalctl -u ladylinux-api.service -n 20"
    fi
else
    echo "  → Warning: Service file not found at /opt/ladylinux/ladylinux-api.service"
    echo "  → You'll need to set up the service manually."
fi

# --- Installation complete ---
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  🎉 LadyLinux Installation Complete!"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "The LadyLinux API service is now running!"
echo ""
echo "📍 Quick Access:"
echo "  • Web Interface:  http://localhost:8000"
echo "  • API Endpoint:   http://localhost:8000/docs"
echo ""
echo "🔧 Service Management:"
echo "  • Check status:   sudo systemctl status ladylinux-api"
echo "  • Stop service:   sudo systemctl stop ladylinux-api"
echo "  • Start service:  sudo systemctl start ladylinux-api"
echo "  • Restart:        sudo systemctl restart ladylinux-api"
echo "  • View logs:      journalctl -u ladylinux-api -f"
echo ""
echo "🐍 For Manual Testing (requires activating virtual environment):"
echo "  cd /opt/ladylinux"
echo "  source venv/bin/activate"
echo "  uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "  To deactivate the virtual environment when done:"
echo "  deactivate"
echo ""
echo "📚 Documentation:"
echo "  • Quick Reference: docs/SCRIPTS_QUICK_REFERENCE.md"
echo "  • Full Guide:      docs/SCRIPTS_INSTALLATION_AND_REFRESH.md"
echo "  • Quick Start:     QUICK_START_CHECKLIST.md"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
