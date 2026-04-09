#!/usr/bin/env bash
# ==============================================================================
# LadyLinux VM Refresh Script
# File: scripts/refresh_vm.sh
# Author: Sean Connelly
# Version: 0.21
#
# Purpose:
#   Refresh the LadyLinux Application Layer on a running system from GitHub.
#   This script intentionally does NOT reinstall the OS, delete model weights,
#   or remove persistent application state.
#
# Primary actions:
#   1) Stop service
#   2) Hard-align repo to origin/<branch>
#   3) (Re)build Python venv and install dependencies
#   4) Restart service
#   5) Print commit + service status
#
# Usage:
#   sudo ./scripts/refresh_vm.sh [branch]
#
# Examples:
#   sudo ./scripts/refresh_vm.sh develop
#   sudo ./scripts/refresh_vm.sh main
#
# Notes:
#   - Expects system layout per docs/DEPLOYMENT.md:
#       /opt/ladylinux/app   (git repo)
#       /opt/ladylinux/venv  (python venv)
#       /etc/ladylinux/ladylinux.env (optional env file)
#   - Expects a systemd unit (e.g., ladylinux-api.service).
#
# Exit codes:
#   0  success
#   1  generic failure
#   2  missing prerequisite (git, python, system paths)
# ==============================================================================

set -Eeuo pipefail

#----------------------------- Configuration -----------------------------------

BRANCH="${1:-main}"

APP_DIR="/opt/ladylinux"
VENV_DIR="/opt/ladylinux/venv"
ENV_FILE="/etc/ladylinux/ladylinux.env"

GIT_REMOTE_URL="https://github.com/Brown-DJ/LadyLinux_test.git"
SERVICE_NAME="ladylinux-api.service"
LLM_SERVICE_NAME="ladylinux-llm.service"
SERVICE_USER="ladylinux"
API_PORT="8000"
FALLBACK_LOG_FILE="/var/lib/ladylinux/logs/uvicorn-refresh.log"

BOOTSTRAP_PYTHON="python3.12"
PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"

# If true: always rebuild the venv each run (most deterministic).
# If false: rebuild only when dependency file fingerprint changes.
ALWAYS_REBUILD_VENV="${ALWAYS_REBUILD_VENV:-false}"

# Dependency file(s) to fingerprint. Adjust if you use pyproject.toml/poetry later.
DEPS_FILES=("requirements.txt" "pyproject.toml" "poetry.lock")
FINGERPRINT_FILE="$VENV_DIR/.deps_fingerprint"

#------------------------------ Helpers ----------------------------------------

log()  { printf "[refresh] %s\n" "$*"; }
warn() { printf "[refresh][WARN] %s\n" "$*" >&2; }
die()  { printf "[refresh][ERROR] %s\n" "$*" >&2; exit "${2:-1}"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1" 2
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Please run as root (e.g., sudo ./scripts/refresh_vm.sh $BRANCH)" 2
  fi
}

assert_paths() {
  [[ -d "$APP_DIR" ]] || die "APP_DIR not found: $APP_DIR (is LadyLinux cloned there?)" 2
  [[ -d "$APP_DIR/.git" ]] || die "APP_DIR is not a git repo: $APP_DIR" 2
}

service_loaded() {
  systemctl show -p LoadState "$SERVICE_NAME" 2>/dev/null | grep -q "LoadState=loaded"
}

stop_fallback_process() {
  local pids=""
  pids="$(pgrep -f "/opt/ladylinux/venv/bin/python -m uvicorn api_layer:app --host 0.0.0.0 --port $API_PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    log "Stopping existing fallback uvicorn process on port $API_PORT"
    while read -r pid; do
      [[ -n "$pid" ]] || continue
      kill "$pid" 2>/dev/null || true
    done <<< "$pids"
  fi
}

service_stop() {
  # Skip stop if the unit is not loaded (e.g., first install, unit removed).
  if ! service_loaded; then
    warn "Service $SERVICE_NAME is not loaded. Using fallback cleanup instead."
    stop_fallback_process
    return 0
  fi

  log "Stopping service: $SERVICE_NAME"
  systemctl stop "$SERVICE_NAME" || die "Failed to stop $SERVICE_NAME"
  stop_fallback_process
}

start_fallback_api() {
  log "Service $SERVICE_NAME is not loaded. Using fallback uvicorn startup."
  mkdir -p "$(dirname "$FALLBACK_LOG_FILE")"
  touch "$FALLBACK_LOG_FILE"
  chown "$SERVICE_USER":"$SERVICE_USER" "$FALLBACK_LOG_FILE" 2>/dev/null || true

  run_as_service bash -lc "cd '$APP_DIR' && nohup '$VENV_DIR/bin/python' -m uvicorn api_layer:app --host 0.0.0.0 --port $API_PORT >> '$FALLBACK_LOG_FILE' 2>&1 < /dev/null &"
}

service_start() {
  if ! service_loaded; then
    start_fallback_api
    return 0
  fi

  log "Starting service: $SERVICE_NAME"
  systemctl start "$SERVICE_NAME" || die "Failed to start $SERVICE_NAME"
  log "Startup mode: systemd service"
}

