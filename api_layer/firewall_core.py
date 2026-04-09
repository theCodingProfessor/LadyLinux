import json
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone

log = logging.getLogger("api_layer.firewall_core")

_BACKEND_COMMANDS = {
    "ufw": ["/usr/sbin/ufw", "/sbin/ufw", "ufw"],
    "iptables": ["/usr/sbin/iptables", "/sbin/iptables", "iptables"],
    "nftables": ["/usr/sbin/nft", "/sbin/nft", "nft"],
}


def _resolve_command(candidates):
    for candidate in candidates:
        if candidate.startswith("/") and os.path.exists(candidate):
            return candidate
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def _run_command(command):
    """Run a firewall command with sudo privileges (via passwordless sudoers rule).
    
    Prepends 'sudo' to enable the 'ladylinux' user to access firewall state
    without requiring a password (configured via /etc/sudoers.d/ladylinux-firewall).
    """
    # Prepend sudo to firewall commands for privilege escalation
    sudo_command = ["sudo"] + command
    
    try:
        result = subprocess.run(
            sudo_command,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": (result.stdout or "").strip(),
            "stderr": (result.stderr or "").strip(),
            "returncode": result.returncode,
            "command": sudo_command,
        }
    except FileNotFoundError:
        return {
            "ok": False,
            "stdout": "",
            "stderr": f"Command not found: {command[0]}",
            "returncode": 127,
            "command": sudo_command,
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "stdout": "",
            "stderr": f"Command timed out: {' '.join(sudo_command)}",
            "returncode": 124,
            "command": sudo_command,
        }


def _parse_defaults(default_text):
    defaults = {}
    for part in default_text.split(","):
        tokens = part.strip().split()
        if len(tokens) >= 2:
            defaults[" ".join(tokens[:-1])] = tokens[-1]
    return defaults


def _parse_ufw_rules(output):
    rules = []
    lines = output.splitlines()
    parsing_rules = False

    for line in lines:
        if re.match(r"^To\s+Action\s+From", line):
            parsing_rules = True
            continue
        if parsing_rules:
            if not line.strip():
                parsing_rules = False
                continue

            rule_parts = line.split()
            if len(rule_parts) >= 3:
                rules.append({
                    "to": rule_parts[0],
                    "action": rule_parts[1],
                    "from": " ".join(rule_parts[2:]),
                    "raw": line.strip(),
                })

    return rules


def _parse_ufw_output(output):
    status_match = re.search(r"Status:\s+(.+)", output)
    logging_match = re.search(r"Logging:\s+(.+)", output)
    default_match = re.search(r"Default:\s+(.+)", output)
    new_profiles_match = re.search(r"New profiles:\s+(.+)", output)

    rules = _parse_ufw_rules(output)
    defaults = _parse_defaults(default_match.group(1)) if default_match else {}

    return {
        "status": status_match.group(1).strip() if status_match else "unknown",
        "logging": logging_match.group(1).strip() if logging_match else "unknown",
        "defaults": defaults,
        "new_profiles": (
            new_profiles_match.group(1).strip()
            if new_profiles_match
            else "unknown"
        ),
        "rules": rules,
        "rules_count": len(rules),
    }


def _available_backends():
    return {
        backend: _resolve_command(candidates)
        for backend, candidates in _BACKEND_COMMANDS.items()
    }


def _base_snapshot():
    return {
        "backend": "none",
        "status": "unavailable",
        "logging": "unknown",
        "defaults": {},
        "new_profiles": "unknown",
        "rules": [],
        "rules_count": 0,
        "raw_output": "",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "errors": [],
        "available_backends": _available_backends(),
    }


def get_firewall_status_json():
    """Return firewall status as structured JSON without assuming sudo access."""
    snapshot = _base_snapshot()
    available = snapshot["available_backends"]

    ufw_cmd = available.get("ufw")
    if ufw_cmd:
        result = _run_command([ufw_cmd, "status", "verbose"])
        if result["stdout"]:
            snapshot.update(_parse_ufw_output(result["stdout"]))
            snapshot.update({
                "backend": "ufw",
                "raw_output": result["stdout"],
                "command": result["command"],
            })
            if result["stderr"]:
                snapshot["errors"].append(result["stderr"])
            return snapshot
        if result["stderr"]:
            snapshot["errors"].append(result["stderr"])

    iptables_cmd = available.get("iptables")
    if iptables_cmd:
        result = _run_command([iptables_cmd, "-L", "-n", "-v"])
        if result["stdout"]:
            snapshot.update({
                "backend": "iptables",
                "status": "available",
                "raw_output": result["stdout"],
                "command": result["command"],
            })
            if result["stderr"]:
                snapshot["errors"].append(result["stderr"])
            return snapshot
        if result["stderr"]:
            snapshot["errors"].append(result["stderr"])

    nft_cmd = available.get("nftables")
    if nft_cmd:
        result = _run_command([nft_cmd, "list", "ruleset"])
        if result["stdout"]:
            snapshot.update({
                "backend": "nftables",
                "status": "available",
                "raw_output": result["stdout"],
                "command": result["command"],
            })
            if result["stderr"]:
                snapshot["errors"].append(result["stderr"])
            return snapshot
        if result["stderr"]:
            snapshot["errors"].append(result["stderr"])

    snapshot["summary"] = "No supported firewall backend responded on this system."
    return snapshot


