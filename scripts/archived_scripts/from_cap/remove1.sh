#!/usr/bin/env bash
#===============================================================================
# LadyLinux Uninstaller (expanded to match ladylinuxinstall1.sh)
#
# Removes:
# - /opt/ladylinux, /var/lib/ladylinux, /etc/ladylinux
# - service user/group "ladylinux"
# - Ollama install (service, binaries, data, model)
# - Optionally restores /etc/systemd/resolved.conf from .bak created by installer
# - Optionally purges apt packages installed by installer
#
# Safety:
# - Prompts before destructive actions unless --yes is used
# - --dry-run supported
#===============================================================================

set -Eeuo pipefail

# Defaults (mirror installer defaults)
SERVICE_USER="ladylinux"
SERVICE_GROUP="ladylinux"

BASE_DIR="/opt/ladylinux"
ETC_DIR="/etc/ladylinux"
VAR_DIR="/var/lib/ladylinux"

# Installer also attempted a repo clone; safest likely location if they fixed it:
REPO_DIR="/opt/LadyLinux"

# DNS file touched by installer
RESOLVED_CONF="/etc/systemd/resolved.conf"
RESOLVED_BAK="/etc/systemd/resolved.conf.bak"

# Ollama common locations (we'll check what exists)
OLLAMA_SERVICE="ollama.service"
OLLAMA_USER="ollama"
OLLAMA_GROUP="ollama"

# Options
DRY_RUN="false"
ASSUME_YES="false"
KEEP_MODELS="false"
KEEP_STATE="false"
KEEP_CONFIG="false"
FORCE="false"
SYSTEMD_SERVICE=""   # optional custom unit to stop/disable
RESTORE_DNS="false"
REMOVE_OLLAMA="false"
PURGE_PACKAGES="false"

# What the installer apt-installed (from your install script)
APT_PACKAGES=(git python3.12 python3.12-venv curl systemd)

log()  { printf "[uninstall] %s\n" "$*"; }
warn() { printf "[uninstall][WARN] %s\n" "$*" >&2; }
die()  { printf "[uninstall][ERROR] %s\n" "$*" >&2; exit "${2:-1}"; }

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

usage() {
  cat <<EOF
LadyLinux Uninstaller

Usage:
  sudo ./ll_uninstall.sh [options]

Options:
  --yes                 Do not prompt; assume "yes" for destructive actions
  --dry-run             Print actions without changing anything
  --keep-models         Do NOT delete \$BASE_DIR/models if present
  --keep-state          Do NOT delete $VAR_DIR (state: data/cache/logs)
  --keep-config         Do NOT delete $ETC_DIR (config/env)
  --service <unit>      Also try to stop/disable a specific systemd unit (optional)
  --force               Kill running processes owned by $SERVICE_USER (use with care)

  --restore-dns         Restore $RESOLVED_CONF from $RESOLVED_BAK if present
  --remove-ollama       Remove Ollama (service, binaries, data) and mistral model
  --purge-packages      apt purge the packages installed by the installer (git/python3.12/etc)

  --full                Equivalent to: --restore-dns --remove-ollama --purge-packages
  -h, --help            Show help

Examples:
  sudo ./ll_uninstall.sh --dry-run
  sudo ./ll_uninstall.sh --yes
  sudo ./ll_uninstall.sh --yes --full
  sudo ./ll_uninstall.sh --yes --remove-ollama --restore-dns
EOF
}

confirm() {
  local prompt="$1"
  if [[ "$ASSUME_YES" == "true" ]]; then
    return 0
  fi
  read -r -p "$prompt [y/N]: " ans
  [[ "${ans,,}" == "y" || "${ans,,}" == "yes" ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) ASSUME_YES="true"; shift ;;
      --dry-run) DRY_RUN="true"; shift ;;
      --keep-models) KEEP_MODELS="true"; shift ;;
      --keep-state) KEEP_STATE="true"; shift ;;
      --keep-config) KEEP_CONFIG="true"; shift ;;
      --service) SYSTEMD_SERVICE="${2:-}"; [[ -n "$SYSTEMD_SERVICE" ]] || die "--service requires a unit name" 2; shift 2 ;;
      --force) FORCE="true"; shift ;;

      --restore-dns) RESTORE_DNS="true"; shift ;;
      --remove-ollama) REMOVE_OLLAMA="true"; shift ;;
      --purge-packages) PURGE_PACKAGES="true"; shift ;;
      --full) RESTORE_DNS="true"; REMOVE_OLLAMA="true"; PURGE_PACKAGES="true"; shift ;;

      -h|--help) usage; exit 0 ;;
      *) die "Unknown argument: $1 (use --help)" 2 ;;
    esac
  done
}

