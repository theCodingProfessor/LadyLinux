#!/usr/bin/env bash
# scripts/install_desktop_widgets.sh
# Installs LadyLinux desktop launchers to the real user's ~/Desktop.
# Run with: sudo bash /opt/ladylinux/app/scripts/install_desktop_widgets.sh
# Idempotent — safe to re-run.

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_error()  { echo -e "${RED}✗${NC} $1"; }
print_info()   { echo -e "${YELLOW}ℹ${NC} $1"; }

# ── Config ────────────────────────────────────────────────────────────────────
# Bare-metal install: app lives at /opt/ladylinux/app
SCRIPT_DIR="/opt/ladylinux/app/scripts"

# Resolve the invoking user even under sudo
if [ -n "${SUDO_USER:-}" ]; then
    REAL_USER="$SUDO_USER"
    REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    REAL_USER="$(whoami)"
    REAL_HOME="$HOME"
fi

DESKTOP_DIR="$REAL_HOME/Desktop"

# All three launchers — LLStart.desktop skipped non-fatally if absent
DESKTOP_FILES=("LadyLinux-Start.desktop" "LadyLinux-Stop.desktop" "LLStart.desktop")

echo "================================================"
echo "LadyLinux Desktop Widget Installer"
echo "================================================"
echo ""

# ── Step 1: Verify shell scripts ──────────────────────────────────────────────
echo "Step 1: Verifying shell scripts..."
for script in run_ll.sh stop_ll.sh; do
    if [ ! -f "$SCRIPT_DIR/$script" ]; then
        print_error "$script not found at $SCRIPT_DIR/$script"
        exit 1
    fi
done
print_status "Shell scripts present"
echo ""

# ── Step 2: Make shell scripts executable ─────────────────────────────────────
echo "Step 2: Setting executable bits..."
chmod +x "$SCRIPT_DIR/run_ll.sh"
chmod +x "$SCRIPT_DIR/stop_ll.sh"
print_status "run_ll.sh and stop_ll.sh are executable"
echo ""

# ── Step 3: Ensure Desktop directory exists ───────────────────────────────────
echo "Step 3: Desktop directory..."
mkdir -p "$DESKTOP_DIR"
# Ensure the real user owns the Desktop dir, not root
chown "$REAL_USER":"$REAL_USER" "$DESKTOP_DIR"
print_status "Desktop directory ready: $DESKTOP_DIR"
echo ""

# ── Step 4: Install .desktop files ────────────────────────────────────────────
echo "Step 4: Installing launchers..."
for desktop_file in "${DESKTOP_FILES[@]}"; do
    src="$SCRIPT_DIR/$desktop_file"
    dst="$DESKTOP_DIR/$desktop_file"

    if [ ! -f "$src" ]; then
        # Non-fatal: LLStart.desktop may not be committed yet
        print_info "$desktop_file not found in $SCRIPT_DIR — skipping"
        continue
    fi

    cp "$src" "$dst"
    chmod +x "$dst"
    # File must be owned by the desktop user or Cinnamon won't trust it
    chown "$REAL_USER":"$REAL_USER" "$dst"
    print_status "$desktop_file installed"
done
echo ""

# ── Step 5: Refresh Cinnamon desktop ──────────────────────────────────────────
echo "Step 5: Refreshing desktop..."
if command -v xdotool &> /dev/null; then
    # Cinnamon uses nemo-desktop for the desktop icon surface
    xdotool search --class "nemo-desktop" key F5 2>/dev/null || \
    xdotool search --class "cinnamon"     key F5 2>/dev/null || true
    print_status "Refresh signal sent"
else
    print_info "xdotool not found — press F5 on the desktop to refresh"
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "================================================"
echo "Done."
echo "================================================"
for f in "${DESKTOP_FILES[@]}"; do
    [ -f "$DESKTOP_DIR/$f" ] && echo "  ✓ $f" || echo "  - $f (skipped)"
done
echo ""
echo "If icons don't appear: right-click Desktop → Refresh, or press F5"