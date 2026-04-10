#!/usr/bin/env bash
#===============================================================================
# LadyLinux VM MIX Refresh Script
# File: scripts/refresh_lady_mix.sh
# Author: Clinton Garwood
# Version: 0.30
#
# Purpose:
#   Refresh the LadyLinux Application Layer on a running system from GitHub.
#   This script intentionally does NOT reinstall the OS, delete model weights,
#   or remove persistent application state.
#
# Primary actions:
#   1) Ensure service user + repo exist (bootstrap if missing)
#   2) Stop service (if present)
#   3) Hard-align repo to origin/<branch>
#   4) (Re)build Python venv only when needed (or broken)
#   5) Sync systemd unit file from repo and daemon-reload
#   6) Restart service and print summary
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

BRANCH="${1:-origin/colab/cap_dar_mix}"

APP_DIR=""
APP_DIR_CANDIDATES=("/opt/ladylinux/app" "/opt/ladylinux")
DEFAULT_APP_DIR="/opt/ladylinux"
REPO_URL="${REPO_URL:-https://github.com/theCodingProfessor/LadyLinux.git}"
VENV_DIR="/opt/ladylinux/venv"
ENV_FILE="/etc/ladylinux/ladylinux.env"
LOG_DIR="/var/log/ladylinux"
SUDOERS_FILE="/etc/sudoers.d/ladylinux-firewall"

SERVICE_NAME="ladylinux-api.service"
SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"

PYTHON_BIN="python3"
PIP_BIN="$VENV_DIR/bin/pip"

# If true: always rebuild the venv each run (most deterministic).
# If false: rebuild only when dependency file fingerprint changes.
ALWAYS_REBUILD_VENV="${ALWAYS_REBUILD_VENV:-false}"
BOOTSTRAP_IF_MISSING="${BOOTSTRAP_IF_MISSING:-true}"

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

detect_app_dir() {
  local candidate
  for candidate in "${APP_DIR_CANDIDATES[@]}"; do
    if [[ -d "$candidate/.git" ]]; then
      APP_DIR="$candidate"
      return 0
    fi
  done

  if [[ "$BOOTSTRAP_IF_MISSING" == "true" ]]; then
    APP_DIR="$DEFAULT_APP_DIR"
    warn "No existing repo found. Will bootstrap into: $APP_DIR"
    return 0
  fi

  die "Could not find a LadyLinux git repo. Checked: ${APP_DIR_CANDIDATES[*]}" 2
}

assert_paths() {
  [[ -d "$APP_DIR" ]] || die "APP_DIR not found: $APP_DIR" 2
  [[ -d "$APP_DIR/.git" ]] || die "APP_DIR is not a git repo: $APP_DIR" 2
}

ensure_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    return 0
  fi

  log "Service user '$SERVICE_USER' not found. Creating system user..."
  useradd -r -m -d "/home/$SERVICE_USER" -s /usr/sbin/nologin "$SERVICE_USER" \
    || die "Failed to create service user '$SERVICE_USER'" 1
}

