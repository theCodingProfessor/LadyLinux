from __future__ import annotations


def enforce_policy(tool: dict) -> None:
    risk = tool.get("risk", "safe")

    if risk == "dangerous":
        raise RuntimeError("Blocked tool")

    if risk == "medium":
        # Placeholder for interactive confirmation or audit gating later.
        return
