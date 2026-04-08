#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  echo "[LadyLinux] $1"
}

ROOT_DIR="/opt/ladylinux"
APP_DIR="$ROOT_DIR/app"
VENV_DIR="$ROOT_DIR/venv"
SCRIPTS_DIR="$ROOT_DIR/scripts"
SERVICE_USER="ladylinux"
API_SERVICE="ladylinux-api.service"
LLM_SERVICE="ladylinux-llm.service"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log "Run as root."
    exit 1
  fi
}

run_fix_bom() {
  if [[ -x "$SCRIPTS_DIR/fix_bom.sh" ]]; then
    "$SCRIPTS_DIR/fix_bom.sh"
  fi
}

check_repo() {
  if [[ ! -d "$APP_DIR/.git" ]]; then
    log "Repository missing at $APP_DIR"
    exit 1
  fi
  log "Repository exists."
}

check_venv() {
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    log "Venv missing; rebuilding."
    sudo -u "$SERVICE_USER" python3 -m venv "$VENV_DIR"
  fi
}

check_dependencies() {
  if [[ ! -f "$APP_DIR/requirements.txt" ]]; then
    log "requirements.txt missing."
    exit 1
  fi

  log "Installing dependencies."
  sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install --upgrade pip wheel setuptools
  sudo -u "$SERVICE_USER" "$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt"
}

check_permissions() {
  log "Fixing ownership under $ROOT_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$ROOT_DIR"
}

check_services() {
  if ! command -v systemctl >/dev/null 2>&1; then
    log "systemd unavailable; service checks skipped."
    return
  fi

  for service_name in "$API_SERVICE" "$LLM_SERVICE"; do
    if ! systemctl list-unit-files | grep -q "^$service_name"; then
      log "Service unit $service_name is missing."
      exit 1
    fi
  done

  systemctl daemon-reload
  systemctl enable "$API_SERVICE"
  systemctl restart "$LLM_SERVICE"
  systemctl restart "$API_SERVICE"

  for service_name in "$API_SERVICE" "$LLM_SERVICE"; do
    if ! systemctl is-active "$service_name" >/dev/null 2>&1; then
      log "$service_name is not running."
      exit 1
    fi
  done

  log "Service checks passed."
}

main() {
  require_root
  run_fix_bom
  check_repo
  check_venv
  check_dependencies
  check_permissions
  check_services
  log "Doctor checks complete."
}

main "$@"
