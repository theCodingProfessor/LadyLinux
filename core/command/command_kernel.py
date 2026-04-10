"""
LadyLinux Unified Command Kernel

Handles:
- natural system commands
- UI customization commands
- direct tool syntax

This runs BEFORE RAG or LLM logic.
"""

import re
import shutil

from core.command.semantic_classifier import classify_semantic

COLOR_MAP = {
    "red": "#ff3b3b",
    "blue": "#4a8cff",
    "green": "#2ecc71",
    "purple": "#9b59b6",
    "black": "#000000",
    "white": "#ffffff",
    "gray": "#888888",
}

FONT_STEPS = {
    "bigger": "18px",
    "larger": "18px",
    "increase": "18px",
    "smaller": "14px",
    "decrease": "14px",
}

VALID_TOOLS = {
    "audio_mute",
    "audio_unmute",
    "audio_toggle_mute",
    "audio_volume_set",
    "audio_volume_get",
    "audio_sink_list",
    "media_play",
    "media_pause",
    "media_toggle",
    "media_next",
    "media_prev",
    "media_stop",
    "media_status",
    "search_content",
    "search_files",
    "set_theme",
    "set_ui_override",
    "list_services",
    "restart_service",
    "system_service_start",
    "system_service_stop",
    "system_service_restart",
    "launch_app",
    "kill_process",
    "check_process",
    "firewall_status",
    "firewall_reload",
    "wifi_status",
    "wifi_enable",
    "wifi_disable",
    "xdg_open",
}

_UNRESOLVED_NAMES = {"it", "that", "this", "the app", "the application", "them"}
_BARE_DOMAIN_RE = re.compile(
    r"^open\s+((?:[a-z0-9-]+\.)+[a-z]{2,})(/\S*)?$"
)


def _is_resolved_arg(args: dict) -> bool:
    """Return False when a tool arg still looks like an unresolved reference."""
    name = str(args.get("name") or "").strip().lower()
    return name not in _UNRESOLVED_NAMES and len(name) > 1


