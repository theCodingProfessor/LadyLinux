#!/usr/bin/env bash
#===============================================================================
# LadyLinux VM Refresh Script - Refactored
# File: scripts/refresh_vm.sh
#
# Goals of this refactor:
#   - Work even if repo is nested (/opt/ladylinux/app/LadyLinux)
#   - Optionally repair the nested repo layout
#   - Auto-install the systemd unit if missing
#   - Keep models/state/config safe (no deletes)
#===============================================================================

set -Eeuo pipefail

#----------------------------- Defaults ----------------------------------------

BRANCH="${1:-main}"

BASE_DIR="/opt/ladylinux"
APP_PARENT="$BASE_DIR/app"       # may be repo root OR may contain LadyLinux/
VENV_DIR="$BASE_DIR/venv"

ETC_DIR="/etc/ladylinux"
ENV_FILE="$ETC_DIR/ladylinux.env"

VAR_DIR="/var/lib/ladylinux"

SERVICE_NAME="ladylinux-api.service"
SYSTEMD_TARGET="/etc/systemd/system/$SERVICE_NAME"
SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"

PYTHON_BIN="python3"
PIP_BIN="$VENV_DIR/bin/pip"

ALWAYS_REBUILD_VENV="${ALWAYS_REBUILD_VENV:-false}"
REPAIR_LAYOUT="false"
FORCE_UNIT_INSTALL="false"
DRY_RUN="false"

DEPS_FILES=("requirements.txt" "pyproject.toml" "poetry.lock")
FINGERPRINT_FILE="$VENV_DIR/.deps_fingerprint"

#------------------------------ Helpers ----------------------------------------

log()  { printf "[refresh] %s\n" "$*"; }
warn() { printf "[refresh][WARN] %s\n" "$*" >&2; }
die()  { printf "[refresh][ERROR] %s\n" "$*" >&2; exit "${2:-1}"; }

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: $*"
  else
    "$@"
  fi
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Please run as root (e.g., sudo ./scripts/refresh_vm.sh $BRANCH)" 2
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1" 2
}

usage() {
  cat <<EOF
LadyLinux refresh script

Usage:
  sudo ./scripts/refresh_vm.sh [branch] [options]

Options:
  --repair-layout            If repo is nested at /opt/ladylinux/app/LadyLinux, fix it
  --force-unit-install       Overwrite existing systemd unit file
  --always-rebuild-venv      Always rebuild venv on each refresh
  --dry-run                  Print actions without changing anything
  -h, --help                 Show help
EOF
}

parse_args() {
  shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repair-layout) REPAIR_LAYOUT="true"; shift ;;
      --force-unit-install) FORCE_UNIT_INSTALL="true"; shift ;;
      --always-rebuild-venv) ALWAYS_REBUILD_VENV="true"; shift ;;
      --dry-run) DRY_RUN="true"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown argument: $1 (use --help)" 2 ;;
    esac
  done
}

detect_repo_root() {
  # Prefer correct layout
  if [[ -d "$APP_PARENT/.git" ]]; then
    echo "$APP_PARENT"
    return 0
  fi
  # Support nested layout
  if [[ -d "$APP_PARENT/LadyLinux/.git" ]]; then
    echo "$APP_PARENT/LadyLinux"
    return 0
  fi
  echo ""
}

repair_nested_repo_layout() {
  # Converts /opt/ladylinux/app/LadyLinux -> /opt/ladylinux/app (repo root)
  if [[ -d "$APP_PARENT/LadyLinux/.git" && ! -d "$APP_PARENT/.git" ]]; then
    if [[ "$REPAIR_LAYOUT" != "true" ]]; then
      warn "Nested repo detected at $APP_PARENT/LadyLinux. Re-run with --repair-layout to fix."
      return 0
    fi
    log "Repairing nested repo layout: moving $APP_PARENT/LadyLinux -> $APP_PARENT"
    if [[ "$DRY_RUN" == "true" ]]; then
      log "DRY-RUN: would move repo up one level and remove outer directory"
      return 0
    fi
    run mv "$APP_PARENT/LadyLinux" "$APP_PARENT.__tmp_repo"
    run rm -rf "$APP_PARENT"
    run mv "$APP_PARENT.__tmp_repo" "$APP_PARENT"
  fi
}

ensure_runtime_dirs() {
  run mkdir -p "$BASE_DIR" "$VENV_DIR" "$ETC_DIR" "$VAR_DIR" || true
  run mkdir -p /var/lib/ladylinux/{data,cache,logs} >/dev/null 2>&1 || true

  # /etc ownership contract
  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    run chown -R root:"$SERVICE_GROUP" "$ETC_DIR" >/dev/null 2>&1 || true
  else
    run chown -R root:root "$ETC_DIR" >/dev/null 2>&1 || true
  fi
  run chmod 0750 "$ETC_DIR" >/dev/null 2>&1 || true
  [[ -f "$ENV_FILE" ]] && run chmod 0640 "$ENV_FILE" >/dev/null 2>&1 || true

  # /opt + /var service ownership
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$BASE_DIR" >/dev/null 2>&1 || true
    run chown -R "$SERVICE_USER":"$SERVICE_GROUP" /var/lib/ladylinux >/dev/null 2>&1 || true
  fi
}

