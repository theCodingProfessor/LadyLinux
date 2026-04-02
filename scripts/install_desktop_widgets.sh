#!/usr/bin/env bash
set -euo pipefail

# Desktop Widget Installer for LadyLinux
# This script automates the setup of desktop widgets on Linux Mint

echo "================================================"
echo "LadyLinux Desktop Widget Installer"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="/opt/ladylinux/scripts"

if [ -n "${SUDO_USER:-}" ]; then
    REAL_USER="$SUDO_USER"
    REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    REAL_USER="$(whoami)"
    REAL_HOME="$HOME"
fi

DESKTOP_DIR="$REAL_HOME/Desktop"

DESKTOP_FILES=("LadyLinux-Start.desktop" "LadyLinux-Stop.desktop")

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if scripts exist
echo "Step 1: Verifying script files..."
if [ ! -f "$SCRIPT_DIR/run_ll.sh" ]; then
    print_error "run_ll.sh not found at $SCRIPT_DIR/run_ll.sh"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/stop_ll.sh" ]; then
    print_error "stop_ll.sh not found at $SCRIPT_DIR/stop_ll.sh"
    exit 1
fi
print_status "Both shell scripts found"
echo ""

# Make shell scripts executable
echo "Step 2: Making shell scripts executable..."
chmod +x "$SCRIPT_DIR/run_ll.sh"
print_status "run_ll.sh is executable"
chmod +x "$SCRIPT_DIR/stop_ll.sh"
print_status "stop_ll.sh is executable"
echo ""

# Check if Desktop directory exists
echo "Step 3: Setting up Desktop directory..."
if [ ! -d "$DESKTOP_DIR" ]; then
    print_info "Creating Desktop directory..."
    mkdir -p "$DESKTOP_DIR"
fi
print_status "Desktop directory ready at $DESKTOP_DIR"
echo ""

# Copy and setup desktop files
echo "Step 4: Installing desktop widget files..."
for desktop_file in "${DESKTOP_FILES[@]}"; do
    if [ ! -f "$SCRIPT_DIR/$desktop_file" ]; then
        print_error "$desktop_file not found in $SCRIPT_DIR"
        exit 1
    fi

    cp "$SCRIPT_DIR/$desktop_file" "$DESKTOP_DIR/"
    chmod +x "$DESKTOP_DIR/$desktop_file"
    chown "$REAL_USER":"$REAL_USER" "$DESKTOP_DIR"
    print_status "$desktop_file installed and executable"
done
echo ""

# Refresh desktop
echo "Step 5: Refreshing desktop..."
if command -v xdotool &> /dev/null; then
    # Try using xdotool to refresh
    xdotool search --class "cinnamon" key F5 2>/dev/null || true
    print_status "Desktop refresh signal sent"
else
    print_info "xdotool not found - you may need to manually refresh (press F5)"
fi
echo ""

# Summary
echo "================================================"
echo "Installation Complete!"
echo "================================================"
echo ""
echo "Desktop widgets installed:"
echo "  • LadyLinux-Start.desktop  → ~/Desktop/"
echo "  • LadyLinux-Stop.desktop   → ~/Desktop/"
echo ""
echo "Next steps:"
echo "  1. Open your file manager and navigate to ~/Desktop"
echo "  2. You should see two new icons"
echo "  3. Double-click 'LadyLinux Start' to launch the system"
echo "  4. Double-click 'LadyLinux Stop' to stop the system"
echo ""
echo "If icons don't appear:"
echo "  • Press F5 on the desktop to refresh"
echo "  • Or right-click → Refresh"
echo ""
echo "For detailed instructions, see:"
echo "  docs/DESKTOP_WIDGETS_SETUP.md"
echo ""
print_status "All done!"
