from __future__ import annotations

import os
import subprocess
from typing import Iterable

from api_layer.models.command import CommandResult

# Shared subprocess allowlist for route handlers and security wrappers.
ALLOWED_COMMANDS = {
    "apt-cache",  # Read package metadata without mutating the system.
    "apt-get",  # System package install/update operations exposed by the API.
    "df",  # Disk capacity inspection for storage views.
    "dpkg-query",  # Installed package queries for package status endpoints.
    "du",  # Directory size inspection for storage tooling.
    "ip",  # Network interface and address inspection.
    "iptables",  # Firewall rule inspection/management compatibility.
    "journalctl",  # Service and system log retrieval.
    "nft",  # nftables firewall inspection/management compatibility.
    "passwd",  # Password management flows routed through controlled endpoints.
    "pgrep",  # Process existence checks for non-systemd apps and executables.
    "pkill",  # Process termination for non-systemd apps and executables.
    "ss",  # Socket and listening-port inspection.
    "sudo",  # Privilege escalation for commands with NOPASSWD sudoers rules.
    "systemctl",  # Service lifecycle and status management.
    "ufw",  # UFW firewall inspection and control.
    "useradd",  # User creation flows routed through controlled endpoints.
    "who",  # Logged-in user inspection.
    "tail",  # Log file reading for the logs viewer.
    "hostnamectl",  # Hostname read/write for system settings endpoints.
    "timedatectl",  # Timezone read/write for system settings endpoints.
    "nmcli",  # WiFi and network manager control via NetworkManager CLI.
    "pactl",  # Audio volume, mute, and sink control.
    "playerctl",  # Media player transport control.
    "xdg-open",  # Open URLs and files via the desktop MIME handler.
    "rg",  # Fast content search for text queries.
    "fdfind",  # Fast file name search.
}


def run_command(command: Iterable[str], timeout: int = 15) -> CommandResult:
    """Execute a fixed command list safely (shell=False always).

    All subprocess behavior is centralized here so routes/services return a
    consistent JSON contract and security controls are easy to audit.
    """
    cmd = [str(part) for part in command]
    if not cmd:
        return CommandResult(ok=False, stdout="", stderr="Empty command", returncode=2)

    binary = os.path.basename(cmd[0]).strip().lower()
    if binary not in ALLOWED_COMMANDS:
        return CommandResult(
            ok=False,
            stdout="",
            stderr=f"Command not allowed: {binary}",
            returncode=126,
        )

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
            shell=False,
        )
        return CommandResult(
            ok=result.returncode == 0,
            stdout=(result.stdout or "").strip(),
            stderr=(result.stderr or "").strip(),
            returncode=result.returncode,
        )
    except PermissionError as exc:
        return CommandResult(ok=False, stdout="", stderr=f"Permission denied: {exc}", returncode=126)
    except FileNotFoundError as exc:
        return CommandResult(ok=False, stdout="", stderr=f"Command not found: {exc}", returncode=127)
    except subprocess.TimeoutExpired as exc:
        stderr = (exc.stderr or "").strip() if isinstance(exc.stderr, str) else "Command timed out"
        return CommandResult(ok=False, stdout="", stderr=stderr or "Command timed out", returncode=124)
