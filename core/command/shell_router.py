"""
LadyLinux Shell Router

Provides deterministic command execution before RAG/LLM.

Example commands:

list services
restart nginx
system status
firewall reload
set theme crimson
switch theme crimson
"""

from core.command.command_parser import parse_command
from core.command.tool_router import ToolRouter

ROUTER = ToolRouter()


def run_shell_command(prompt: str):
    parsed = parse_command(prompt)

    if not parsed:
        return None

    tool, args = parsed

    # UI navigation is handled by the frontend, not backend services.
    if tool == "ui_navigate":
        return {
            "type": "command",
            "tool": tool,
            "args": args,
            "result": {"ok": True, "message": f"Navigate to {args.get('page', '')}", "data": args},
        }

    try:
        result = ROUTER.execute(tool, args)
        return {
            "type": "command",
            "tool": tool,
            "args": args,
            "result": result,
        }
    except Exception as e:  # noqa: BLE001
        return {
            "type": "error",
            "tool": tool,
            "error": str(e),
        }
