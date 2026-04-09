#!/usr/bin/env python3
import os
import sys

VENV_PYTHON = "/opt/ladylinux/venv/bin/python"

# Relaunch script inside venv if not already using it.
if os.path.exists(VENV_PYTHON) and sys.executable != VENV_PYTHON:
    os.execv(VENV_PYTHON, [VENV_PYTHON] + sys.argv)

import shutil
import socket
import subprocess
import time
from pathlib import Path

import requests

PORT = 8000


def find_browser() -> str | None:
    browsers = ["chromium", "chromium-browser"]
    for browser in browsers:
        if shutil.which(browser):
            return browser
    return None


def launch_browser(url: str) -> bool:
    browser = find_browser()
    if not browser:
        print("Chromium not installed. Please install chromium or chromium-browser.")
        return False

    # Chromium app-mode removes browser UI (tabs/address bar) for desktop app UX.
    subprocess.Popen(
        [
            browser,
            f"--app={url}",
            "--disable-infobars",
            "--disable-session-crashed-bubble",
            "--start-maximized",
            "--no-default-browser-check",
            "--disable-extensions",
        ]
    )

    return True


def wait_for_server(url: str, timeout: int = 30) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            requests.get(url, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def ensure_user_desktop_entry() -> None:
    applications_dir = Path.home() / ".local" / "share" / "applications"
    applications_dir.mkdir(parents=True, exist_ok=True)
    desktop_file = applications_dir / "ladylinux.desktop"
    desktop_content = "\n".join(
        [
            "[Desktop Entry]",
            "Name=Lady Linux",
            "Comment=LadyLinux System Control Interface",
            "Exec=/opt/ladylinux/launch_ladylinux.sh",
            "Icon=utilities-terminal",
            "Terminal=false",
            "Type=Application",
            "Categories=System;Utility;",
            "StartupNotify=true",
        ]
    ) + "\n"
    if not desktop_file.exists() or desktop_file.read_text(encoding="utf-8") != desktop_content:
        desktop_file.write_text(desktop_content, encoding="utf-8")


def main() -> None:
    ensure_user_desktop_entry()

    # Use localhost for desktop launch so Chromium does not show a LAN IP.
    # The API service still binds to 0.0.0.0, so other devices can connect.
    desktop_url = f"http://127.0.0.1:{PORT}"

    if wait_for_server(desktop_url):
        hostname = socket.gethostname()

        print("\nLadyLinux running\n")
        print("Desktop:")
        print("  http://127.0.0.1:8000\n")

        print("Network:")
        print(f"  http://{hostname}.local:8000\n")

        launch_browser(desktop_url)
    else:
        print("LadyLinux backend did not start.")


if __name__ == "__main__":
    main()
