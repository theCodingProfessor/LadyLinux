#!/usr/bin/env bash
# scripts/stop_ll.sh
# Stops the LadyLinux API service.
# Leaves Ollama running intentionally — it may be used by other tools.
# Called by LadyLinux-Stop.desktop.
# Requires NOPASSWD sudo for systemctl stop ladylinux-api.service.

set -euo pipefail

echo "Stopping LadyLinux API..."

sudo systemctl stop ladylinux-api.service

echo "LadyLinux API stopped."