"""
Whitelisted command execution helpers for Lady Linux.

This module prevents arbitrary command execution by requiring every subprocess
invocation to pass a strict command-name allowlist check.
"""

from __future__ import annotations

import os
import subprocess
from typing import Any

from api_layer.utils.command_runner import ALLOWED_COMMANDS


def _command_name(command: list[str]) -> str:
    if not command:
        return ""
    return os.path.basename(str(command[0])).strip().lower()


def validate_command(command: list[str]) -> None:
    """
    Validate command against the allowed command list.

    Raises PermissionError if the command is not approved.
    """
    cmd_name = _command_name(command)
    if cmd_name not in ALLOWED_COMMANDS:
        raise PermissionError(f"Command not allowed: {cmd_name or '<empty>'}")


def run_whitelisted(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess:
    """
    Execute a subprocess command only after allowlist validation.
    """
    validate_command(command)
    return subprocess.run(command, **kwargs)
