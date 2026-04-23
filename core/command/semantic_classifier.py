"""
Semantic intent classifier for LadyLinux.

Replaces keyword-based topic detection and prompt routing with a single
structured LLM pre-pass. This makes classification robust to conversational
phrasing, voice input, and any wording variation without keyword maintenance.

The classifier asks Mistral to return strict JSON only, keeping latency low
(~5-15 output tokens). Falls back to safe defaults on any parse failure so
it never blocks the main prompt pipeline.
"""

from __future__ import annotations

import json
import logging

import requests

from core.llm_gpu_probe import gpu_available

logger = logging.getLogger("ladylinux.classifier")

_OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
_VALID_TOPICS = {"processes", "services", "network", "disk", "memory"}
_VALID_ROUTES = {"system", "rag", "chat"}
_VALID_TOOLS = {
    "launch_app",
    "kill_process",
    "check_process",
    "system_service_start",
    "system_service_stop",
    "system_service_restart",
    "firewall_status",
    "firewall_reload",
    "wifi_status",
    "wifi_enable",
    "wifi_disable",
}

_CLASSIFICATION_PROMPT = """You are a Linux system assistant classifier. Return ONLY valid JSON, no prose.

Given this user message, return:
{{
  "topics": [...],   // which of: processes, services, network, disk, memory - empty list if none
  "route": "...",    // one of: system (action/command), rag (question/docs), chat (conversation)
  "tool": "...",     // tool name if a specific action is needed, or null
  "args": {{...}}    // tool arguments if tool is set, or null
}}

User message: {prompt}

Rules:
- topics: include ANY topic the user might be asking about even indirectly
  Examples: "sluggish" -> ["processes","memory"], "anything off" -> ["processes","services","memory"],
  "is she running" -> ["services"], "out of room" -> ["disk"], "can't connect" -> ["network"],
  "all good?" -> ["processes","services","memory","disk"], "how is my memory" -> ["memory"]
- route: "system" if they want an action done, "rag" if asking a question, "chat" if conversational
- tool: one of: launch_app, kill_process, check_process, system_service_start,
  system_service_stop, system_service_restart, firewall_status, firewall_reload,
  wifi_status, wifi_enable, wifi_disable — or null if no direct tool applies
- args: for launch_app/kill_process/check_process use {{"name": "<app>"}},
  for service tools use {{"name": "<service>"}}, else null
- Examples:
  "can you open spotify" -> tool: "launch_app", args: {{"name": "spotify"}}
  "open gnome calculator" -> tool: "launch_app", args: {{"name": "gnome-calculator"}}
  "kill firefox" -> tool: "kill_process", args: {{"name": "firefox"}}
  "is nginx running" -> tool: "check_process", args: {{"name": "nginx"}}
  "stop apache2" -> tool: "system_service_stop", args: {{"name": "apache2"}}
  "reload the firewall" -> tool: "firewall_reload", args: null
  "how is my memory" -> tool: null, route: "system", topics: ["memory"]
- Return ONLY the JSON object. No explanation."""


def classify_semantic(prompt: str) -> dict[str, object]:
    """Full semantic pre-pass on GPU; zero-cost fallback on CPU."""
    if not gpu_available():
        return {"topics": [], "route": "chat", "tool": None, "args": None}

    try:
        response = requests.post(
            _OLLAMA_URL,
            json={
                "model": "mistral",
                "prompt": _CLASSIFICATION_PROMPT.format(prompt=prompt),
                "stream": False,
                "options": {"num_predict": 80, "temperature": 0},
            },
            timeout=10,
        )
        response.raise_for_status()

        raw = response.json().get("response", "")
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(clean)

        topics = [t for t in parsed.get("topics", []) if t in _VALID_TOPICS]
        route = parsed.get("route", "chat")
        if route not in _VALID_ROUTES:
            route = "chat"

        tool = parsed.get("tool")
        if tool not in _VALID_TOOLS:
            tool = None

        args = parsed.get("args") if tool else None

        logger.debug(
            "Semantic classification: topics=%s route=%s tool=%s args=%s",
            topics,
            route,
            tool,
            args,
        )
        return {"topics": topics, "route": route, "tool": tool, "args": args}

    except Exception as exc:  # noqa: BLE001
        logger.warning("Semantic classifier failed (%s), using fallback", exc)
        return {"topics": [], "route": "chat", "tool": None, "args": None}