bootstrap_repo_if_missing() {
  if [[ -d "$APP_DIR/.git" ]]; then
    return 0
  fi

  [[ "$BOOTSTRAP_IF_MISSING" == "true" ]] || die "Repo missing and bootstrap disabled" 2

  log "Bootstrapping repository at $APP_DIR (branch: $BRANCH)"
  mkdir -p "$(dirname "$APP_DIR")"

  if [[ -d "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
    die "Bootstrap target directory is not empty: $APP_DIR" 1
  fi

  if [[ ! -d "$APP_DIR" ]]; then
    mkdir -p "$APP_DIR"
  fi

  chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" >/dev/null 2>&1 || true
  run_as_service git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" \
    || die "Failed to clone repository into $APP_DIR" 1
}

service_stop() {
  # Skip stop if the unit is not loaded (e.g., first install, unit removed).
  if ! systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1 \
     || systemctl show -p LoadState "$SERVICE_NAME" 2>/dev/null | grep -q "LoadState=not-found"; then
    warn "Service $SERVICE_NAME is not loaded. Skipping stop."
    return 0
  fi

  log "Stopping service: $SERVICE_NAME"
  systemctl stop "$SERVICE_NAME" || die "Failed to stop $SERVICE_NAME"
}

service_start() {
  if systemctl show -p LoadState "$SERVICE_NAME" 2>/dev/null | grep -q "LoadState=not-found"; then
    warn "Service $SERVICE_NAME is not loaded. Skipping start."
    return 0
  fi

  systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true

  log "Starting service: $SERVICE_NAME"
  if ! systemctl start "$SERVICE_NAME"; then
    warn "Service failed to start — dumping diagnostics:"
    echo ""
    echo "─── systemctl status ───────────────────────────────────────────────────"
    systemctl status "$SERVICE_NAME" --no-pager --full 2>&1 || true
    echo ""
    echo "─── journalctl (last 60 lines) ─────────────────────────────────────────"
    journalctl -xeu "$SERVICE_NAME" --no-pager -n 60 2>&1 || true
    echo "────────────────────────────────────────────────────────────────────────"
    echo ""
    die "Failed to start $SERVICE_NAME — see diagnostics above"
  fi
}

service_status() {
  if systemctl show -p LoadState "$SERVICE_NAME" 2>/dev/null | grep -q "LoadState=not-found"; then
    warn "Service $SERVICE_NAME is not loaded. No status to report."
    return 0
  fi

  log "Service status:"
  systemctl status "$SERVICE_NAME" --no-pager --full 2>&1 | head -20 || true
}

run_as_service() {
  # Run a command as the ladylinux service user.
  sudo -u "$SERVICE_USER" -- "$@"
}

git_sync() {
  log "Syncing repo in $APP_DIR to origin/$BRANCH (as $SERVICE_USER)"
  pushd "$APP_DIR" >/dev/null

  # Fetch to get latest refs
  log "  Fetching from remote..."
  run_as_service git fetch --prune origin

  # Check if remote branch exists
  if ! run_as_service git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    die "Remote branch 'origin/$BRANCH' does not exist. Available branches:" 1
  fi

  # Get current branch
  local current_branch
  current_branch="$(run_as_service git rev-parse --abbrev-ref HEAD)"

  # Switch branch if needed
  if [ "$current_branch" != "$BRANCH" ]; then
    log "  Switching from branch '$current_branch' to '$BRANCH'..."
    run_as_service git checkout -f "$BRANCH" 2>/dev/null || run_as_service git checkout -b "$BRANCH" "origin/$BRANCH"
  fi

  # Hard align to remote (removes local drift).
  # --exclude=venv/ prevents git clean from wiping the Python virtual
  # environment, which lives inside the repo root but is not tracked.
  log "  Hard-aligning to origin/$BRANCH..."
  run_as_service git reset --hard "origin/$BRANCH"
  run_as_service git clean -fd --exclude=venv/ --exclude=venv

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

  # If venv exists but pip is broken/missing, rebuild.
  if [[ ! -x "$VENV_DIR/bin/pip" ]]; then
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

  # Back up existing venv if present (for safety)
  if [[ -d "$VENV_DIR" ]]; then
    log "  Removing existing venv..."
    rm -rf "$VENV_DIR"
  fi

  # Create and own the directory
  mkdir -p "$VENV_DIR"
  chown "$SERVICE_USER":"$SERVICE_USER" "$VENV_DIR"

  # Create venv as service user
  log "  Creating new virtual environment..."
  run_as_service "$PYTHON_BIN" -m venv "$VENV_DIR" \
    || die "Failed to create virtual environment" 1

  # Upgrade pip, wheel, setuptools
  log "  Upgrading pip, wheel, setuptools..."
  run_as_service "$PIP_BIN" install --upgrade pip wheel setuptools \
    || die "Failed to upgrade pip/wheel/setuptools" 1

  pushd "$APP_DIR" >/dev/null

  # Install from requirements.txt
  if [[ -f "requirements.txt" ]]; then
    log "  Installing dependencies from requirements.txt..."
    log "    Dependencies:"
    grep -v "^#" requirements.txt | grep -v "^$" | sed 's/^/      /'

    run_as_service "$PIP_BIN" install -r requirements.txt \
      || die "Failed to install dependencies from requirements.txt" 1

    log "  Dependencies installed successfully."
  elif [[ -f "pyproject.toml" ]]; then
    warn "pyproject.toml found but no installer configured in this script yet."
    warn "If you adopt Poetry/UV/PDM, update this section accordingly."
    die "Dependency install not configured for pyproject.toml yet." 1
  else
    die "No requirements.txt or pyproject.toml found in $APP_DIR" 1
  fi

  # Save fingerprint for next run
  local fp
  fp="$(fingerprint_deps)"
  if [[ -n "$fp" ]]; then
    run_as_service bash -c "echo '$fp' > '$FINGERPRINT_FILE'" \
      || warn "Could not save dependency fingerprint"
  fi

  popd >/dev/null

  log "Venv built successfully."
}

sync_systemd_unit() {
  local unit_src="$APP_DIR/ladylinux-api.service"
  local unit_dst="/etc/systemd/system/$SERVICE_NAME"

  if [[ ! -f "$unit_src" ]]; then
    warn "Service file not found in repo: $unit_src"
    return 0
  fi

  if [[ ! -f "$unit_dst" ]] || ! cmp -s "$unit_src" "$unit_dst"; then
    log "Syncing systemd unit file: $SERVICE_NAME"
    cp "$unit_src" "$unit_dst" || die "Failed to copy service unit" 1
    systemctl daemon-reload || die "Failed to reload systemd daemon" 1
  else
    log "Systemd unit already up to date."
  fi

  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
}

prep_application() {
  # Optional hook: run migrations, validations, compile steps, etc.
  # Keep it safe and fast. Runs as the service user.
  log "Preparation step: (none configured)"
  # Example (future):
  # run_as_service "$VENV_DIR/bin/python" -m ladylinux.migrate || die "Migration failed"
}

ensure_log_directory() {
  # Create /var/log/ladylinux with proper permissions
  log "Ensuring log directory: $LOG_DIR"
  mkdir -p "$LOG_DIR" || die "Failed to create log directory: $LOG_DIR" 1

  # Set ownership to service user if they exist
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    chown "$SERVICE_USER":"$SERVICE_GROUP" "$LOG_DIR" >/dev/null 2>&1 || true
  fi

  chmod 0755 "$LOG_DIR" || die "Failed to set permissions on log directory" 1
  log "  Log directory ready: $LOG_DIR"
}

validate_firewall_sudoers() {
  # Validate sudoers rule syntax (non-fatal; just warn if invalid)
  if [[ -f "$SUDOERS_FILE" ]]; then
    log "Validating firewall sudoers rule: $SUDOERS_FILE"
    if visudo -c -f "$SUDOERS_FILE" >/dev/null 2>&1; then
      log "  Sudoers rule is valid."
    else
      warn "Sudoers rule syntax invalid: $SUDOERS_FILE"
      warn "  Firewall commands will not have passwordless sudo access."
      warn "  Consider re-running install_ladylinux.sh --clone to fix."
    fi
  else
    warn "Firewall sudoers rule not found: $SUDOERS_FILE"
    warn "  Firewall queries may fail with permission errors."
    warn "  Run install_ladylinux.sh --clone to install sudoers rule."
  fi
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

#-------------------------------- Main -----------------------------------------

main() {
  require_root
  require_cmd git
  require_cmd "$PYTHON_BIN"
  require_cmd systemctl
  require_cmd sha256sum

  ensure_service_user

  detect_app_dir

  bootstrap_repo_if_missing

  log "======================================================================"
  log "LadyLinux Refresh Script"
  log "======================================================================"
  log "Branch:  $BRANCH"
  log "App:     $APP_DIR"
  log "Venv:    $VENV_DIR"
  log "Service: $SERVICE_NAME"
  log "User:    $SERVICE_USER"
  log "======================================================================"
  echo ""


  assert_paths

  # Ensure correct ownership baseline for service user (non-fatal).
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Ensuring correct ownership of application directories..."
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" >/dev/null 2>&1 || true
    mkdir -p /var/lib/ladylinux/{data,cache,logs} >/dev/null 2>&1 || true
    chown -R "$SERVICE_USER":"$SERVICE_USER" /var/lib/ladylinux >/dev/null 2>&1 || true
  else
    warn "Service user '$SERVICE_USER' not found. Skipping ownership adjustments."
  fi

  ensure_log_directory
  validate_firewall_sudoers

  service_stop
  git_sync

  if venv_rebuild_needed; then
    log "Venv rebuild needed (ALWAYS_REBUILD_VENV=$ALWAYS_REBUILD_VENV, or deps changed)"
    build_venv
  else
    log "Venv rebuild not needed; dependency fingerprint unchanged."
    log "To force rebuild, set: ALWAYS_REBUILD_VENV=true"
  fi

  prep_application
  sync_systemd_unit
  service_start

  echo ""
  print_summary
  echo ""

  log "======================================================================"
  log "Refresh complete. ✓"
  log "======================================================================"
  log ""
  log "═══════════════════════════════════════════════════════════════════════"
  log "  🎉 LadyLinux Refresh Complete!"
  log "═══════════════════════════════════════════════════════════════════════"
  log ""
  log "The LadyLinux API service is now running!"
  log ""
  log "📍 Quick Access:"
  log "  • Web Interface:  http://localhost:8000"
  log "  • API Endpoint:   http://localhost:8000/docs"
  log ""
  log "🔧 Service Management:"
  log "  • Check status:   sudo systemctl status ladylinux-api"
  log "  • Stop service:   sudo systemctl stop ladylinux-api"
  log "  • Start service:  sudo systemctl start ladylinux-api"
  log "  • Restart:        sudo systemctl restart ladylinux-api"
  log "  • View logs:      journalctl -u ladylinux-api -f"
  log ""
  log "  To re-run the refresh script, elevate permissions"
  log "  > sudo chmod +x refresh_lady.sh"
  log ""
  log "📚 Documentation:"
  log "  • Quick Reference: docs/SCRIPTS_QUICK_REFERENCE.md"
  log "  • Full Guide:      docs/SCRIPTS_INSTALLATION_AND_REFRESH.md"
  log "  • Quick Start:     QUICK_START_CHECKLIST.md"
  log ""
  log "🐍 Run Manually:"
  log "  cd /opt/ladylinux"
  log "  source venv/bin/activate"
  log "  uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000"
  log ""

  service_status
}

# --- Refresh Workflow is Complete ---
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
main "$@"
