from __future__ import annotations

import shutil

from api_layer.utils.command_runner import run_command

# Resolve full path at import time — the ladylinux service user's PATH
# does not include /usr/sbin, so bare "ufw" fails with FileNotFoundError.
# ufw requires root; the installer writes a sudoers rule granting NOPASSWD
# for status and reload commands only.
_UFW = shutil.which("ufw") or "/usr/sbin/ufw"
_SUDO = shutil.which("sudo") or "/usr/bin/sudo"


def firewall_status() -> dict:
    result = run_command([_SUDO, _UFW, "status", "verbose"])
    status = "unknown"
    if "Status: active" in result.stdout:
        status = "active"
    elif "Status: inactive" in result.stdout:
        status = "inactive"

    payload = result.model_dump()
    payload["status"] = status
    return payload


def firewall_rules() -> dict:
    result = run_command([_SUDO, _UFW, "status", "numbered"])
    rules = [line.strip() for line in result.stdout.splitlines() if line.strip().startswith("[")]
    payload = result.model_dump()
    payload["rules"] = rules
    return payload


def firewall_rule(rule_id: str) -> dict:
    result = run_command([_SUDO, _UFW, "status", "numbered"])
    rules = [line.strip() for line in result.stdout.splitlines() if line.strip().startswith("[")]
    payload = result.model_dump()
    payload["rule_id"] = str(rule_id)
    payload["rules"] = rules
    payload["rule"] = next((rule for rule in rules if rule.startswith(f"[{rule_id}]")), None)
    if payload["rule"] is None:
        payload["ok"] = False
        payload["stderr"] = f"Rule [{rule_id}] not found"
    return payload


def firewall_reload() -> dict:
    result = run_command([_SUDO, _UFW, "reload"])
    payload = result.model_dump()
    payload["reloaded"] = result.ok
    return payload