service_status() {
  if ! service_loaded; then
    warn "Service $SERVICE_NAME is not loaded. Reporting fallback uvicorn status instead."
    pgrep -af "/opt/ladylinux/venv/bin/python -m uvicorn api_layer:app --host 0.0.0.0 --port $API_PORT" || true
    return 0
  fi

  log "Service status:"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
}

ensure_llm_service() {
  log "Ensuring LLM runtime service is running: $LLM_SERVICE_NAME"
  systemctl daemon-reload || true
  systemctl enable "$LLM_SERVICE_NAME" || true
  systemctl restart "$LLM_SERVICE_NAME" || die "Failed to start $LLM_SERVICE_NAME"
  systemctl --no-pager --full status "$LLM_SERVICE_NAME" || true

  if command -v curl >/dev/null 2>&1; then
    if curl --silent --fail --max-time 5 "http://127.0.0.1:11434" >/dev/null 2>&1; then
      log "LLM health check passed: 127.0.0.1:11434 reachable."
    else
      warn "LLM health check warning: 127.0.0.1:11434 did not respond yet."
    fi
  fi
}

run_as_service() {
  # Run a command as the ladylinux service user.
  sudo -u "$SERVICE_USER" -- "$@"
}

git_sync() {
  log "Syncing repo in $APP_DIR to origin/$BRANCH (as $SERVICE_USER)"
  pushd "$APP_DIR" >/dev/null

  log "Configuring Git safe.directory for $APP_DIR"
  run_as_service bash -lc "git config --global --get-all safe.directory | grep -Fxq '$APP_DIR' || git config --global --add safe.directory '$APP_DIR'"

  local current_origin_url
  current_origin_url="$(run_as_service git remote get-url origin 2>/dev/null || true)"
  if [[ "$current_origin_url" != "$GIT_REMOTE_URL" ]]; then
    log "Setting origin to $GIT_REMOTE_URL"
    if run_as_service git remote | grep -Fxq origin; then
      run_as_service git remote set-url origin "$GIT_REMOTE_URL"
    else
      run_as_service git remote add origin "$GIT_REMOTE_URL"
    fi
    current_origin_url="$GIT_REMOTE_URL"
  fi

  # Fetch and hard-align. This intentionally removes local drift.
  run_as_service git fetch --prune origin

  if ! run_as_service git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    printf "[refresh][ERROR] Requested branch not found on origin. Aborting before reset/clean.\n" >&2
    printf "[refresh][ERROR] Requested branch: %s\n" "$BRANCH" >&2
    printf "[refresh][ERROR] Origin URL: %s\n" "$current_origin_url" >&2
    printf "[refresh][ERROR] Remote branches:\n" >&2
    run_as_service git branch -r >&2 || true
    popd >/dev/null
    exit 1
  fi

  run_as_service git checkout -f "$BRANCH" 2>/dev/null || true

  # Use remote-tracking branch as source of truth:
  run_as_service git reset --hard "origin/$BRANCH"
  run_as_service git clean -fd

  local commit
  commit="$(run_as_service git rev-parse --short HEAD)"
  log "Repo now at commit: $commit (branch: $BRANCH)"

  popd >/dev/null
}

fingerprint_deps() {
  # Build a stable fingerprint from the first dependency file that exists.
  # If multiple exist (future), this can be extended to hash all of them.
  pushd "$APP_DIR" >/dev/null

  for f in "${DEPS_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      run_as_service sha256sum "$f" | awk '{print $1}'
      popd >/dev/null
      return 0
    fi
  done

  popd >/dev/null
  warn "No dependency file found (looked for: ${DEPS_FILES[*]})."
  # Return empty fingerprint; caller decides what to do.
  echo ""
}

venv_rebuild_needed() {
  if [[ "$ALWAYS_REBUILD_VENV" == "true" ]]; then
    return 0
  fi

  # If no venv exists, rebuild.
  if [[ ! -d "$VENV_DIR" || ! -x "$VENV_DIR/bin/python" ]]; then
    return 0
  fi

  local new_fp old_fp
  new_fp="$(fingerprint_deps)"
  old_fp=""
  [[ -f "$FINGERPRINT_FILE" ]] && old_fp="$(cat "$FINGERPRINT_FILE" || true)"

  # If we can't fingerprint, err on rebuild for safety.
  if [[ -z "$new_fp" ]]; then
    return 0
  fi

  if [[ "$new_fp" != "$old_fp" ]]; then
    return 0
  fi

  return 1
}

