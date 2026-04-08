#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  echo "[LadyLinux] $1"
}

log "Removing UTF-8 BOM from script/source files."
find /opt/ladylinux -type f \
\( -name "*.sh" -o -name "*.py" -o -name "*.js" -o -name "*.css" -o -name "*.html" \) \
-exec sed -i '1s/^\xEF\xBB\xBF//' {} +
