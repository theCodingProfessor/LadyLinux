#!/usr/bin/env bash
set -euo pipefail
set -x

# Updated for Line Endings
echo "Launching LadyLinux LLM system..."

# --- Ensure Ollama service is running ---
echo "Checking Ollama service..."
if ! systemctl is-active --quiet ollama; then
    echo "Starting Ollama service..."
    sudo systemctl start ollama
fi

# --- Start FastAPI backend if not already running ---
if ! pgrep -f "uvicorn api_layer:app" > /dev/null; then
    echo "Starting LadyLinux API server..."
    sudo -u ladylinux bash -c "
        export PATH=\$HOME/.local/bin:\$PATH
        cd /opt/ladylinux/app
        nohup ../venv/bin/uvicorn api_layer:app \
            --host 0.0.0.0 \
            --port 8000 \
            > /tmp/ladylinux.log 2>&1 &
    "
    sleep 3
else
    echo "API server already running."
fi

# --- Open web interface ---
echo "Opening web interface at http://localhost:8000 ..."
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:8000 >/dev/null 2>&1 &
else
    echo "Please open your browser and visit: http://localhost:8000"
fi

# --- Optional: Open Mistral in new terminal ---
if command -v gnome-terminal > /dev/null; then
    echo "Opening Mistral terminal..."
    gnome-terminal -- bash -c "ollama run mistral; exec bash"
else
    echo "To run Mistral manually, use:"
    echo "ollama run mistral"
fi

echo "LadyLinux system launched successfully."
