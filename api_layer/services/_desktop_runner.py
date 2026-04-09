"""
Desktop session subprocess helper for LadyLinux.

Provides run_as_desktop_user() — a shared utility for running commands
inside the active graphical session. Required for any tool that depends on
PulseAudio/PipeWire, D-Bus, DISPLAY, or XDG runtime services.

Used by: audio_service, media_service, open_service
NOT used by: search_service (runs fine as the ladylinux service user)
"""

from __future__ import annotations

import os
import pwd
import shutil
import subprocess


def _resolve_desktop_user() -> str:
    """
    Determine the logged-in desktop user from the runtime environment.

    Priority:
      1. DESKTOP_USER env var (allows override in tests)
      2. stat uid of XDG_RUNTIME_DIR
      3. stat uid of /run/user/1000 (Mint default for first real user)
      4. USER env var fallback
    """
    # Allow explicit override for testing without a real desktop session
    if override := os.environ.get("DESKTOP_USER"):
        return override

    # Walk candidate runtime dirs to find the owning uid
    candidates = [
        os.environ.get("XDG_RUNTIME_DIR"),
        "/run/user/1000",
    ]
    for path in candidates:
        if not path:
            continue
        try:
            uid = os.stat(path).st_uid
            return pwd.getpwuid(uid).pw_name
        except Exception:
            continue

    # Last resort: inherit the process USER
    return os.environ.get("USER", "ladylinux")


def run_as_desktop_user(
    cmd: list[str],
    *,
    popen: bool = False,
    timeout: int = 10,
) -> dict:
    """
    Execute a command inside the active desktop session.

    Wraps the command with `sudo -u <user> env ...` to inject the minimum
    required environment variables for D-Bus and PulseAudio/PipeWire.

    Args:
        cmd:     The command list to execute. Binary must already be in
                 ALLOWED_COMMANDS — this function does NOT re-validate.
        popen:   If True, fire-and-forget via Popen (use for GUI launch / open).
                 If False, capture stdout/stderr via subprocess.run().
        timeout: Seconds before run() raises TimeoutExpired (ignored for Popen).

    Returns:
        dict with keys: ok, stdout, stderr  (stdout/stderr empty for Popen mode)
    """
    user = _resolve_desktop_user()

    try:
        pw = pwd.getpwnam(user)
    except KeyError:
        return {"ok": False, "stdout": "", "stderr": f"Desktop user not found: {user}"}

    sudo_bin = shutil.which("sudo") or "/usr/bin/sudo"

    # Minimal desktop environment — only what PulseAudio/PipeWire and
    # D-Bus actually need. Do NOT inherit the full systemd env.
    full_cmd = [
        sudo_bin, "-u", user, "env",
        "DISPLAY=:0",
        f"XAUTHORITY={pw.pw_dir}/.Xauthority",
        f"XDG_RUNTIME_DIR=/run/user/{pw.pw_uid}",
        f"DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{pw.pw_uid}/bus",
        *cmd,
    ]

    if popen:
        # Fire-and-forget: used by open_service for xdg-open
        subprocess.Popen(
            full_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"ok": True, "stdout": "", "stderr": ""}

    try:
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "stdout": "", "stderr": "Command timed out"}
    except Exception as exc:
        return {"ok": False, "stdout": "", "stderr": str(exc)}
