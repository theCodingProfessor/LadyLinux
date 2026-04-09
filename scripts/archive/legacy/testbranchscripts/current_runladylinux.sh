#!/usr/bin/env bash
set -euo pipefail

/opt/ladylinux/scripts/ladylinux_doctor.sh

LLM_SERVICE="ladylinux-llm.service"
API_SERVICE="ladylinux-api.service"
HOST_IP=$(hostname -I | awk '{print $1}')
API_URL="http://$HOST_IP:8000"

echo "Launching LadyLinux system..."

# --- Ensure dedicated LLM service is running ---
echo "Checking LLM runtime service..."
sudo systemctl daemon-reload
sudo systemctl enable "$LLM_SERVICE" >/dev/null 2>&1 || true
sudo systemctl restart "$LLM_SERVICE"
sudo systemctl --no-pager --full status "$LLM_SERVICE" || true

echo "Waiting for LLM runtime endpoint..."
llm_ready=0
for _ in $(seq 1 30); do
    if curl --silent --fail --max-time 2 "http://127.0.0.1:11434" >/dev/null 2>&1; then
        llm_ready=1
        break
    fi
    sleep 1
done
if [[ "$llm_ready" -ne 1 ]]; then
    echo "LLM runtime did not become ready in time."
    exit 1
fi

# --- Start FastAPI backend via systemd ---
echo "Restarting $API_SERVICE..."
sudo systemctl enable "$API_SERVICE" >/dev/null 2>&1 || true
sudo systemctl restart "$API_SERVICE"
sudo systemctl --no-pager --full status "$API_SERVICE" || true

echo "Waiting for API at $API_URL ..."
api_ready=0
for _ in $(seq 1 60); do
    if curl --silent --fail --max-time 2 "$API_URL" >/dev/null 2>&1; then
        api_ready=1
        break
    fi
    sleep 1
done
if [[ "$api_ready" -ne 1 ]]; then
    echo "API did not become ready in time."
    exit 1
fi

# --- Open web interface ---
echo "Opening web interface at $API_URL ..."
if command -v chromium >/dev/null 2>&1; then
    chromium --app="$API_URL" --window-size=1280,900 >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
    google-chrome --app="$API_URL" --window-size=1280,900 >/dev/null 2>&1 &
elif command -v xdg-open > /dev/null; then
    xdg-open "$API_URL" >/dev/null 2>&1 &
else
    echo "Please open your browser and visit: $API_URL"
fi

echo "LadyLinux system launched successfully."

