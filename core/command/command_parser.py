"""
LadyLinux Command Parser

Detects system commands before any LLM or RAG step.
This prevents LLM hallucination and makes system queries instant.
"""

import json
import re


def parse_command(text: str):
    # Normalize command text while preserving deterministic behavior.
    text = text.strip()
    if not text:
        return None

    if text.startswith("{"):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict):
            command = str(payload.get("command", "")).strip().lower()
            if command == "set_theme":
                theme = str(payload.get("theme", "")).strip()
                if theme:
                    return ("set_theme", {"theme": theme.lower()})

    if text.startswith(">") or text.startswith("$"):
        text = text[1:].strip()
    text = text.lower()

    if text.startswith("restart "):
        service = text.split("restart ", 1)[1].strip()
        if service:
            return ("system_service_restart", {"name": service})

    if text in ("list services", "show services"):
        return ("system_services", {})

    if text in ("system status", "status"):
        return ("system_status", {})

    if text in ("firewall status", "show firewall"):
        return ("firewall_status", {})

    if text == "firewall reload":
        return ("firewall_reload", {})

    theme_match = re.search(
        r"(set|switch|change)\s+theme\s+(to\s+)?([a-zA-Z\-]+)",
        text,
    )
    if theme_match:
        theme = theme_match.group(3).strip().lower()
        return ("set_theme", {"theme": theme})

    # Optional UI navigation commands for frontend handling.
    if text == "open firewall page":
        return ("ui_navigate", {"page": "firewall"})
    if text == "open users page":
        return ("ui_navigate", {"page": "users"})

    return None
