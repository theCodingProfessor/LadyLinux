#!/usr/bin/env bash
#===============================================================================
# LadyLinux Service Shutdown Script
# File: stop_ll.sh
#
# Purpose:
#   Stop LadyLinux service and related processes gracefully.
#   Sends SIGTERM first, then SIGKILL if necessary.
#
# Usage:
#   sudo ./stop_ll.sh
#
# Exit codes:
#   0  success
#   1  error
#===============================================================================

set -euo pipefail

#----- Configuration -----

SERVICE_NAME="ladylinux-api.service"
LOG_DIR="/var/log/ladylinux"

#----- Helper Functions -----

log()  { printf "[stop] %s\n" "$*"; }
warn() { printf "[stop][WARN] %s\n" "$*" >&2; }

# Stop process by regex pattern
stop_by_pattern() {
  local pattern="$1"
  local label="$2"
  local wait_seconds="${3:-2}"

  mapfile -t pids < <(pgrep -f -- "$pattern" || true)

  if [ "${#pids[@]}" -eq 0 ]; then
    log "No ${label} process found."
    return 0
  fi

  log "Found ${label} PID(s): ${pids[*]}"
  log "Sending SIGTERM to ${label}..."
  kill "${pids[@]}" 2>/dev/null || true

  sleep "$wait_seconds"

  mapfile -t remaining < <(pgrep -f -- "$pattern" || true)
  if [ "${#remaining[@]}" -gt 0 ]; then
    log "${label} still running, sending SIGKILL to: ${remaining[*]}"
    kill -9 "${remaining[@]}" 2>/dev/null || true
  fi

  log "${label}: stopped."
}

#----- Main -----

log "════════════════════════════════════════════════════════════════════════"
log "  LadyLinux Service Shutdown"
log "════════════════════════════════════════════════════════════════════════"
log ""

# 1) Stop systemd service (preferred method)
log "Attempting to stop service via systemd: $SERVICE_NAME"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log "Service is active. Stopping..."
    systemctl stop "$SERVICE_NAME" || warn "Failed to stop service via systemctl"
    sleep 1

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        warn "Service still running after systemctl stop. Force stopping..."
        systemctl kill -s SIGKILL "$SERVICE_NAME" || true
    else
        log "Service stopped successfully via systemctl."
    fi
else
    log "Service is not active (or not loaded). Skipping systemctl stop."
fi

log ""

# 2) Stop any orphaned Uvicorn processes
stop_by_pattern 'uvicorn' 'uvicorn' 2

log ""
log "════════════════════════════════════════════════════════════════════════"
log "  All processes stopped."
log "════════════════════════════════════════════════════════════════════════"
log ""

log "Service Status:"
systemctl status "$SERVICE_NAME" --no-pager || true

log ""
log "Log location: $LOG_DIR"
log "View logs: tail -f $LOG_DIR/ladylinux.log"
log ""
