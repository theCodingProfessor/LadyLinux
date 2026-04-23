#!/usr/bin/env python3
# core/screen/screen_agent.py
"""
LadyLinux screen state agent.

Runs as the logged-in desktop user (NOT the ladylinux service account).
Polls active window, focused application, and open terminal working
directories, writing structured JSON to a shared state file that the
API can read on every prompt.

Launch via: systemd user service or from the desktop session autostart.

Works on X11 natively. Wayland requires either:
  - xwayland (most compositors have it)
  - ydotool as a fallback for window title (needs uinput group)
  - graceful degradation if neither is available

Output file: /var/lib/ladylinux/data/screen_state.json
Permissions: 0644 so the ladylinux service user can read it
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

# Where the API reads screen state from
STATE_FILE = Path("/var/lib/ladylinux/data/screen_state.json")

# How often to poll in seconds — low enough to be current, high enough
# to not burn CPU on an already-loaded VM
POLL_INTERVAL = 3


def _run(cmd: list[str], timeout: int = 2) -> str:
    """Run a command and return stdout, empty string on any failure."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_active_window_x11() -> dict[str, str | int | None]:
    """
    Get the active window title and PID using xdotool.
    Returns empty values if xdotool is not installed or display is unavailable.
    """
    if not shutil.which("xdotool"):
        return {"title": None, "pid": None, "method": "unavailable"}

    window_id = _run(["xdotool", "getactivewindow"])
    if not window_id:
        return {"title": None, "pid": None, "method": "xdotool"}

    title = _run(["xdotool", "getwindowname", window_id])
    pid_str = _run(["xdotool", "getwindowpid", window_id])

    return {
        "title": title or None,
        "pid": int(pid_str) if pid_str.isdigit() else None,
        "method": "xdotool",
    }


def get_active_window_wmctrl() -> dict[str, str | int | None]:
    """
    Fallback window detection using wmctrl.
    Less reliable than xdotool but available on more systems.
    """
    if not shutil.which("wmctrl"):
        return {"title": None, "pid": None, "method": "unavailable"}

    output = _run(["wmctrl", "-l", "-p"])
    # wmctrl -l -p format: ID  desktop  PID  host  title
    for line in output.splitlines():
        parts = line.split(None, 4)
        if len(parts) >= 5:
            return {
                "title": parts[4],
                "pid": int(parts[2]) if parts[2].isdigit() else None,
                "method": "wmctrl",
            }
    return {"title": None, "pid": None, "method": "wmctrl"}


def get_open_terminals() -> list[dict[str, str | None]]:
    """
    Find open terminal processes and their current working directories.
    Useful for knowing what the user is actively doing in a shell.
    """
    terminal_names = {
        "bash", "zsh", "fish", "sh",
        "gnome-terminal", "xterm", "konsole",
        "tilix", "alacritty", "kitty", "xfce4-terminal",
    }

    terminals = []
    try:
        import psutil  # available in the venv — agent can use it if run from venv
        for proc in psutil.process_iter(["pid", "name", "cwd", "cmdline"]):
            try:
                name = (proc.info.get("name") or "").lower()
                if any(t in name for t in terminal_names):
                    terminals.append({
                        "pid": proc.info["pid"],
                        "name": proc.info.get("name"),
                        "cwd": proc.info.get("cwd"),
                    })
            except Exception:
                continue
    except ImportError:
        # psutil not available — fall back to /proc parsing
        try:
            for pid_dir in Path("/proc").iterdir():
                if not pid_dir.name.isdigit():
                    continue
                try:
                    comm = (pid_dir / "comm").read_text().strip()
                    if comm.lower() in terminal_names:
                        cwd_link = pid_dir / "cwd"
                        cwd = str(cwd_link.resolve()) if cwd_link.exists() else None
                        terminals.append({"pid": int(pid_dir.name), "name": comm, "cwd": cwd})
                except Exception:
                    continue
        except Exception:
            pass

    return terminals[:10]  # cap at 10 — enough context, not overwhelming


def get_focused_app_name(pid: int | None) -> str | None:
    """Resolve a PID to a human-readable application name via /proc."""
    if pid is None:
        return None
    try:
        comm = Path(f"/proc/{pid}/comm").read_text().strip()
        return comm
    except Exception:
        return None


def collect_screen_state() -> dict:
    """Collect all screen state into a single structured snapshot."""

    # Try xdotool first, wmctrl as fallback
    window = get_active_window_x11()
    if window["title"] is None:
        window = get_active_window_wmctrl()

    focused_app = get_focused_app_name(window.get("pid"))
    terminals = get_open_terminals()

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "active_window": {
            "title": window.get("title"),
            "pid": window.get("pid"),
            "app": focused_app,
            "detection_method": window.get("method"),
        },
        "open_terminals": terminals,
        "display": {
            "x11": bool(os.environ.get("DISPLAY")),
            "wayland": bool(os.environ.get("WAYLAND_DISPLAY")),
        },
    }


def write_state(state: dict) -> None:
    """Write state atomically so the API never reads a partial file."""
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)
    # Ensure readable by the ladylinux service account
    try:
        STATE_FILE.chmod(0o644)
    except Exception:
        pass


def main() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    print(f"[screen_agent] polling every {POLL_INTERVAL}s → {STATE_FILE}")

    while True:
        try:
            state = collect_screen_state()
            write_state(state)
        except Exception as exc:
            print(f"[screen_agent] collection error: {exc}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