install_systemd_unit_if_missing() {
  # unit source must come from repo root: <repo>/ladylinux-api.service
  local repo_root="$1"
  local unit_src="$repo_root/$SERVICE_NAME"

  if [[ ! -f "$unit_src" ]]; then
    warn "Unit source not found in repo: $unit_src (commit ladylinux-api.service to repo root)."
    return 0
  fi

  if [[ -f "$SYSTEMD_TARGET" && "$FORCE_UNIT_INSTALL" != "true" ]]; then
    log "Systemd unit exists: $SYSTEMD_TARGET (not overwritten)"
    return 0
  fi

  log "Installing systemd unit: $SYSTEMD_TARGET"
  run mkdir -p /etc/systemd/system
  run install -m 0644 "$unit_src" "$SYSTEMD_TARGET"
  run systemctl daemon-reload
  run systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
}

service_stop() {
  log "Stopping service: $SERVICE_NAME"
  run systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
}

service_start() {
  log "Starting service: $SERVICE_NAME"
  run systemctl start "$SERVICE_NAME" || die "Failed to start $SERVICE_NAME"
}

service_status() {
  log "Service status:"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
}

git_sync() {
  local repo_root="$1"
  log "Syncing repo in $repo_root to origin/$BRANCH"
  pushd "$repo_root" >/dev/null

  run git fetch --prune origin
  run git checkout -B "$BRANCH" "origin/$BRANCH" >/dev/null 2>&1 || true
  run git reset --hard "origin/$BRANCH"
  run git clean -fd

  local commit
  commit="$(git rev-parse --short HEAD)"
  log "Repo now at commit: $commit (branch: $BRANCH)"

  popd >/dev/null
}

fingerprint_deps() {
  local repo_root="$1"
  pushd "$repo_root" >/dev/null

  for f in "${DEPS_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      sha256sum "$f" | awk '{print $1}'
      popd >/dev/null
      return 0
    fi
  done

  popd >/dev/null
  echo ""
}

venv_rebuild_needed() {
  local repo_root="$1"

  if [[ "$ALWAYS_REBUILD_VENV" == "true" ]]; then
    return 0
  fi

  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    return 0
  fi

  local new_fp old_fp
  new_fp="$(fingerprint_deps "$repo_root")"
  old_fp=""
  [[ -f "$FINGERPRINT_FILE" ]] && old_fp="$(cat "$FINGERPRINT_FILE" || true)"

  if [[ -z "$new_fp" ]]; then
    return 0
  fi

  [[ "$new_fp" != "$old_fp" ]]
}

build_venv() {
  local repo_root="$1"

  log "Building Python venv at: $VENV_DIR"
  run rm -rf "$VENV_DIR"
  run mkdir -p "$VENV_DIR"

  run "$PYTHON_BIN" -m venv "$VENV_DIR"
  run "$PIP_BIN" install --upgrade pip wheel setuptools

  pushd "$repo_root" >/dev/null

  if [[ -f "requirements.txt" ]]; then
    log "Installing dependencies from requirements.txt"
    run "$PIP_BIN" install -r requirements.txt
  else
    warn "No requirements.txt found at repo root; skipping dependency install."
  fi

  local fp
  fp="$(fingerprint_deps "$repo_root")"
  if [[ -n "$fp" && "$DRY_RUN" != "true" ]]; then
    echo "$fp" > "$FINGERPRINT_FILE"
  fi

  popd >/dev/null
}

print_summary() {
  local repo_root="$1"
  pushd "$repo_root" >/dev/null
  local commit
  commit="$(git rev-parse --short HEAD)"
  popd >/dev/null

  log "Summary:"
  log "  Branch:   $BRANCH"
  log "  Commit:   $commit"
  log "  RepoRoot: $repo_root"
  log "  Venv:     $VENV_DIR"
  log "  Service:  $SERVICE_NAME"
}

main() {
  parse_args "$@"

  require_root
  require_cmd git
  require_cmd "$PYTHON_BIN"
  require_cmd systemctl
  require_cmd sha256sum
  require_cmd install

  ensure_runtime_dirs

  # Fix nested layout if requested
  repair_nested_repo_layout

  local repo_root
  repo_root="$(detect_repo_root)"
  [[ -n "$repo_root" ]] || die "Could not find a git repo at $APP_PARENT or $APP_PARENT/LadyLinux" 2

  # Auto-install the unit if missing
  install_systemd_unit_if_missing "$repo_root"

  service_stop
  git_sync "$repo_root"

  if venv_rebuild_needed "$repo_root"; then
    log "Venv rebuild needed (ALWAYS_REBUILD_VENV=$ALWAYS_REBUILD_VENV)"
    build_venv "$repo_root"
  else
    log "Venv rebuild not needed; dependency fingerprint unchanged."
  fi

  service_start
  print_summary "$repo_root"
  service_status

  log "Refresh complete."
}

main "$@"
