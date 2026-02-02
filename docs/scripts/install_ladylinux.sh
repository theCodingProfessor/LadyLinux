#!/usr/bin/env bash
#===============================================================================
# LadyLinux Installer (Filesystem + User Bootstrap)
# File: scripts/install_ladylinux.sh
#
# Purpose:
#   Prepare a host system (VM or physical) for a LadyLinux deployment by:
#     - Creating required runtime directories under /opt, /var, /etc
#     - Creating a dedicated service user "ladylinux"
#     - Setting safe ownership and permissions
#     - (Optional) Cloning the LadyLinux repo into /opt/ladylinux/app
#
# What this script does NOT do:
#   - Install Linux Mint or change OS settings
#   - Install/enable a systemd service unit (that can be separate)
#   - Download LLM model weights
#   - Delete or overwrite existing models/state/config
#
# Usage:
#   sudo ./scripts/install_ladylinux.sh [options]
#
# Options:
#   --clone                 Clone repo into /opt/ladylinux/app if not present
#   --repo <url>            Repo URL to clone (default: LadyLinux GitHub)
#   --branch <name>         Branch to checkout after clone (default: develop)
#   --no-user               Do not create the ladylinux service user
#   --dry-run               Print what would happen without changing anything
#   -h, --help              Show help
#
# Examples:
#   sudo ./scripts/install_ladylinux.sh
#   sudo ./scripts/install_ladylinux.sh --clone --branch develop
#   sudo ./scripts/install_ladylinux.sh --clone --repo https://github.com/theCodingProfessor/LadyLinux
#
# Exit codes:
#   0 success
#   1 generic failure
#   2 missing prerequisite / invalid usage
#===============================================================================

set -Eeuo pipefail

#----------------------------- Defaults ----------------------------------------

DO_CLONE="false"
REPO_URL="https://github.com/theCodingProfessor/LadyLinux"
BRANCH="develop"
DO_USER="true"
DRY_RUN="false"

SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"

BASE_DIR="/opt/ladylinux"
APP_DIR="$BASE_DIR/app"
VENV_DIR="$BASE_DIR/venv"
MODELS_DIR="$BASE_DIR/models"
CONTAINERS_DIR="$BASE_DIR/containers"

ETC_DIR="/etc/ladylinux"
ENV_FILE="$ETC_DIR/ladylinux.env"

VAR_DIR="/var/lib/ladylinux"
DATA_DIR="$VAR_DIR/data"
CACHE_DIR="$VAR_DIR/cache"
LOGS_DIR="$VAR_DIR/logs"

#------------------------------ Helpers ----------------------------------------

log()  { printf "[install] %s\n" "$*"; }
warn() { printf "[install][WARN] %s\n" "$*" >&2; }
die()  { printf "[install][ERROR] %s\n" "$*" >&2; exit "${2:-1}"; }

run() {
  # Execute commands, respecting dry-run mode.
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: $*"
  else
    "$@"
  fi
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Please run as root (use sudo)." 2
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1" 2
}

usage() {
  cat <<EOF
LadyLinux Installer: filesystem + service user bootstrap

Usage:
  sudo ./scripts/install_ladylinux.sh [options]

Options:
  --clone                 Clone repo into /opt/ladylinux/app if not present
  --repo <url>            Repo URL (default: $REPO_URL)
  --branch <name>         Branch to checkout after clone (default: $BRANCH)
  --no-user               Do not create the ladylinux service user
  --dry-run               Print actions without changing anything
  -h, --help              Show help

Examples:
  sudo ./scripts/install_ladylinux.sh
  sudo ./scripts/install_ladylinux.sh --clone --branch develop
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --clone) DO_CLONE="true"; shift ;;
      --repo)  REPO_URL="${2:-}"; [[ -n "$REPO_URL" ]] || die "--repo requires a URL" 2; shift 2 ;;
      --branch) BRANCH="${2:-}"; [[ -n "$BRANCH" ]] || die "--branch requires a name" 2; shift 2 ;;
      --no-user) DO_USER="false"; shift ;;
      --dry-run) DRY_RUN="true"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown argument: $1 (use --help)" 2 ;;
    esac
  done
}

ensure_group_user() {
  if [[ "$DO_USER" != "true" ]]; then
    log "Skipping service user creation (--no-user specified)."
    return 0
  fi

  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    log "Group exists: $SERVICE_GROUP"
  else
    log "Creating group: $SERVICE_GROUP"
    run groupadd --system "$SERVICE_GROUP"
  fi

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "User exists: $SERVICE_USER"
  else
    log "Creating system user: $SERVICE_USER"
    # --no-create-home keeps it minimal; services can still run fine.
    run useradd \
      --system \
      --gid "$SERVICE_GROUP" \
      --no-create-home \
      --shell /usr/sbin/nologin \
      "$SERVICE_USER"
  fi
}

mkdir_safe() {
  local d="$1"
  if [[ -d "$d" ]]; then
    log "Directory exists: $d"
  else
    log "Creating directory: $d"
    run mkdir -p "$d"
  fi
}

