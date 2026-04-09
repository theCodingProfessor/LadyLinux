#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/ladylinux/app"
SERVICE_NAME="ladylinux-api"
LOG_DIR="/var/lib/ladylinux/logs"
LOG_FILE="$LOG_DIR/refresh_api.log"
BRANCH="${1:-main}"

ensure_logs() {
  mkdir -p "$LOG_DIR"
  chown -R ladylinux:ladylinux /var/lib/ladylinux || true
  chmod -R 775 "$LOG_DIR" || true
  touch "$LOG_FILE" || true
  chmod 664 "$LOG_FILE" || true
  # Redirect via brace block below — no exec needed
}

ensure_logs

# All output after this point is captured to the log file.
# Brace block avoids exec's silent-exit-on-failure under set -e.
{

echo "[refresh] starting branch=${BRANCH}"

# Trap ensures the service is restarted even if the script exits early
trap 'echo "[refresh] EXIT — forcing restart"; systemctl start "$SERVICE_NAME" >/dev/null 2>&1 || true' EXIT

sleep 2  # allow the triggering API request to finish cleanly

echo "[refresh] stopping service"
systemctl stop "$SERVICE_NAME" || true

echo "[refresh] pulling latest changes"

# Required: git refuses to operate on a repo owned by a different user (ladylinux)
# when this script runs as root. safe.directory must be set before any git command.
git config --global --add safe.directory "$APP_ROOT" 2>/dev/null || true

cd "$APP_ROOT" || {
  echo "[refresh][ERROR] failed to cd into $APP_ROOT"
  exit 1
}

echo "[debug] user=$(whoami)"
echo "[debug] pwd=$(pwd)"
echo "[debug] repo status:"
git status || true

git fetch --prune origin

if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "[refresh][ERROR] branch origin/$BRANCH not found"
  exit 1
fi

git checkout -f "$BRANCH"
git reset --hard "origin/$BRANCH"

# Restore ownership after git overwrites files as root
chown -R ladylinux:ladylinux "$APP_ROOT" || true

echo "[refresh] starting service"
systemctl start "$SERVICE_NAME"

echo "[refresh] commit: $(git rev-parse --short HEAD)"

# Clear trap — clean exit, no forced restart needed
trap - EXIT

echo "[refresh] refresh complete"

} >> "$LOG_FILE" 2>&1