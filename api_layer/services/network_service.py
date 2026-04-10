from __future__ import annotations

from api_layer.utils.command_runner import run_command


def network_status() -> dict:
    links = run_command(["ip", "-brief", "link"])
    routes = run_command(["ip", "route"])
    payload = links.model_dump()
    payload["links"] = links.stdout.splitlines()
    payload["routes"] = routes.stdout.splitlines()
    payload["route_ok"] = routes.ok
    payload["route_stderr"] = routes.stderr
    payload["route_returncode"] = routes.returncode
    return payload


def network_interfaces() -> dict:
    result = run_command(["ip", "-brief", "address"])
    interfaces = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            interfaces.append({
                "name": parts[0],
                "state": parts[1],
                "addresses": parts[2:],
            })
    payload = result.model_dump()
    payload["interfaces"] = interfaces
    return payload


def network_connections() -> dict:
    result = run_command(["ss", "-tunap"])
    payload = result.model_dump()
    payload["connections"] = result.stdout.splitlines()
    return payload


def network_interface(name: str) -> dict:
    result = run_command(["ip", "-brief", "address", "show", name])
    interfaces = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            interfaces.append(
                {
                    "name": parts[0],
                    "state": parts[1],
                    "addresses": parts[2:],
                }
            )
    payload = result.model_dump()
    payload["interface"] = name
    payload["details"] = interfaces[0] if interfaces else None
    if payload["details"] is None and payload["ok"]:
        payload["ok"] = False
        payload["stderr"] = f"Interface '{name}' not found"
    return payload


def wifi_status() -> dict:
    """Return WiFi radio status via nmcli (read-only, no sudo needed)."""
    result = run_command(["nmcli", "radio", "wifi"])
    return {"ok": result.ok, "status": result.stdout.strip()}


def wifi_enable() -> dict:
    """Turn WiFi radio on."""
    result = run_command(["sudo", "nmcli", "radio", "wifi", "on"])
    return {"ok": result.ok, "message": "WiFi enabled" if result.ok else result.stderr}


def wifi_disable() -> dict:
    """Turn WiFi radio off."""
    result = run_command(["sudo", "nmcli", "radio", "wifi", "off"])
    return {"ok": result.ok, "message": "WiFi disabled" if result.ok else result.stderr}


def restart_interface(name: str) -> dict:
    down = run_command(["ip", "link", "set", "dev", name, "down"])
    up = run_command(["ip", "link", "set", "dev", name, "up"])
    payload = up.model_dump()
    payload["interface"] = name
    payload["down"] = down.model_dump()
    payload["up"] = up.model_dump()
    payload["restarted"] = down.ok and up.ok
    payload["ok"] = payload["restarted"]
    if not payload["ok"]:
        payload["stderr"] = up.stderr or down.stderr or "Failed to restart interface"
    return payload
