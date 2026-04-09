#!/bin/bash

APP_DIR="/opt/ladylinux"
PYTHON="$APP_DIR/venv/bin/python"
SCRIPT="$APP_DIR/scripts/testbranchscripts/start_ladylinux.py"

exec "$PYTHON" "$SCRIPT"
