from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.event_bus import event_bus

THEMES_DIR = Path("themes")
THEME_STATE_PATH = Path("config/theme_state.json")
THEME_ALIASES = {
    "dark": "terminal",
    "red": "crimson",
}


def _theme_path(theme_name: str) -> Path:
    return THEMES_DIR / f"{theme_name}.json"


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _default_theme_name() -> str:
    candidates = sorted(THEMES_DIR.glob("*.json"))
    if not candidates:
        raise FileNotFoundError("No theme files were found in themes/")
    return candidates[0].stem


def _persist_active_theme(theme_name: str) -> None:
    THEME_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    THEME_STATE_PATH.write_text(
        json.dumps({"active_theme": theme_name}, indent=2),
        encoding="utf-8",
    )


def _read_theme_state() -> dict[str, Any]:
    if not THEME_STATE_PATH.exists():
        default_theme = _default_theme_name()
        _persist_active_theme(default_theme)
        return {"active_theme": default_theme}
    return _load_json(THEME_STATE_PATH)


def _validate_theme_payload(payload: dict[str, Any], source: Path) -> dict[str, Any]:
    name = str(payload.get("name", "")).strip()
    display_name = str(payload.get("display_name", "")).strip()
    css_variables = payload.get("css_variables")

    if not name:
        raise ValueError(f"{source} is missing 'name'")
    if not display_name:
        raise ValueError(f"{source} is missing 'display_name'")
    if not isinstance(css_variables, dict) or not css_variables:
        raise ValueError(f"{source} is missing 'css_variables'")

    normalized_css = {
        str(key): str(value)
        for key, value in css_variables.items()
        if str(key).strip() and value is not None
    }
    if not normalized_css:
        raise ValueError(f"{source} has no usable CSS variables")

    return {
        "name": name,
        "display_name": display_name,
        "css_variables": normalized_css,
    }


def _theme_event_payload(theme: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": "theme_change",
        "theme": theme["name"],
        "display_name": theme["display_name"],
        "css": theme["css_variables"],
    }


def list_themes() -> dict:
    themes = []
    for path in sorted(THEMES_DIR.glob("*.json")):
        theme = _validate_theme_payload(_load_json(path), path)
        themes.append(theme)

    active_theme = _read_theme_state().get("active_theme")
    return {
        "ok": True,
        "themes": themes,
        "names": [theme["name"] for theme in themes],
        "active_theme": active_theme,
    }


def get_theme(name: str) -> dict:
    key = str(name).strip()
    path = _theme_path(key)
    if not path.exists():
        return {"ok": False, "theme": None, "stderr": f"Theme '{key}' not found"}

    theme = _validate_theme_payload(_load_json(path), path)
    return {"ok": True, "theme": theme}


def get_active_theme() -> dict[str, Any]:
    active_theme = str(_read_theme_state().get("active_theme", "")).strip() or _default_theme_name()
    result = get_theme(active_theme)
    if result.get("ok"):
        return result["theme"]

    fallback_theme = _default_theme_name()
    _persist_active_theme(fallback_theme)
    return get_theme(fallback_theme)["theme"]


def get_active_theme_event() -> dict[str, Any]:
    return _theme_event_payload(get_active_theme())


def apply_theme(theme: str) -> dict:
    """
    Deterministic theme service:
    command -> service -> persisted state -> event bus -> UI
    """
    key = THEME_ALIASES.get(str(theme).strip(), str(theme).strip())
    result = get_theme(key)
    if not result.get("ok"):
        return {"ok": False, "applied": False, "stderr": f"Theme '{key}' not found"}

    theme_payload = result["theme"]
    _persist_active_theme(theme_payload["name"])

    event_payload = _theme_event_payload(theme_payload)
    event_bus.publish(event_payload)

    return {
        "ok": True,
        "applied": True,
        "active_theme": theme_payload["name"],
        "css": theme_payload["css_variables"],
        "theme": theme_payload,
        "event": event_payload,
    }
