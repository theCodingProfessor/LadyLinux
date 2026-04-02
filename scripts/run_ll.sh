#!/usr/bin/env bash
set -uo pipefail

# Path and Directory setup
export PATH="$HOME/.local/bin:$PATH"
cd /opt/ladylinux || exit 1

# Activate Virtual Environment
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "Virtual environment not found!"
    sleep 5
    exit 1
fi

echo "Launching LadyLinux LLM system..."

# 1. Use setsid to create a completely new session.
# This detaches it from the current terminal's process group.
setsid uvicorn api_layer.app:app --host 0.0.0.0 --port 8000 > /tmp/ladylinux.log 2>&1 &

# 2. Wait for the server to initialize
sleep 3

# 3. Launch browser separately
setsid xdg-open "http://localhost:8000" &

echo "System started and detached."
echo "You can view logs at: /tmp/ladylinux.log"

# Give the user a moment to read the success message
sleep 2


