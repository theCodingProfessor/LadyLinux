#!/usr/bin/env bash

# Updated for proper line endings
set -euo pipefail
set -x

echo "Welcome to the LadyLinux install wizard! This wizard will automatically configure your system to set up the program to run."

# --- Update and upgrade system packages ---
echo "Updating packages first to ensure compatibility..."
sudo apt update
echo "Fetched list of programs/features to update, updating now..."
sudo apt upgrade -y
echo "Updated programs successfully."

# Test, updating DNS settings for downloading Mistral

# Backup the original resolved.conf file
sudo cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.bak

# Use sed to modify the DNS and FallbackDNS lines in the config file
sudo sed -i 's/^#DNS=.*$/DNS=1.1.1.1 8.8.8.8/' /etc/systemd/resolved.conf
sudo sed -i 's/^#FallbackDNS=.*$/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf

# Ensure the DNS and FallbackDNS lines are not commented out
sudo sed -i 's/^DNS=.*$/DNS=1.1.1.1 8.8.8.8/' /etc/systemd/resolved.conf
sudo sed -i 's/^FallbackDNS=.*$/FallbackDNS=8.8.4.4/' /etc/systemd/resolved.conf

# Restart the systemd-resolved service to apply changes
sudo systemctl restart systemd-resolved

# Confirm that systemd-resolved has restarted and DNS settings are applied
echo "Systemd-resolved service has been restarted with new DNS settings."

# --- Install required system packages ---
echo "Installing required system packages..."
sudo apt install -y git python3.12 python3.12-venv curl systemd
echo "System packages installed."

# --- Clone LadyLinux repository ---
cd ~
echo "Cloning Lady Linux Repository..."
sudo git clone https://github.com/theCodingProfessor/LadyLinux.git /opt
echo "Lady Linux Repo cloned successfully."

# --- Run the installer scripts ---
cd /opt
sudo chmod +x scripts/install_ladylinux.sh
sudo chmod +x scripts/refresh_vm.sh
sudo ./scripts/install_ladylinux.sh --clone --branch Capstone_Dev_01
# sudo ./scripts/install_ladylinux.sh --clone --branch main

# --- Install Ollama ---
echo "Installing Ollama"
curl -fsSL https://ollama.com/install.sh | sh
echo "Ollama installed."

# --- Initialize Ollama ---
echo "Initializing Ollama"
sudo systemctl start ollama
sudo systemctl enable ollama

# --- Pull the Mistral LLM ---
echo "Pulling the Mistral LLM"
ollama pull mistral

# --- Ensure ladylinux user has a home directory ---
echo "Ensuring ladylinux user has a home directory..."
if ! sudo test -d /home/ladylinux; then
    sudo mkdir -p /home/ladylinux
    sudo chown ladylinux:ladylinux /home/ladylinux
    sudo usermod -d /home/ladylinux ladylinux
fi

# --- Temporarily give ladylinux a shell so commands can run ---
echo "Temporarily setting ladylinux shell to /bin/bash for setup..."
sudo usermod -s /bin/bash ladylinux

# --- Install uv package manager for ladylinux user ---
echo "Setting up Python environment with uv"
if ! sudo -u ladylinux command -v uv >/dev/null 2>&1; then
    echo "Installing uv package manager for ladylinux user..."
    sudo -u ladylinux bash -c "curl -Ls https://astral.sh/uv/install.sh | sh"
fi

# --- Create virtual environment and install Python dependencies as ladylinux user ---
echo "Creating virtual environment and installing dependencies as ladylinux service user"
sudo -u ladylinux bash -c "
    export PATH=\$HOME/.local/bin:\$PATH

    cd /opt/ladylinux
    uv venv venv
    uv pip install --python venv/bin/python fastapi requests pydantic jinja2 uvicorn
"
echo "Python dependencies installed successfully."

# --- Restore ladylinux shell to nologin for security ---
echo "Restoring ladylinux shell to /usr/sbin/nologin..."
sudo usermod -s /usr/sbin/nologin ladylinux

# --- Start the LLM service ---
echo "Starting LLM service - please visit https://localhost:8000 to interact with LadyLinux"
sudo -u ladylinux bash -c "
    export PATH=\$HOME/.local/bin:\$PATH
    cd /opt/ladylinux/app
    ../venv/bin/uvicorn api_layer:app --reload --host 0.0.0.0 --port 8000
" &

echo "Mistral ready to run, running..."
ollama run mistral
