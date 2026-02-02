#!/usr/bin/env bash
#===============================================================================
# LadyLinux VM Refresh Script
# File: scripts/refresh_vm.sh
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
#===============================================================================

set -Eeuo pipefail

#----------------------------- Configuration -----------------------------------

BRANCH="${1:-main}"

APP_DIR="/opt/ladylinux/app"
VENV_DIR="/opt/ladylinux/venv"
ENV_FILE="/etc/ladylinux/ladylinux.env"

SERVICE_NAME="ladylinux-api.service"
SERVICE_USER="ladylinux"

PYTHON_BIN="python3"
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

service_stop() {
  log "Stopping service: $SERVICE_NAME"
  systemctl stop "$SERVICE_NAME" || die "Failed to stop $SERVICE_NAME"
}

service_start() {
  log "Starting service: $SERVICE_NAME"
  systemctl start "$SERVICE_NAME" || die "Failed to start $SERVICE_NAME"
}

service_status() {
  log "Service status:"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
}

git_sync() {
  log "Syncing repo in $APP_DIR to origin/$BRANCH"
  pushd "$APP_DIR" >/dev/null

  # Fetch and hard-align. This intentionally removes local drift.
  git fetch --prune origin
  git checkout -f "$BRANCH" 2>/dev/null || true

  # Use remote-tracking branch as source of truth:
  git reset --hard "origin/$BRANCH"
  git clean -fd

  local commit
  commit="$(git rev-parse --short HEAD)"
  log "Repo now at commit: $commit (branch: $BRANCH)"

  popd >/dev/null
}

fingerprint_deps() {
  # Build a stable fingerprint from the first dependency file that exists.
  # If multiple exist (future), this can be extended to hash all of them.
  pushd "$APP_DIR" >/dev/null

  for f in "${DEPS_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      sha256sum "$f" | awk '{print $1}'
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
  log "Building Python venv at: $VENV_DIR"
  rm -rf "$VENV_DIR"
  mkdir -p "$VENV_DIR"

  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$PIP_BIN" install --upgrade pip wheel setuptools

  pushd "$APP_DIR" >/dev/null

  if [[ -f "requirements.txt" ]]; then
    log "Installing dependencies from requirements.txt"
    "$PIP_BIN" install -r requirements.txt
  elif [[ -f "pyproject.toml" ]]; then
    warn "pyproject.toml found but no installer configured in this script yet."
    warn "If you adopt Poetry/UV/PDM, update this section accordingly."
    die "Dependency install not configured for pyproject.toml yet." 1
  else
    warn "No requirements.txt or pyproject.toml found. Skipping dependency install."
  fi

  local fp
  fp="$(fingerprint_deps)"
  if [[ -n "$fp" ]]; then
    echo "$fp" > "$FINGERPRINT_FILE"
  fi

  popd >/dev/null
}

prep_application() {
  # Optional hook: run migrations, validations, compile steps, etc.
  # Keep it safe and fast.
  log "Preparation step: (none configured)"
  # Example (future):
  # "$VENV_DIR/bin/python" -m ladylinux.migrate || die "Migration failed"
}

print_summary() {
  pushd "$APP_DIR" >/dev/null
  local commit
  commit="$(git rev-parse --short HEAD)"
  popd >/dev/null

  log "Summary:"
  log "  Branch:  $BRANCH"
  log "  Commit:  $commit"
  log "  App:     $APP_DIR"
  log "  Venv:    $VENV_DIR"
  log "  Service: $SERVICE_NAME"
}

#-------------------------------- Main -----------------------------------------

main() {
  require_root
  require_cmd git
  require_cmd "$PYTHON_BIN"
  require_cmd systemctl
  require_cmd sha256sum

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

  prep_application
  service_start
  print_summary
  service_status

  log "Refresh complete."
}

main "$@"
