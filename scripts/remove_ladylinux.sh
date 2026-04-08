#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  echo "[LadyLinux] $1"
}

ROOT_DIR="/opt/ladylinux"
API_SERVICE="ladylinux-api.service"
LLM_SERVICE="ladylinux-llm.service"
SERVICE_USER="ladylinux"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  log "Run as root."
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$API_SERVICE" || true
  systemctl stop "$LLM_SERVICE" || true
  systemctl disable "$API_SERVICE" || true
  systemctl disable "$LLM_SERVICE" || true
fi

rm -rf "$ROOT_DIR"

if id "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" || true
fi

log "Removal complete."