touch_safe() {
  local f="$1"
  if [[ -f "$f" ]]; then
    log "File exists: $f"
  else
    log "Creating file: $f"
    run install -m 0640 /dev/null "$f"
  fi
}

set_ownership_perms() {
  # /opt/ladylinux should be owned by ladylinux, but we keep parent readable.
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Setting ownership to $SERVICE_USER:$SERVICE_GROUP for runtime directories"
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$BASE_DIR"
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$VAR_DIR"
  else
    warn "Service user not present; skipping chown."
  fi

  # Permissions:
  # - /opt/ladylinux: group-readable, executable for traversal
  # - models/state likely contain sensitive data; keep them not world-writable
  log "Setting permissions"
  run chmod 0755 "$BASE_DIR" || true
  run chmod 0755 "$APP_DIR" "$VENV_DIR" "$CONTAINERS_DIR" || true
  run chmod 0750 "$MODELS_DIR" || true

  run chmod 0755 "$VAR_DIR" || true
  run chmod 0750 "$DATA_DIR" "$CACHE_DIR" "$LOGS_DIR" || true

  # /etc/ladylinux should be root-owned, readable by ladylinux (group), not world-readable
  mkdir_safe "$ETC_DIR"
  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    run chown -R root:"$SERVICE_GROUP" "$ETC_DIR"
    run chmod 0750 "$ETC_DIR"
  else
    run chown -R root:root "$ETC_DIR"
    run chmod 0750 "$ETC_DIR"
  fi
}

create_env_file_template() {
  # Create env file if absent. Do not overwrite.
  if [[ -f "$ENV_FILE" ]]; then
    log "Env file exists (not modified): $ENV_FILE"
    return 0
  fi

  log "Creating env file template: $ENV_FILE"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would write template contents to $ENV_FILE"
    return 0
  fi

  cat > "$ENV_FILE" <<'EOF'
# LadyLinux environment configuration
# Location: /etc/ladylinux/ladylinux.env
#
# Recommended: keep secrets out of Git. This file is machine-local.

# Example: FastAPI/Uvicorn bind settings
LADYLINUX_HOST=0.0.0.0
LADYLINUX_PORT=8000

# Example: model directory (persistent, not in Git)
LADYLINUX_MODELS_DIR=/opt/ladylinux/models

# Example: state directory (persistent)
LADYLINUX_STATE_DIR=/var/lib/ladylinux/data

# Example: environment mode
LADYLINUX_ENV=dev
EOF

  # secure perms: root:ladylinux (if group exists), 0640
  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    chown root:"$SERVICE_GROUP" "$ENV_FILE"
  else
    chown root:root "$ENV_FILE"
  fi
  chmod 0640 "$ENV_FILE"
}

clone_repo_if_requested() {
  if [[ "$DO_CLONE" != "true" ]]; then
    log "Repo clone not requested (use --clone to enable)."
    return 0
  fi

  require_cmd git

  if [[ -d "$APP_DIR/.git" ]]; then
    log "Repo already present: $APP_DIR (not recloned)"
    return 0
  fi

  if [[ -d "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
    die "$APP_DIR exists and is not empty, but not a git repo. Refusing to overwrite." 1
  fi

  log "Cloning repo into $APP_DIR"
  run mkdir -p "$APP_DIR"

  # Clone as root, then chown to service user if present.
  run git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$APP_DIR"
  fi
}

print_summary() {
  log "Installation summary:"
  log "  Base:        $BASE_DIR"
  log "    app:       $APP_DIR"
  log "    venv:      $VENV_DIR"
  log "    models:    $MODELS_DIR"
  log "    containers:$CONTAINERS_DIR"
  log "  Config:      $ETC_DIR"
  log "    env:       $ENV_FILE"
  log "  State:       $VAR_DIR"
  log "    data:      $DATA_DIR"
  log "    cache:     $CACHE_DIR"
  log "    logs:      $LOGS_DIR"
  log "  Service user: $SERVICE_USER (created: $DO_USER)"
  log "  Repo clone:   $DO_CLONE (repo: $REPO_URL, branch: $BRANCH)"
}

#-------------------------------- Main -----------------------------------------

main() {
  parse_args "$@"
  require_root

  # Minimal prerequisites
  require_cmd mkdir
  require_cmd chmod
  require_cmd chown
  require_cmd install

  log "Beginning LadyLinux install bootstrap (DRY_RUN=$DRY_RUN)"

  ensure_group_user

  # Create runtime dirs (safe; no deletions)
  mkdir_safe "$BASE_DIR"
  mkdir_safe "$APP_DIR"
  mkdir_safe "$VENV_DIR"
  mkdir_safe "$MODELS_DIR"
  mkdir_safe "$CONTAINERS_DIR"

  mkdir_safe "$VAR_DIR"
  mkdir_safe "$DATA_DIR"
  mkdir_safe "$CACHE_DIR"
  mkdir_safe "$LOGS_DIR"

  mkdir_safe "$ETC_DIR"
  create_env_file_template

  set_ownership_perms
  clone_repo_if_requested

  print_summary
  log "Install bootstrap complete."
}

main "$@"
