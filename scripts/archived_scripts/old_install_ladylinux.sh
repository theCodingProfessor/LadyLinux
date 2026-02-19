#!/usr/bin/env bash
#===============================================================================
# LadyLinux Installer (Filesystem + User Bootstrap) - Refactored
# File: scripts/install_ladylinux.sh
#
# Goals of this refactor:
#   - Create required runtime directories under /opt, /var, /etc safely
#   - Create service user/group ("ladylinux") safely
#   - Avoid nested clone mistakes (/opt/ladylinux/app/LadyLinux)
#   - Provide a repair mechanism if a nested repo already exists
#
# Usage:
#   sudo ./scripts/install_ladylinux.sh [options]
#
# Common:
#   sudo ./scripts/install_ladylinux.sh --clone --branch main --repair-layout
#===============================================================================

set -Eeuo pipefail

#----------------------------- Defaults ----------------------------------------

DO_CLONE="false"
REPO_URL="https://github.com/theCodingProfessor/LadyLinux"
BRANCH="main"
DO_USER="true"
DRY_RUN="false"

REPAIR_LAYOUT="false"
FORCE_ADOPT_NESTED="false"

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
  --clone                   Clone repo into /opt/ladylinux/app if not present
  --repo <url>              Repo URL (default: $REPO_URL)
  --branch <name>           Branch to checkout after clone (default: $BRANCH)
  --repair-layout           If a nested repo exists at /opt/ladylinux/app/LadyLinux, fix it
  --force-adopt-nested      If nested repo exists, keep it nested (NOT recommended)
  --no-user                 Do not create the ladylinux service user
  --dry-run                 Print actions without changing anything
  -h, --help                Show help

Examples:
  sudo ./scripts/install_ladylinux.sh --clone --branch main --repair-layout
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --clone) DO_CLONE="true"; shift ;;
      --repo)  REPO_URL="${2:-}"; [[ -n "$REPO_URL" ]] || die "--repo requires a URL" 2; shift 2 ;;
      --branch) BRANCH="${2:-}"; [[ -n "$BRANCH" ]] || die "--branch requires a name" 2; shift 2 ;;
      --repair-layout) REPAIR_LAYOUT="true"; shift ;;
      --force-adopt-nested) FORCE_ADOPT_NESTED="true"; shift ;;
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

create_env_file_template() {
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
# LadyLinux environment configuration (machine-local)
LADYLINUX_HOST=0.0.0.0
LADYLINUX_PORT=8000
LADYLINUX_MODELS_DIR=/opt/ladylinux/models
LADYLINUX_STATE_DIR=/var/lib/ladylinux/data
LADYLINUX_ENV=dev
EOF

  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    chown root:"$SERVICE_GROUP" "$ENV_FILE"
  else
    chown root:root "$ENV_FILE"
  fi
  chmod 0640 "$ENV_FILE"
}

set_ownership_perms() {
  # /opt and /var are service-owned; /etc is root-owned and group-readable
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Setting ownership for runtime directories"
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$BASE_DIR"
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$VAR_DIR"
  else
    warn "Service user not present; skipping chown for /opt and /var."
  fi

  log "Setting permissions"
  run chmod 0755 "$BASE_DIR" || true
  run chmod 0755 "$APP_DIR" "$VENV_DIR" "$CONTAINERS_DIR" || true
  run chmod 0750 "$MODELS_DIR" || true

  run chmod 0755 "$VAR_DIR" || true
  run chmod 0750 "$DATA_DIR" "$CACHE_DIR" "$LOGS_DIR" || true

  mkdir_safe "$ETC_DIR"
  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    run chown -R root:"$SERVICE_GROUP" "$ETC_DIR"
  else
    run chown -R root:root "$ETC_DIR"
  fi
  run chmod 0750 "$ETC_DIR" || true
  [[ -f "$ENV_FILE" ]] && run chmod 0640 "$ENV_FILE" || true
}

detect_nested_repo() {
  [[ -d "$APP_DIR/LadyLinux/.git" && ! -d "$APP_DIR/.git" ]]
}

repair_nested_repo_layout() {
  # Converts /opt/ladylinux/app/LadyLinux (repo root) into /opt/ladylinux/app (repo root)
  if ! detect_nested_repo; then
    return 0
  fi

  if [[ "$FORCE_ADOPT_NESTED" == "true" ]]; then
    warn "Nested repo detected at $APP_DIR/LadyLinux, but --force-adopt-nested was set. Keeping as-is."
    return 0
  fi

  if [[ "$REPAIR_LAYOUT" != "true" ]]; then
    warn "Nested repo detected at: $APP_DIR/LadyLinux"
    warn "Recommended: re-run with --repair-layout to fix it."
    return 0
  fi

  log "Repairing nested repo layout: moving $APP_DIR/LadyLinux -> $APP_DIR"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would move repo up one level and remove the outer directory"
    return 0
  fi

  run mv "$APP_DIR/LadyLinux" "$APP_DIR.__tmp_repo"
  run rm -rf "$APP_DIR"
  run mv "$APP_DIR.__tmp_repo" "$APP_DIR"
}

clone_repo_if_requested() {
  if [[ "$DO_CLONE" != "true" ]]; then
    log "Repo clone not requested (use --clone to enable)."
    return 0
  fi

  require_cmd git

  # If correct repo already present, do nothing
  if [[ -d "$APP_DIR/.git" ]]; then
    log "Repo already present: $APP_DIR (not recloned)"
    return 0
  fi

  # If nested repo exists, optionally repair/adopt it
  if detect_nested_repo; then
    repair_nested_repo_layout
    # After repair/adopt, if repo is now present, stop here
    if [[ -d "$APP_DIR/.git" || "$FORCE_ADOPT_NESTED" == "true" ]]; then
      return 0
    fi
  fi

  # Guard: refuse to overwrite non-empty non-repo directory
  if [[ -d "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
    die "$APP_DIR exists and is not empty, but not a git repo. Refusing to overwrite. (Move it aside or use --repair-layout if nested.)" 1
  fi

  log "Cloning repo into $APP_DIR (branch: $BRANCH)"
  run mkdir -p "$APP_DIR"
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

main() {
  parse_args "$@"
  require_root

  require_cmd mkdir
  require_cmd chmod
  require_cmd chown
  require_cmd install

  log "Beginning LadyLinux install bootstrap (DRY_RUN=$DRY_RUN)"

  ensure_group_user

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

  # If nested repo still exists and was adopted, warn loudly so refresh can be configured accordingly
  if detect_nested_repo && [[ "$FORCE_ADOPT_NESTED" == "true" ]]; then
    warn "Repo is nested at $APP_DIR/LadyLinux. Some tooling may assume $APP_DIR is repo root."
  fi

  print_summary
  log "Install bootstrap complete."
}

main "$@"