def evaluate_prompt(text: str):
    text = text.lower().strip()
    parts = text.split()

    # ------------------------------------------------
    # DIRECT TOOL SYNTAX
    # ------------------------------------------------
    if parts and parts[0] in VALID_TOOLS:
        tool = parts[0]

        if tool == "set_theme":
            if len(parts) != 2:
                return {
                    "type": "error",
                    "tool": "set_theme",
                    "error": "Usage: set_theme <theme>",
                }

            return {
                "type": "tool",
                "tool": "set_theme",
                "args": {"theme": parts[1]},
            }

        if tool == "restart_service":
            if len(parts) != 2:
                return {
                    "type": "error",
                    "tool": "restart_service",
                    "error": "Usage: restart_service <service>",
                }

            return {
                "type": "tool",
                "tool": "restart_service",
                "args": {"name": parts[1]},
            }

        if tool in {"kill_process", "check_process", "launch_app"}:
            if len(parts) != 2:
                return {
                    "type": "error",
                    "tool": tool,
                    "error": f"Usage: {tool} <{'app' if tool == 'launch_app' else 'process'}>",
                }

            return {
                "type": "tool",
                "tool": tool,
                "args": {"name": parts[1]},
            }

        if tool == "audio_volume_set":
            if len(parts) != 2 or not parts[1].isdigit():
                return {
                    "type": "error",
                    "tool": "audio_volume_set",
                    "error": "Usage: audio_volume_set <0-100>",
                }

            return {
                "type": "tool",
                "tool": "audio_volume_set",
                "args": {"level": int(parts[1])},
            }

        if tool == "xdg_open":
            if len(parts) != 2:
                return {
                    "type": "error",
                    "tool": "xdg_open",
                    "error": "Usage: xdg_open <target>",
                }

            return {
                "type": "tool",
                "tool": "xdg_open",
                "args": {"target": parts[1]},
            }

        if tool == "search_content":
            if len(parts) < 2:
                return {
                    "type": "error",
                    "tool": "search_content",
                    "error": "Usage: search_content <query>",
                }

            return {
                "type": "tool",
                "tool": "search_content",
                "args": {"query": " ".join(parts[1:])},
            }

        if tool == "search_files":
            if len(parts) < 2:
                return {
                    "type": "error",
                    "tool": "search_files",
                    "error": "Usage: search_files <name>",
                }

            return {
                "type": "tool",
                "tool": "search_files",
                "args": {"name": " ".join(parts[1:])},
            }

        if len(parts) != 1:
            return {
                "type": "error",
                "tool": tool,
                "error": f"Usage: {tool}",
            }

        return {
            "type": "tool",
            "tool": tool,
            "args": {},
        }

    # ------------------------------------------------
    # NATURAL SYSTEM COMMANDS
    # ------------------------------------------------
    if text in ("list services", "show services"):
        return {"type": "tool", "tool": "list_services", "args": {}}

    if text in ("firewall status", "show firewall"):
        return {"type": "tool", "tool": "firewall_status", "args": {}}

    if text == "firewall reload":
        return {"type": "tool", "tool": "firewall_reload", "args": {}}

    if text in ("mute", "mute audio", "mute sound", "turn off sound"):
        return {"type": "tool", "tool": "audio_mute", "args": {}}

    if text in ("unmute", "unmute audio", "unmute sound", "turn on sound"):
        return {"type": "tool", "tool": "audio_unmute", "args": {}}

    if text in ("pause music", "pause audio", "pause media"):
        return {"type": "tool", "tool": "media_pause", "args": {}}

    volume_match = re.search(
        r"^(?:set\s+volume(?:\s+to)?|volume(?:\s+to)?)\s+(\d{1,3})(?:\s*%)?$",
        text,
    )
    if volume_match:
        return {
            "type": "tool",
            "tool": "audio_volume_set",
            "args": {"level": int(volume_match.group(1))},
        }

    search_for_match = re.search(r"^search\s+for\s+(.+)$", text)
    if search_for_match:
        query = search_for_match.group(1).strip()
        return {
            "type": "tool",
            "tool": "search_content",
            "args": {"query": query},
        }

    open_target_match = re.search(r"^open\s+((?:https?://\S+)|(?:/[\w./-]+))$", text)
    if open_target_match:
        return {
            "type": "tool",
            "tool": "xdg_open",
            "args": {"target": open_target_match.group(1)},
        }

    match = _BARE_DOMAIN_RE.match(text)
    if match:
        target = "https://" + match.group(1) + (match.group(2) or "")
        return {"type": "tool", "tool": "xdg_open", "args": {"target": target}}

    launch_match = re.search(
        r"^(launch|open|run|start)\s+(?:app\s+)?([a-z0-9._-]+)$",
        text,
    )
    if launch_match:
        app_name = launch_match.group(2).strip()
        return {
            "type": "tool",
            "tool": "launch_app",
            "args": {"name": app_name},
        }

    restart_match = re.search(r"restart(?:\s+service)?\s+([a-z0-9._-]+)", text)
    if restart_match:
        return {
            "type": "tool",
            "tool": "restart_service",
            "args": {"name": restart_match.group(1)},
        }

    kill_match = re.search(
        r"^(kill|close|end|terminate|stop)\s+(?:process\s+)?([a-z0-9._-]+)$",
        text,
    )
    if kill_match:
        proc_name = kill_match.group(2).strip()
        return {
            "type": "tool",
            "tool": "kill_process",
            "args": {"name": proc_name},
        }

    check_match = re.search(
        r"^(?:is|check|pgrep)\s+([a-z0-9._-]+)(?:\s+running)?$",
        text,
    )
    if check_match:
        proc_name = check_match.group(1).strip()
        return {
            "type": "tool",
            "tool": "check_process",
            "args": {"name": proc_name},
        }

    # ------------------------------------------------
    # THEME COMMANDS
    # ------------------------------------------------
    theme_match = re.search(
        r"(set|switch|change)\s+theme\s+(to\s+)?([a-zA-Z\-]+)",
        text,
    )
    if theme_match:
        return {
            "type": "tool",
            "tool": "set_theme",
            "args": {"theme": theme_match.group(3)},
        }

    # ------------------------------------------------
    # TEXT SIZE
    # ------------------------------------------------
    if "text" in text or "font" in text:
        for key, value in FONT_STEPS.items():
            if key in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "args": {
                        "--font-size-base": value,
                    },
                }

    # ------------------------------------------------
    # TEXT COLOR
    # ------------------------------------------------
    if "text" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "args": {
                        "--text": hexval,
                    },
                }

    # ------------------------------------------------
    # BACKGROUND COLOR
    # ------------------------------------------------
    if "background" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "args": {
                        "--bg-main": hexval,
                    },
                }

    # ------------------------------------------------
    # ACCENT COLOR
    # ------------------------------------------------
    if "accent" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "args": {
                        "--accent": hexval,
                    },
                }

    # ------------------------------------------------
    # UI SCALE
    # ------------------------------------------------
    if "scale" in text or "ui size" in text:
        if "bigger" in text or "increase" in text:
            return {
                "type": "tool",
                "tool": "set_ui_override",
                "args": {
                    "--ui-scale": "1.1",
                },
            }

        if "smaller" in text or "decrease" in text:
            return {
                "type": "tool",
                "tool": "set_ui_override",
                "args": {
                    "--ui-scale": "0.9",
                },
            }

    # ------------------------------------------------
    # NO COMMAND FOUND
    # ------------------------------------------------
    semantic = classify_semantic(text)
    if semantic.get("tool") in VALID_TOOLS and semantic.get("args"):
        if _is_resolved_arg(semantic["args"]):
            return {
                "type": "tool",
                "tool": semantic["tool"],
                "args": semantic.get("args") or {},
            }

    if len(parts) == 1 and parts[0].isalpha():
        candidate = parts[0]
        if shutil.which(candidate) or shutil.which(candidate.replace("_", "-")):
            return {
                "type": "tool",
                "tool": "launch_app",
                "args": {"name": candidate},
            }

    if semantic.get("tool") in VALID_TOOLS and not semantic.get("args"):
        return {
            "type": "tool",
            "tool": semantic["tool"],
            "args": {},
        }

    return None
