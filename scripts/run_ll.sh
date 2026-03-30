#!/usr/bin/env bash
set -euo pipefail

# Enable tracing only when DEBUG=1
if [ "${DEBUG-0}" -eq 1 ]; then
    set -x
fi

echo "Launching LadyLinux LLM system..."

export PATH="$HOME/.local/bin:$PATH"
cd /opt/ladylinux
source venv/bin/activate
nohup uvicorn api_layer.app:app --reload --host 0.0.0.0 --port 8000 &
sleep 3

xdg-open http://localhost:8000 &