maybe_stop_systemd_unit() {
  local unit="$1"
  [[ -n "$unit" ]] || return 0
  command -v systemctl >/dev/null 2>&1 || { warn "systemctl not found; skipping stop/disable for $unit."; return 0; }

  if systemctl list-unit-files | awk '{print $1}' | grep -Fxq "$unit"; then
    log "Stopping systemd unit: $unit"
    run systemctl stop "$unit" || true
    log "Disabling systemd unit: $unit"
    run systemctl disable "$unit" || true
  else
    warn "Systemd unit not found: $unit (skipping)"
  fi
}

ensure_no_running_processes() {
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    return 0
  fi

  if command -v pgrep >/dev/null 2>&1; then
    if pgrep -u "$SERVICE_USER" >/dev/null 2>&1; then
      if [[ "$FORCE" == "true" ]]; then
        warn "Killing processes owned by $SERVICE_USER (because --force was set)"
        run pkill -u "$SERVICE_USER" || true
      else
        die "Processes are still running as $SERVICE_USER. Re-run with --force and/or stop services manually." 1
      fi
    fi
  else
    warn "pgrep not found; cannot reliably check for running $SERVICE_USER processes."
    if [[ "$FORCE" != "true" ]]; then
      warn "Proceeding without process check. Consider installing procps or use --force."
    fi
  fi
}

restore_dns_if_requested() {
  [[ "$RESTORE_DNS" == "true" ]] || return 0

  if [[ -e "$RESOLVED_BAK" ]]; then
    if confirm "Restore DNS config by copying $RESOLVED_BAK back to $RESOLVED_CONF ?"; then
      run cp -f "$RESOLVED_BAK" "$RESOLVED_CONF"
      if command -v systemctl >/dev/null 2>&1; then
        run systemctl restart systemd-resolved || true
      fi
      log "Restored $RESOLVED_CONF from backup."
    else
      log "Skipped DNS restore."
    fi
  else
    warn "No backup found at $RESOLVED_BAK; cannot restore automatically."
  fi
}

remove_ollama_if_requested() {
  [[ "$REMOVE_OLLAMA" == "true" ]] || return 0

  # Stop/disable service
  maybe_stop_systemd_unit "$OLLAMA_SERVICE"

  # If ollama CLI exists, try to remove the mistral model first
  if command -v ollama >/dev/null 2>&1; then
    if confirm "Remove Ollama model 'mistral' (ollama rm mistral) ?"; then
      run ollama rm mistral || true
    fi
  fi

  # Remove common data/config locations
  # (These vary by install method; we only delete what exists.)
  local paths=(
    "/var/lib/ollama"
    "/usr/share/ollama"
    "/etc/ollama"
    "/opt/ollama"
    "/root/.ollama"
  )

  # Also remove ladylinux user's ollama cache if user exists
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    paths+=("/home/$SERVICE_USER/.ollama")
  fi

  for p in "${paths[@]}"; do
    if [[ -e "$p" ]]; then
      if confirm "Delete Ollama data/config path: $p ?"; then
        run rm -rf --one-file-system "$p"
      else
        log "Skipped deleting $p"
      fi
    fi
  done

  # Remove systemd unit files if present
  local unit_paths=(
    "/etc/systemd/system/ollama.service"
    "/lib/systemd/system/ollama.service"
    "/usr/lib/systemd/system/ollama.service"
  )
  for up in "${unit_paths[@]}"; do
    if [[ -e "$up" ]]; then
      if confirm "Delete systemd unit file $up ?"; then
        run rm -f "$up"
      fi
    fi
  done

  if command -v systemctl >/dev/null 2>&1; then
    run systemctl daemon-reload || true
  fi

  # Remove ollama binary (common install locations)
  local bins=(
    "/usr/local/bin/ollama"
    "/usr/bin/ollama"
  )
  for b in "${bins[@]}"; do
    if [[ -e "$b" ]]; then
      if confirm "Delete Ollama binary $b ?"; then
        run rm -f "$b"
      fi
    fi
  done

  # Remove ollama user/group if present (optional, prompted)
  if id "$OLLAMA_USER" >/dev/null 2>&1; then
    if confirm "Remove system user '$OLLAMA_USER' (created by Ollama installer) ?"; then
      if command -v userdel >/dev/null 2>&1; then
        run userdel -r "$OLLAMA_USER" || run userdel "$OLLAMA_USER" || true
      fi
    fi
  fi

  if getent group "$OLLAMA_GROUP" >/dev/null 2>&1; then
    if confirm "Remove system group '$OLLAMA_GROUP' (created by Ollama installer) ?"; then
      if command -v groupdel >/dev/null 2>&1; then
        run groupdel "$OLLAMA_GROUP" || true
      fi
    fi
  fi

  log "Ollama removal steps completed."
}