build_venv() {
  log "Building Python venv at: $VENV_DIR (as $SERVICE_USER)"
  rm -rf "$VENV_DIR"
  mkdir -p "$VENV_DIR"
  chown "$SERVICE_USER":"$SERVICE_USER" "$VENV_DIR"

  if ! command -v "$BOOTSTRAP_PYTHON" >/dev/null 2>&1; then
    BOOTSTRAP_PYTHON="python3"
  fi

  run_as_service "$BOOTSTRAP_PYTHON" -m venv "$VENV_DIR"
  run_as_service "$PIP_BIN" install --upgrade pip wheel setuptools

  pushd "$APP_DIR" >/dev/null

  if [[ -f "requirements.txt" ]]; then
    log "Installing dependencies from requirements.txt"
    run_as_service "$PIP_BIN" install -r requirements.txt
  else
    install_fallback_runtime_deps
  fi

  local fp
  fp="$(fingerprint_deps)"
  if [[ -n "$fp" ]]; then
    run_as_service bash -c "echo '$fp' > '$FINGERPRINT_FILE'"
  else
    run_as_service bash -c "echo 'default-runtime-stack' > '$FINGERPRINT_FILE'"
  fi

  popd >/dev/null
}

prep_application() {
  # Optional hook: run migrations, validations, compile steps, etc.
  # Keep it safe and fast. Runs as the service user.
  log "Preparation step: (none configured)"
  # Example (future):
  # run_as_service "$VENV_DIR/bin/python" -m ladylinux.migrate || die "Migration failed"
}

print_summary() {
  pushd "$APP_DIR" >/dev/null
  local commit
  commit="$(run_as_service git rev-parse --short HEAD)"
  popd >/dev/null

  log "Summary:"
  log "  Branch:  $BRANCH"
  log "  Commit:  $commit"
  log "  App:     $APP_DIR"
  log "  Venv:    $VENV_DIR"
  log "  Service: $SERVICE_NAME"
}

validate_runtime() {
  local attempts=10
  local api_ready=0

  while (( attempts > 0 )); do
    if lsof -i :"$API_PORT" >/dev/null 2>&1; then
      api_ready=1
      break
    fi
    sleep 1
    ((attempts--))
  done

  if [[ "$api_ready" -ne 1 ]]; then
    printf "[refresh][ERROR] API failed to start; port %s is not listening.\n" "$API_PORT" >&2
    if service_loaded; then
      printf "[refresh][ERROR] Inspect: journalctl -u %s -n 100 --no-pager\n" "$SERVICE_NAME" >&2
    else
      printf "[refresh][ERROR] Inspect fallback log: %s\n" "$FALLBACK_LOG_FILE" >&2
    fi
    exit 1
  fi

  log "Runtime validation: port $API_PORT is listening."
  lsof -i :"$API_PORT" || true

  if command -v curl >/dev/null 2>&1; then
    if curl --silent --fail --max-time 5 "http://127.0.0.1:$API_PORT/" >/dev/null 2>&1; then
      log "HTTP validation: localhost:$API_PORT responded successfully."
    else
      warn "HTTP validation failed for http://127.0.0.1:$API_PORT/ (process is listening, but no successful HTTP response)."
    fi
  else
    warn "curl not installed; skipping HTTP validation."
  fi
}

install_fallback_runtime_deps() {
  # Keep refresh resilient when a dependency manifest is missing.
  log "Dependency manifest not found or unsupported; installing fallback runtime stack."
  run_as_service "$PIP_BIN" install fastapi uvicorn requests jinja2 python-multipart
}

open_browser_if_gui() {
  # Open the local UI only when a desktop session is available.
  if [[ -n "${DISPLAY:-}" ]] || [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    HOST_IP=$(hostname -I | awk '{print $1}')
    local url="http://$HOST_IP:$API_PORT/"
    log "Opening Web App: $url"

    if [[ -n "${SUDO_USER:-}" ]]; then
      sudo -u "$SUDO_USER" DISPLAY="${DISPLAY:-}" firefox --ssb "$url" --class LadyLinuxApp &
    else
      firefox --ssb "$url" --class LadyLinuxApp &
    fi
  else
    log "No GUI detected. Not launching browser."
  fi
}

#-------------------------------- Main -----------------------------------------

main() {
  require_root
  require_cmd git
  require_cmd sudo
  require_cmd "$BOOTSTRAP_PYTHON"
  require_cmd systemctl
  require_cmd sha256sum
  require_cmd lsof

  assert_paths

  # Ensure correct ownership baseline for service user (non-fatal).
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" >/dev/null 2>&1 || true
    mkdir -p /var/lib/ladylinux/{data,cache,logs} >/dev/null 2>&1 || true
    chown -R "$SERVICE_USER":"$SERVICE_USER" /var/lib/ladylinux >/dev/null 2>&1 || true
  else
    warn "Service user '$SERVICE_USER' not found. Skipping ownership adjustments."
  fi

  service_stop
  git_sync

  if venv_rebuild_needed; then
    log "Venv rebuild needed (ALWAYS_REBUILD_VENV=$ALWAYS_REBUILD_VENV)"
    build_venv
  else
    log "Venv rebuild not needed; dependency fingerprint unchanged."
  fi

  [[ -x "$PYTHON_BIN" ]] || die "Venv python missing after setup: $PYTHON_BIN"
  [[ -x "$PIP_BIN" ]] || die "Venv pip missing after setup: $PIP_BIN"

  prep_application
  ensure_llm_service
  service_start
  validate_runtime
  print_summary
  service_status

  open_browser_if_gui

  log "Final API status: running"
  log "Refresh complete."
}

main "$@"
