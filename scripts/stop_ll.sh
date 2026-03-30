#!/usr/bin/env bash
set -euo pipefail

# Linux Mint script: find processes by regex, SIGTERM first, then SIGKILL if needed.
stop_by_pattern() {
  local pattern="$1"
  local label="$2"
  local wait_seconds="${3:-2}"

  mapfile -t pids < <(pgrep -f -- "$pattern" || true)

  if [ "${#pids[@]}" -eq 0 ]; then
    echo "No ${label} process found."
    return 0
  fi

  echo "Found ${label} PID(s): ${pids[*]}"
  echo "Sending SIGTERM to ${label}..."
  kill "${pids[@]}" 2>/dev/null || true

  sleep "$wait_seconds"

  mapfile -t remaining < <(pgrep -f -- "$pattern" || true)
  if [ "${#remaining[@]}" -gt 0 ]; then
    echo "${label} still running, sending SIGKILL to: ${remaining[*]}"
    kill -9 "${remaining[@]}" 2>/dev/null || true
  fi

  echo "${label}: done."
}

# 1) Stop Uvicorn processes
stop_by_pattern 'uvicorn' 'uvicorn'


echo "All requested process checks complete."