remove_paths() {
  # Optional repo dir cleanup
  if [[ -e "$REPO_DIR" ]]; then
    if confirm "Delete repo directory $REPO_DIR ?"; then
      run rm -rf --one-file-system "$REPO_DIR"
    else
      log "Skipped deleting $REPO_DIR"
    fi
  fi

  # Config
  if [[ "$KEEP_CONFIG" == "true" ]]; then
    log "Keeping config directory: $ETC_DIR"
  else
    if [[ -e "$ETC_DIR" ]]; then
      if confirm "Delete config directory $ETC_DIR ?"; then
        run rm -rf --one-file-system "$ETC_DIR"
      else
        log "Skipped deleting $ETC_DIR"
      fi
    else
      log "Config directory not present: $ETC_DIR"
    fi
  fi

  # State
  if [[ "$KEEP_STATE" == "true" ]]; then
    log "Keeping state directory: $VAR_DIR"
  else
    if [[ -e "$VAR_DIR" ]]; then
      if confirm "Delete state directory $VAR_DIR (includes data/cache/logs) ?"; then
        run rm -rf --one-file-system "$VAR_DIR"
      else
        log "Skipped deleting $VAR_DIR"
      fi
    else
      log "State directory not present: $VAR_DIR"
    fi
  fi

  # /opt base with optional keep-models
  local models_dir="$BASE_DIR/models"
  if [[ -e "$BASE_DIR" ]]; then
    if [[ "$KEEP_MODELS" == "true" && -e "$models_dir" ]]; then
      log "Keeping models directory: $models_dir"
      if confirm "Delete $BASE_DIR (but keep $models_dir) ?"; then
        if [[ "$DRY_RUN" == "true" ]]; then
          log "DRY-RUN: would delete all entries in $BASE_DIR except $(basename "$models_dir")"
        else
          find "$BASE_DIR" -mindepth 1 -maxdepth 1 \
            ! -name "$(basename "$models_dir")" \
            -exec rm -rf --one-file-system {} +
          rmdir "$BASE_DIR" 2>/dev/null || true
        fi
      else
        log "Skipped deleting $BASE_DIR"
      fi
    else
      if confirm "Delete application directory $BASE_DIR (includes app/venv/models/containers) ?"; then
        run rm -rf --one-file-system "$BASE_DIR"
      else
        log "Skipped deleting $BASE_DIR"
      fi
    fi
  else
    log "Application directory not present: $BASE_DIR"
  fi
}

remove_user_group() {
  # Remove user
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    if confirm "Remove system user '$SERVICE_USER' ?"; then
      if command -v userdel >/dev/null 2>&1; then
        run userdel -r "$SERVICE_USER" || run userdel "$SERVICE_USER"
      else
        die "userdel not found; cannot remove user $SERVICE_USER" 2
      fi
    else
      log "Skipped removing user $SERVICE_USER"
    fi
  else
    log "User not present: $SERVICE_USER"
  fi

  # Remove group (only if it exists and is not used by other users)
  if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    if getent passwd | awk -F: -v gid="$(getent group "$SERVICE_GROUP" | cut -d: -f3)" '$4==gid{print $1}' | grep -q .; then
      warn "Group $SERVICE_GROUP is still the primary group for at least one user. Not deleting it."
      return 0
    fi

    if confirm "Remove system group '$SERVICE_GROUP' ?"; then
      if command -v groupdel >/dev/null 2>&1; then
        run groupdel "$SERVICE_GROUP" || true
      else
        die "groupdel not found; cannot remove group $SERVICE_GROUP" 2
      fi
    else
      log "Skipped removing group $SERVICE_GROUP"
    fi
  else
    log "Group not present: $SERVICE_GROUP"
  fi
}

purge_packages_if_requested() {
  [[ "$PURGE_PACKAGES" == "true" ]] || return 0

  if ! command -v apt >/dev/null 2>&1; then
    warn "apt not found; skipping package purge."
    return 0
  fi

  warn "Package purge can remove things you still need (especially python/systemd)."
  if confirm "Proceed with: apt purge ${APT_PACKAGES[*]} ?"; then
    run apt purge -y "${APT_PACKAGES[@]}" || true
    run apt autoremove -y || true
  else
    log "Skipped apt purge."
  fi
}

main() {
  parse_args "$@"
  require_root

  log "Beginning LadyLinux uninstall (DRY_RUN=$DRY_RUN)"

  # If user provided a custom unit, stop/disable it too
  if [[ -n "$SYSTEMD_SERVICE" ]]; then
    maybe_stop_systemd_unit "$SYSTEMD_SERVICE"
  fi

  # First: stop services/processes
  if [[ "$REMOVE_OLLAMA" == "true" ]]; then
    maybe_stop_systemd_unit "$OLLAMA_SERVICE"
  fi

  ensure_no_running_processes

  # Undo config changes
  restore_dns_if_requested

  # Remove app paths
  remove_paths

  # Remove users/groups
  remove_user_group

  # Remove Ollama last (after ladylinux user is handled, to clean /home/ladylinux/.ollama if present)
  remove_ollama_if_requested

  # Optional package purge
  purge_packages_if_requested

  log "Uninstall complete."
}

main "$@"
