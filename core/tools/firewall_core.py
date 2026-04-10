import re
from api_layer.command_security import run_whitelisted


def get_firewall_status_json():
    """Return UFW firewall status as structured JSON."""
    result = run_whitelisted(["ufw", "status", "verbose"], capture_output=True, text=True, check=False)
    output = result.stdout.strip()

    # Header info
    status_match = re.search(r"Status:\s+(\w+)", output)
    logging_match = re.search(r"Logging:\s+(.+)", output)
    default_match = re.search(r"Default:\s+(.+)", output)
    new_profiles_match = re.search(r"New profiles:\s+(.+)", output)

    # Parse default policies
    defaults = {}
    if default_match:
        parts = default_match.group(1).split(",")
        for part in parts:
            k, v = part.strip().split()
            defaults[k] = v

    # Parse rules table
    rules = []
    lines = output.splitlines()
    parsing_rules = False
    for line in lines:
        if re.match(r"^To\s+Action\s+From", line):
            parsing_rules = True
            continue
        if parsing_rules:
            if line.strip() == "":
                parsing_rules = False
                continue
            # Extract rule fields
            rule_parts = line.split()
            if len(rule_parts) >= 3:
                rules.append({
                    "port": rule_parts[0],
                    "action": rule_parts[1],
                    "from": " ".join(rule_parts[2:]),
                    "protocol": "tcp/udp"  # placeholder, ufw doesn't show exact protocol here
                })

    return {
        "status": status_match.group(1) if status_match else "unknown",
        "logging": logging_match.group(1) if logging_match else "unknown",
        "defaults": defaults,
        "new_profiles": new_profiles_match.group(1) if new_profiles_match else "none",
        "rules": rules,
        "raw_output": output
    }


def get_firewall_status():
    """Try UFW first, then fallback to iptables or nftables."""
    # Try UFW first
    try:
        result = run_whitelisted(
            ["ufw", "status", "verbose"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 and "Status:" in result.stdout:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    # Fallback to iptables
    try:
        result = run_whitelisted(
            ["iptables", "-L"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    # Fallback to nftables
    try:
        result = run_whitelisted(
            ["nft", "list", "ruleset"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    return "No firewall configuration could be retrieved."