def _lines_in_text(text):
    return max(text.count("\n") + 1, 1)


def build_firewall_rag_documents(firewall_json=None):
    snapshot = firewall_json or get_firewall_status_json()
    timestamp = (
        snapshot.get("captured_at")
        or datetime.now(timezone.utc).isoformat()
    )
    rules = snapshot.get("rules") or []
    available_backends = snapshot.get("available_backends") or {}
    errors = snapshot.get("errors") or []

    summary_lines = [
        "Lady Linux runtime firewall summary",
        f"captured_at: {timestamp}",
        f"backend: {snapshot.get('backend', 'unknown')}",
        f"status: {snapshot.get('status', 'unknown')}",
        f"logging: {snapshot.get('logging', 'unknown')}",
        f"new_profiles: {snapshot.get('new_profiles', 'unknown')}",
        f"rules_count: {snapshot.get('rules_count', len(rules))}",
        "default_policies:",
    ]

    for key, value in (snapshot.get("defaults") or {}).items():
        summary_lines.append(f"- {key}: {value}")
    if not snapshot.get("defaults"):
        summary_lines.append("- none detected")

    summary_lines.append("available_backends:")
    for backend, path in available_backends.items():
        summary_lines.append(f"- {backend}: {path or 'not found'}")

    if errors:
        summary_lines.append("errors:")
        summary_lines.extend(f"- {error}" for error in errors)

    rules_lines = [
        "Lady Linux extracted firewall rules",
        f"captured_at: {timestamp}",
        f"backend: {snapshot.get('backend', 'unknown')}",
    ]
    if rules:
        for index, rule in enumerate(rules, start=1):
            rules_lines.append(
                f"{index}. "
                f"to={rule.get('to', 'unknown')} "
                f"action={rule.get('action', 'unknown')} "
                f"from={rule.get('from', 'unknown')} "
                f"raw={rule.get('raw', '')}"
            )
    else:
        rules_lines.append(
            "No structured firewall rules were parsed from the active "
            "backend output."
        )

    status_json_text = json.dumps(snapshot, indent=2)
    documents = [
        {
            "text": "\n".join(summary_lines),
            "source_path": "/runtime/firewall/summary.txt",
            "line_start": 1,
            "line_end": _lines_in_text("\n".join(summary_lines)),
            "timestamp": timestamp,
            "domain": "firewall",
        },
        {
            "text": "\n".join(rules_lines),
            "source_path": "/runtime/firewall/rules.txt",
            "line_start": 1,
            "line_end": _lines_in_text("\n".join(rules_lines)),
            "timestamp": timestamp,
            "domain": "firewall",
        },
        {
            "text": status_json_text,
            "source_path": "/runtime/firewall/status.json",
            "line_start": 1,
            "line_end": _lines_in_text(status_json_text),
            "timestamp": timestamp,
            "domain": "firewall",
        },
    ]

    raw_output = (snapshot.get("raw_output") or "").strip()
    if raw_output:
        raw_text = (
            "Lady Linux raw firewall backend output\n"
            f"captured_at: {timestamp}\n"
            f"backend: {snapshot.get('backend', 'unknown')}\n\n"
            f"{raw_output}"
        )
        documents.append({
            "text": raw_text,
            "source_path": "/runtime/firewall/raw_output.txt",
            "line_start": 1,
            "line_end": _lines_in_text(raw_text),
            "timestamp": timestamp,
            "domain": "firewall",
        })

    return documents


def ensure_firewall_snapshot_vectorized(firewall_json=None):
    import time

    snapshot = firewall_json or get_firewall_status_json()
    documents = build_firewall_rag_documents(snapshot)

    log.info("Firewall vectorization: building %d documents", len(documents))

    try:
        from rag_layer import ensure_collection
        from rag_layer.embedder import embed_texts
        from rag_layer.vector_store import upsert_chunks

        ensure_collection()

        log.info("Firewall vectorization: embedding %d document texts", len(documents))
        embed_start = time.time()
        vectors = embed_texts([doc["text"] for doc in documents])
        embed_elapsed = time.time() - embed_start
        log.info(
            "Firewall vectorization: embedding took %.2fs, got %d vectors",
            embed_elapsed,
            len(vectors),
        )

        log.info("Firewall vectorization: upserting %d chunks to Qdrant", len(documents))
        upsert_start = time.time()
        stored = upsert_chunks(documents, vectors)
        upsert_elapsed = time.time() - upsert_start
        log.info(
            "Firewall vectorization: upsert took %.2fs, stored %d chunks",
            upsert_elapsed,
            stored,
        )

        return {
            "vectorized": True,
            "chunks_stored": stored,
            "source_paths": [doc["source_path"] for doc in documents],
            "errors": [],
        }
    except Exception as exc:  # noqa: BLE001
        log.error("Firewall snapshot vectorization failed: %s", exc, exc_info=True)
        return {
            "vectorized": False,
            "chunks_stored": 0,
            "source_paths": [doc["source_path"] for doc in documents],
            "errors": [str(exc)],
        }


def get_firewall_status():
    """Try UFW first, then fallback to iptables or nftables."""
    snapshot = get_firewall_status_json()
    return (
        snapshot.get("raw_output")
        or snapshot.get("summary")
        or "No firewall configuration could be retrieved."
    )
