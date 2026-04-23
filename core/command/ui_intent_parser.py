"""
LadyLinux UI Intent Parser

Detects UI customization requests without needing the LLM.
Returns a structured command for the command gateway.
"""

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


def detect_ui_intent(text: str):
    text = text.lower().strip()

    # ---------- FONT SIZE ----------
    if "text" in text or "font" in text:
        for key, value in FONT_STEPS.items():
            if key in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "result": {
                        "--font-size-base": value,
                    },
                }

    # ---------- BACKGROUND ----------
    if "background" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "result": {
                        "--bg-main": hexval,
                    },
                }

    # ---------- SURFACE ----------
    if "surface" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "result": {
                        "--panel": hexval,
                    },
                }

    # ---------- TEXT COLOR ----------
    if "text color" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "result": {
                        "--text": hexval,
                    },
                }

    # ---------- ACCENT COLOR ----------
    if "accent" in text:
        for name, hexval in COLOR_MAP.items():
            if name in text:
                return {
                    "type": "tool",
                    "tool": "set_ui_override",
                    "result": {
                        "--accent": hexval,
                    },
                }

    # ---------- UI SCALE ----------
    if "scale" in text or "ui size" in text:
        if "bigger" in text or "increase" in text:
            return {
                "type": "tool",
                "tool": "set_ui_override",
                "result": {
                    "--ui-scale": "1.1",
                },
            }

        if "smaller" in text or "decrease" in text:
            return {
                "type": "tool",
                "tool": "set_ui_override",
                "result": {
                    "--ui-scale": "0.9",
                },
            }

    # ---------- ROUND CORNERS ----------
    if "round corners" in text or "rounded corners" in text:
        return {
            "type": "tool",
            "tool": "set_ui_override",
            "result": {
                "--corner-radius": "12px",
            },
        }

    # ---------- INCREASE SPACING ----------
    if "increase spacing" in text or "more spacing" in text:
        return {
            "type": "tool",
            "tool": "set_ui_override",
            "result": {
                "--spacing-scale": "1.2",
            },
        }

    # ---------- COMPACT MODE ----------
    if "compact mode" in text:
        return {
            "type": "tool",
            "tool": "set_ui_override",
            "result": {
                "--spacing-scale": "0.8",
            },
        }

    # ---------- GLASS BLUR ----------
    if "glass blur" in text or "enable blur" in text:
        return {
            "type": "tool",
            "tool": "set_ui_override",
            "result": {
                "--panel-blur": "12px",
            },
        }

    # ---------- REDUCE MOTION ----------
    if "reduce motion" in text or "disable animations" in text:
        return {
            "type": "tool",
            "tool": "set_ui_override",
            "result": {
                "--animation-speed": "0s",
            },
        }

    return None
