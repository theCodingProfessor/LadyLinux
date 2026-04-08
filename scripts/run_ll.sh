#!/usr/bin/env bash
# scripts/run_ll.sh
# Starts Ollama and the LadyLinux API service.
# Called by LadyLinux-Start.desktop and LLStart.desktop.
# Requires NOPASSWD sudo for systemctl start ollama + ladylinux-api.service.

set -euo pipefail

echo "Starting LadyLinux..."

# Start Ollama if not already active
if ! systemctl is-active --quiet ollama; then
    sudo systemctl start ollama
    echo "Ollama started."
else
    echo "Ollama already running."
fi

# Start FastAPI service if not already active
if ! systemctl is-active --quiet ladylinux-api.service; then
    sudo systemctl start ladylinux-api.service
    echo "LadyLinux API started."
else
    echo "LadyLinux API already running."
fi

echo "Done. LadyLinux is up."