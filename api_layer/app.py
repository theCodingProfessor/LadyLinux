from __future__ import annotations

from datetime import datetime
import json
import logging
from pathlib import Path
import re
import threading
import time
from typing import Any, Literal

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from api_layer.routes.audio import router as audio_router
from core.tools import os_core
from core.tools.firewall_core import get_firewall_status_json
from api_layer.routes.firewall import router as firewall_router
from api_layer.routes.logs import router as logs_router
from api_layer.routes.media import router as media_router
from api_layer.routes.network import router as network_router
from api_layer.routes.open import router as open_router
from api_layer.routes.packages import router as packages_router
from api_layer.routes.search import router as search_router
from api_layer.routes.services import router as services_router
from api_layer.routes.storage import router as storage_router
from api_layer.routes.system import router as system_router
from api_layer.routes.theme import router as theme_router
from api_layer.routes.ws import router as ws_router
from api_layer.routes.voice_ws import router as voice_ws_router
from api_layer.routes import users as users_router
from api_layer.services.system_service import get_status
from api_layer.utils.command_runner import run_command
from api_layer.utils.validators import validate_service_name
from core.command.intent_classifier import detect_live_topics
from core.command.semantic_classifier import classify_semantic
from core.llm_gpu_probe import gpu_available
from core.rag.retriever import build_context_block, retrieve
from core.rag.seed import seed
from core.rag.system_provider import SystemProvider
from core.rag.vector_store import COLLECTION_NAME, client, ensure_collection
from llm_runtime import ensure_model
from core.command.command_kernel import evaluate_prompt
from core.command.tool_router import ToolRouter, ToolRouterError
from core.tools.tool_registry import TOOL_REGISTRY
from core.tools.tool_schemas import schema_to_manifest

_SCREEN_STATE_FILE = Path("/var/lib/ladylinux/data/screen_state.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("ladylinux")

app = FastAPI()

# Composition root: route groups are modular and independently testable.
app.include_router(system_router)
app.include_router(services_router)
app.include_router(firewall_router)
app.include_router(network_router)
app.include_router(storage_router)
app.include_router(logs_router)
app.include_router(packages_router)
app.include_router(theme_router)
app.include_router(ws_router)
app.include_router(voice_ws_router)
app.include_router(users_router.router)
app.include_router(audio_router)
app.include_router(media_router)
app.include_router(open_router)
app.include_router(search_router)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

LOG_FILE = "/var/log/ladylinux/actions.log"
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

CAPABILITY_BLOCK = """
You are Lady Linux, an AI system assistant.

Use system API tools/endpoints for live state and actions. Do not generate shell commands.

Primary endpoint groups:
- /api/system/*
- /api/firewall/*
- /api/network/*
- /api/theme/*
- /api/storage/*
- /api/logs/*
- /api/packages/*

RAG context should be used for explanation and project knowledge only.
"""

# tools.json is the single source of truth for allowed tool calls.
# Add new tools there (and implement matching API routes) instead of prompt text.
TOOL_ROUTER = ToolRouter()
TOOL_NAME_MAP = {
    "list_services": "system_services",
    "restart_service": "system_service_restart",
}
SYSTEM_PROVIDER = SystemProvider()


class PromptRequest(BaseModel):
    prompt: str
    messages: list[ChatMessage] = []
    context: str = "ui"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _error_payload(
    *,
    error_type: str,
    message: str,
    suggestion: str,
    status_code: int,
    details: Any | None = None,
) -> JSONResponse:
    payload: dict[str, Any] = {
        "ok": False,
        "error_type": error_type,
        "message": message,
        "suggestion": suggestion,
    }
    if details is not None:
        payload["details"] = details
    return JSONResponse(content=payload, status_code=status_code)


# Compiled once at module level — matches any standard English question opener.
_QUESTION_OPENER = re.compile(
    r"^(what|who|where|when|why|how|which|whose|"
    r"is|are|was|were|do|does|did|"
    r"can|could|will|would|should|"
    r"has|have|had|am|"
    r"isn't|aren't|doesn't|don't|won't|wasn't|weren't|"
    r"tell me|help me understand|explain to me)\b",
    re.IGNORECASE,
)

# Matches conversational/self-referential queries that depend on history,
# NOT on document retrieval — must run before _QUESTION_OPENER to intercept
# questions like "what was my first message" before they fall into rag.
_CONVERSATIONAL_REF = re.compile(
    r"\b(my (first|last|previous|earlier) message"
    r"|what (did|have) i (say|said|ask|asked|tell|told)"
    r"|do you remember"
    r"|you (said|told|mentioned)"
    r"|earlier (you|i|we)"
    r"|our (conversation|chat|discussion)"
    r"|what (were|was) (we|i) (talking|asking|discussing))\b",
    re.IGNORECASE,
)

# Matches interrogative service/process status queries that must route to
# "system" even though they look like questions.
# Must be checked before _QUESTION_OPENER in classify_prompt().
_SERVICE_INTENT_RE = re.compile(
    r"\b(is|are|check|did|does|can|show|get|find)\b"
    r".{0,50}"
    r"\b(running|active|up|status|enabled|stopped|dead|failed|started|open|alive|responding)\b",
    re.IGNORECASE,
)

# Matches subject-first phrasing: "nginx running?", "ollama up?"
_PROCESS_SUBJECT_RE = re.compile(
    r"^[\w\-\.\/]+\s+(up|running|active|alive|started|open)\??$",
    re.IGNORECASE,
)

_HISTORY_CAP: int = 8 if gpu_available() else 4


def classify_prompt(message: str, precomputed_route: str | None = None) -> Literal["system", "rag", "chat"]:
    """
    Route a prompt to system/rag/chat.

    If precomputed_route is provided (from classify_semantic), uses it directly.
    Falls back to the existing regex/keyword logic if not — preserving all
    existing behaviour for non-streaming callers (/ask, /ask_rag etc).
    """
    if precomputed_route in ("system", "rag", "chat"):
        return precomputed_route  # type: ignore[return-value]

    text = message.strip()
    text_lower = text.lower()

    # Conversational self-reference — must precede _QUESTION_OPENER.
    # These prompts require conversation history to answer, not doc retrieval.
    if _CONVERSATIONAL_REF.search(text_lower):
        return "chat"

    # Service/process status questions look like questions but need live tool data.
    # Must precede _QUESTION_OPENER so they don't fall into RAG.
    if _SERVICE_INTENT_RE.search(text) or _PROCESS_SUBJECT_RE.match(text):
        return "system"

    # Interrogative structure check — covers all standard English question
    # forms including "is my system connected", "are my services running",
    # "can I check the firewall", "does this affect the network", etc.
    # Also catches a trailing question mark regardless of word order.
    if _QUESTION_OPENER.match(text) or text.endswith("?"):
        return "rag"

    command_words = (
        "service",
        "restart",
        "firewall",
        "network",
        "status",
        "user",
        "theme",
    )

    knowledge_words = (
        "architecture",
        "documentation",
        "docs",
    )

    if any(x in text_lower for x in command_words):
        return "system"

    if any(x in text_lower for x in knowledge_words):
        return "rag"

    return "chat"


def classify_rag_domain(message: str) -> Literal["docs", "code", "system-help"]:
    text = (message or "").strip().lower()

    if any(term in text for term in ("api", "endpoint", "route", "function", "class", "module", "script", "code")):
        return "code"
    if any(term in text for term in ("service", "firewall", "network", "users", "theme", "system", "troubleshoot", "fix")):
        return "system-help"
    return "docs"


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = text.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = raw[start : end + 1]
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("model response did not contain a JSON object")


def _plan_tool_call(prompt: str, context_text: str) -> tuple[str | None, dict[str, Any]]:
    """
    Ask the model to choose from the explicit tool contract only.

    This step blocks hallucinated endpoints/commands by forcing selection from tools.json.
    """
    tools = [
        {
            "name": name,
            "description": tool.get("description", ""),
            "args": schema_to_manifest(tool.get("schema", {})),
        }
        for name, tool in TOOL_REGISTRY.items()
    ]
    tools_manifest = json.dumps(tools, indent=2)
    planning_prompt = f"""
You are choosing whether to call a system tool.
Return strict JSON only, no markdown, no prose.

Canonical tool schema:
{tools_manifest}

Response schema:
{{
  "tool": "<tool_name_or_null>",
  "parameters": {{}}
}}

User question:
{prompt}

Relevant project context:
{context_text or "No relevant context."}
"""
    selection = _ollama_generate(planning_prompt, model="mistral")
    payload = _extract_json_object(selection)
    tool_name = payload.get("tool")
    parameters = payload.get("parameters", {})
    if tool_name in (None, "", "null"):
        return None, {}
    if not isinstance(tool_name, str):
        raise ValueError("tool must be a string or null")
    if not isinstance(parameters, dict):
        raise ValueError("parameters must be an object")
    return tool_name, parameters


def _command_hint_block() -> str:
    """
    Expose the deterministic tool contract to the model so it can emit only
    supported structured commands instead of hallucinating actions.
    """
    manifest = TOOL_ROUTER.get_tools_manifest()
    command_names = [tool.get("name", "") for tool in manifest.get("tools", []) if tool.get("name")]
    command_list = "\n".join(f"- {name}" for name in command_names) or "- No commands available"
    return f"""
COMMAND KERNEL
You can execute system commands through a deterministic backend kernel.

Available commands:
{command_list}

When a request matches a command, respond with JSON:
{{
  "command": "set_theme",
  "theme": "terminal"
}}
"""


# Page → description map mirrors the frontend PAGE_CONTEXT_MAP.
# Gives Mistral enough detail to pre-select relevant data and tailor answers.
_PAGE_DESCRIPTIONS = {
    "dashboard":       "Main dashboard — overview widgets, recent activity, quick actions.",
    "system-monitor":  "System monitor — tabs for metrics, services, storage, appearance, settings.",
    "network-manager": "Network manager — interfaces, firewall rules, routing table.",
    "user-manager":    "User manager — local Linux user accounts and groups.",
    "log-viewer":      "Log viewer — journald output and system log files.",
    "unknown":         "Page unknown.",
}

# Page → Tier 2 topics to always inject when on that page, regardless of
# prompt wording. Supplements semantic/keyword detection.
_PAGE_DEFAULT_TOPICS = {
    "system-monitor":  ["processes", "services", "memory", "disk"],
    "network-manager": ["network"],
    "dashboard":       ["services", "memory"],
    "user-manager":    [],
    "log-viewer":      [],
}


def _read_screen_state() -> str | None:
    """
    Read the latest screen state written by screen_agent.py.
    Returns None if the file doesn't exist or is stale (> 30s old).
    Stale check prevents Mistral from reasoning about outdated window state
    if the agent stopped running.
    """
    try:
        if not _SCREEN_STATE_FILE.exists():
            return None

        # Stale guard — if file hasn't been updated in 30s, agent is likely dead
        age = time.time() - _SCREEN_STATE_FILE.stat().st_mtime
        if age > 30:
            return None

        state = json.loads(_SCREEN_STATE_FILE.read_text(encoding="utf-8"))

        window = state.get("active_window", {})
        terminals = state.get("open_terminals", [])

        lines = []

        title = window.get("title")
        app = window.get("app")
        if title or app:
            lines.append(f"active_window: {title or 'unknown'} (app: {app or 'unknown'})")

        if terminals:
            for t in terminals[:5]:  # cap output — Mistral doesn't need 10 terminal entries
                cwd = t.get("cwd") or "unknown"
                name = t.get("name") or "terminal"
                lines.append(f"open_terminal: {name} in {cwd}")

        return "\n".join(lines) if lines else None

    except Exception as exc:
        logger.debug("Screen state read failed: %s", exc)
        return None


def _build_live_state_block(
    query: str,
    precomputed_topics: list[str] | None = None,
    page_context: str = "unknown",
) -> str:
    """
    Build the LIVE SYSTEM STATE block injected into every prompt.

    Three data sources combined:
    - Tier 1: unconditional baseline (always, cheap)
    - Tier 2a: page-default topics — data relevant to the current page
      regardless of prompt wording (e.g. on system-monitor, always include
      services and memory even if the user says "anything look off?")
    - Tier 2b: query-detected topics from semantic/keyword detection
    """
    # ── Tier 1: unconditional baseline ────────────────────────────────────
    try:
        status = get_status()
        uptime_sec = status.get("uptime", 0)
        uptime_h = uptime_sec // 3600
        uptime_m = (uptime_sec % 3600) // 60
        uptime_str = f"{uptime_h}h {uptime_m}m" if uptime_h else f"{uptime_m}m"
        load = status.get("load_avg") or []
        load_str = ", ".join(f"{v:.2f}" for v in load) if load else "unavailable"

        baseline = (
            f"hostname: {status.get('hostname', 'unknown')}\n"
            f"platform: {status.get('platform', 'unknown')} {status.get('arch', '')}\n"
            f"uptime: {uptime_str} ({uptime_sec}s)\n"
            f"cpu_percent: {status.get('cpu_load', 'N/A')}%\n"
            f"load_avg (1m/5m/15m): {load_str}\n"
            f"memory_used: {status.get('memory_used', 'N/A')} / "
            f"{status.get('memory_total', 'N/A')} bytes "
            f"({status.get('memory_usage', 'N/A'):.1f}%)\n"
            f"disk_used: {status.get('disk_used', 'N/A')} / "
            f"{status.get('disk_total', 'N/A')} bytes "
            f"({status.get('disk_usage', 'N/A'):.1f}%)\n"
            f"process_count: {status.get('process_count', 'N/A')}\n"
            f"network_rx_bytes: {status.get('network_rx', 'N/A')}\n"
            f"network_tx_bytes: {status.get('network_tx', 'N/A')}"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Baseline status collection failed: %s", exc)
        baseline = "Baseline system data unavailable."

    # Page context header — tells Mistral where the user is and what's visible
    page_desc = _PAGE_DESCRIPTIONS.get(page_context, _PAGE_DESCRIPTIONS["unknown"])
    sections = [
        f"[CURRENT PAGE: {page_context.upper()}]\n{page_desc}",
        f"[LIVE BASELINE]\n{baseline}",
    ]

    screen = _read_screen_state()
    if screen:
        sections.append(f"[LIVE SCREEN]\n{screen}")

    # ── Tier 2: merge page-default topics + query-detected topics ─────────
    page_topics = _PAGE_DEFAULT_TOPICS.get(page_context, [])
    query_topics = precomputed_topics if precomputed_topics is not None else detect_live_topics(query)
    # Deduplicate while preserving order: page topics first, then query extras
    all_topics = list(dict.fromkeys(page_topics + query_topics))

    if all_topics:
        try:
            snapshots = SYSTEM_PROVIDER.snapshot(all_topics)
            for topic, content in snapshots.items():
                sections.append(f"[LIVE {topic.upper()}]\n{content}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Topic snapshot failed for %s: %s", all_topics, exc)

    return "\n\n".join(sections)


def handle_tool_prompt(prompt: str) -> dict[str, Any]:
    tool_name, tool_parameters = _plan_tool_call(prompt, "")
    if not tool_name:
        raise ToolRouterError("No tool selected for tool-routed request")
    return TOOL_ROUTER.execute(tool_name, tool_parameters)


def execute_tool(tool_name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool_name == "set_ui_override":
        return {
            "ok": True,
            "message": "UI updated",
            "data": args,
        }

    mapped_tool = TOOL_NAME_MAP.get(tool_name, tool_name)
    return TOOL_ROUTER.execute(mapped_tool, args)


def run_command_kernel(prompt: str) -> dict[str, Any] | None:
    logger.info(f"[COMMAND_KERNEL] evaluating prompt: {prompt}")
    kernel_result = evaluate_prompt(prompt)
    logger.info(f"[COMMAND_KERNEL] result: {kernel_result}")

    if not kernel_result:
        return None

    if kernel_result["type"] == "error":
        return {
            "status_code": 400,
            "content": {
                "route": "command_error",
                "message": kernel_result["error"],
                "tool": kernel_result.get("tool"),
            },
        }

    if kernel_result["type"] == "tool":
        tool_name = kernel_result["tool"]
        args = kernel_result.get("args", {})
        logger.info(f"[TOOL_ROUTER] executing tool: {tool_name}")

        # Theme updates go through the tool router directly.
        result = execute_tool(tool_name, args)
        if tool_name == "set_theme":
            return {
                "status_code": 200,
                "content": {
                    "route": "ui",
                    "action": "set_theme",
                    "action_args": args,
                    "message": f"Theme switched to {args.get('theme')}",
                },
            }

        # Default command responses keep the existing payload contract.
        return {
            "status_code": 200,
            "content": {
                "route": "command",
                "message": result.get("message", "Command executed"),
                "tool": tool_name,
                "data": result,
            },
        }

    return None


def handle_rag_prompt(prompt: str) -> tuple[str, list[dict], str]:
    domain = classify_rag_domain(prompt)
    live_block = _build_live_state_block(prompt)
    context_results = retrieve(prompt, domain=domain)
    context_text = build_context_block(context_results)
    system_prompt = f"""
SYSTEM CAPABILITIES
{CAPABILITY_BLOCK}

LIVE SYSTEM STATE
{live_block or "No live system data was requested for this question."}

USER QUESTION
{prompt}

Rules:
- Prefer LIVE SYSTEM STATE when the question asks about current runtime conditions.
- Prefer information found inside RELEVANT PROJECT FILES for project and documentation questions.
- If not present, respond with "Information not found in system context."
- Do not invent configuration or runtime state.
- Do not invent tools, shell commands, or undocumented endpoints.
- Do not generate CSS variables, UI override commands, or direct UI modification payloads.
- UI customization is handled only by the deterministic UI intent parser.

{_command_hint_block()}

RELEVANT PROJECT FILES
{context_text or "No relevant Lady Linux project context was retrieved."}
"""
    output = _ollama_generate(system_prompt, model="mistral")
    return output, context_results, domain


def handle_hybrid_prompt(prompt: str) -> tuple[str, dict[str, Any] | None, list[dict], str]:
    domain = classify_rag_domain(prompt)
    live_block = _build_live_state_block(prompt)
    context_results = retrieve(prompt, domain=domain)
    context_text = build_context_block(context_results)

    tool_name, tool_parameters = _plan_tool_call(prompt, context_text)
    tool_result: dict[str, Any] | None = None
    if tool_name:
        tool_result = TOOL_ROUTER.execute(tool_name, tool_parameters)

    system_prompt = f"""
SYSTEM CAPABILITIES
{CAPABILITY_BLOCK}

LIVE SYSTEM STATE
{live_block or "No live system data was requested for this question."}

USER QUESTION
{prompt}

Rules:
- Prefer LIVE SYSTEM STATE when the question asks about current runtime conditions.
- Prefer information found inside RELEVANT PROJECT FILES and TOOL RESULT.
- If not present, respond with "Information not found in system context."
- Do not invent configuration or runtime state.
- Do not invent tools, shell commands, or undocumented endpoints.
- Do not generate CSS variables, UI override commands, or direct UI modification payloads.
- UI customization is handled only by the deterministic UI intent parser.

{_command_hint_block()}

RELEVANT PROJECT FILES
{context_text or "No relevant Lady Linux project context was retrieved."}

TOOL RESULT
{json.dumps(tool_result, indent=2) if tool_result is not None else "No tool was needed."}
"""
    output = _ollama_generate(system_prompt, model="mistral")
    return output, tool_result, context_results, domain


def handle_chat_prompt(prompt: str) -> str:
    live_block = _build_live_state_block(prompt)
    chat_prompt = f"""
You are Lady Linux, a Linux assistant. Keep responses concise and accurate.
Use LIVE SYSTEM STATE first when the question is about current runtime status.
If a live system action is required, tell the user to use the appropriate
command — do not emit JSON or structured payloads.
Do not generate CSS variables, UI override commands, or theme modification payloads.
UI customization is handled only by the deterministic UI intent parser.

LIVE SYSTEM STATE
{live_block or "No live system data was requested for this question."}

User question:
{prompt}
"""
    return _ollama_generate(chat_prompt, model="mistral")


def _ollama_generate(prompt: str, model: str = "mistral") -> str:
    """Call Ollama through its HTTP API and normalize output text."""
    ensure_model()
    response = requests.post(
        OLLAMA_URL,
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=None,  # uncapped — CPU-only Mistral 7B with live state injection can exceed 3min under VM resource constraints
    )
    response.raise_for_status()

    # Prefer JSON payload for stream=false responses.
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("response", ""))
    except Exception:
        pass

    # Fallback for legacy newline-delimited behavior.
    output = ""
    for line in response.text.strip().splitlines():
        try:
            chunk = json.loads(line)
            output += chunk.get("response", "")
        except json.JSONDecodeError:
            output += line
    return output


def _ollama_stream(prompt: str, model: str = "mistral"):
    """Call Ollama with streaming enabled and yield text tokens as they arrive.

    Each iteration yields a single string token. The caller is responsible
    for wrapping tokens into whatever wire format the endpoint needs.

    Raises requests.RequestException if the Ollama service is unreachable.
    """
    ensure_model()
    with requests.post(
        OLLAMA_URL,
        json={"model": model, "prompt": prompt, "stream": True},
        stream=True,
        timeout=None,  # uncapped — VM CPU inference has no reliable upper bound
    ) as resp:
        resp.raise_for_status()
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            try:
                chunk = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            token = chunk.get("response", "")
            if token:
                yield token
            if chunk.get("done", False):
                break


def _ollama_stream_chat(messages: list[dict], model: str = "mistral"):
    """Call Ollama /api/chat with streaming, yielding text tokens.

    Used when conversation history is available — /api/chat preserves
    multi-turn context natively. The system prompt is prepended as the
    first message by the caller.
    """
    ensure_model()
    with requests.post(
        "http://127.0.0.1:11434/api/chat",
        json={"model": model, "messages": messages, "stream": True},
        stream=True,
        timeout=None,  # uncapped — matches _ollama_stream policy
    ) as resp:
        resp.raise_for_status()
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            try:
                chunk = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            token = chunk.get("message", {}).get("content", "")
            if token:
                yield token
            if chunk.get("done", False):
                break


def rag_collection_is_empty() -> bool:
    """Check whether Qdrant already contains vectors for startup seeding."""
    try:
        info = client().get_collection(COLLECTION_NAME)
        points_count = getattr(info, "points_count", None)
        return not points_count or points_count == 0
    except Exception:
        return True


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "ok" in detail and "error_type" in detail:
        return JSONResponse(content=detail, status_code=exc.status_code)
    return _error_payload(
        error_type="request_failed",
        message=str(detail),
        suggestion="Check request parameters and endpoint availability.",
        status_code=exc.status_code,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return _error_payload(
        error_type="internal_error",
        message=str(exc),
        suggestion="Retry the request. If it persists, inspect backend logs.",
        status_code=500,
    )


_seed_running = False

@app.on_event("startup")
def init_rag() -> None:
    ensure_collection()
    if rag_collection_is_empty():
        def _seed_with_flag():
            global _seed_running
            _seed_running = True
            seed()
            _seed_running = False
        threading.Thread(target=_seed_with_flag, daemon=True).start()

    def preload() -> None:
        time.sleep(30)
        ensure_model()
    threading.Thread(target=preload, daemon=True).start()

@app.get("/api/rag/status")
def rag_status():
    return {"seeding": _seed_running}

@app.get("/")
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/network")
def network_page(request: Request):
    return templates.TemplateResponse("network.html", {"request": request})


@app.get("/firewall")
def firewall_redirect():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/network", status_code=301)


@app.post("/users")
@app.get("/users")
def users_page(request: Request):
    return templates.TemplateResponse("users.html", {"request": request})


@app.post("/os")
@app.get("/os")
def os_page(request: Request):
    return templates.TemplateResponse("os.html", {"request": request})


@app.get("/logs")
def logs_page(request: Request):
    return templates.TemplateResponse("logs.html", {"request": request})


# Legacy: previously targeted phi3, now routes to mistral via Ollama.
@app.post("/ask_llm")
async def ask_phi3_post(req: PromptRequest):
    try:
        return PlainTextResponse(content=_ollama_generate(req.prompt, model="mistral"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc


@app.get("/ask_llm")
def ask_phi3_get(prompt: str):
    try:
        return {"output": _ollama_generate(prompt, model="mistral")}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc


@app.post("/ask_rag")
async def ask_rag(req: PromptRequest):
    """
    Pipeline architecture:

    1) Deterministic command kernel fast path
    2) RAG for documentation/explanations
    3) LLM chat fallback
    """

    prompt = req.prompt

    try:
        kernel_response = run_command_kernel(prompt)
        if kernel_response is not None:
            log_action("assistant", prompt[:120], kernel_response["content"].get("route", "command"))
            return JSONResponse(
                status_code=kernel_response["status_code"],
                content=kernel_response["content"],
            )

        # ---------------------------------------------------------
        # STEP 1 — PROMPT ROUTING
        # ---------------------------------------------------------
        route = classify_prompt(prompt)

        logger.info(f"[ROUTER] classified route: {route}")

        # ---------------------------------------------------------
        # STEP 2 — ROUTED EXECUTION
        # ---------------------------------------------------------
        if route == "system":
            tool_result = handle_tool_prompt(prompt)
            log_action("assistant:tool", prompt[:120], tool_result.get("tool", "unknown"))
            return JSONResponse(
                content={
                    "route": "tool",
                    "message": tool_result.get("message", "Tool executed"),
                    "tool": tool_result.get("tool"),
                    "data": tool_result,
                }
            )

        # ---------------------------------------------------------
        # STEP 3 — RAG PATH
        # ---------------------------------------------------------
        if route == "rag":
            output, context_results, domain = handle_rag_prompt(prompt)
            log_action("assistant:rag", prompt[:120], domain)
            return JSONResponse(
                content={
                    "route": "rag",
                    "response": output,
                    "answer": output,
                    "model": "mistral",
                    "rag_domain": domain,
                    "retrieved_chunks": len(context_results),
                }
            )

        # ---------------------------------------------------------
        # STEP 4 — CHAT FALLBACK
        # ---------------------------------------------------------
        if route == "chat":
            output = handle_chat_prompt(prompt)
            log_action("assistant:chat", prompt[:120], "ok")
            return JSONResponse(
                content={
                    "route": "chat",
                    "response": output,
                    "answer": output,
                    "model": "mistral",
                    "retrieved_chunks": 0,
                }
            )

        # ---------------------------------------------------------
        # STEP 5 — UNKNOWN ROUTE
        # ---------------------------------------------------------
        return _error_payload(
            error_type="route_resolution_failed",
            message="Prompt route could not be resolved.",
            suggestion="Use a clearer request or verify classify_prompt routing.",
            status_code=400,
        )

    # -------------------------------------------------------------
    # ERROR HANDLING
    # -------------------------------------------------------------

    except ToolRouterError as exc:
        logger.exception("ToolRouter execution failed")

        return _error_payload(
            error_type="tool_execution_failed",
            message=str(exc),
            suggestion="Add missing endpoint to API and tools.json or adjust tool parameters.",
            status_code=400,
        )

    except (ValueError, json.JSONDecodeError) as exc:
        logger.exception("Invalid tool payload")

        return _error_payload(
            error_type="invalid_tool_payload",
            message=str(exc),
            suggestion="Ensure tool planner returns valid JSON with allowed parameters.",
            status_code=400,
        )

    except requests.RequestException as exc:
        logger.exception("LLM backend unavailable")

        return _error_payload(
            error_type="llm_backend_unavailable",
            message=f"LLM request failed: {exc}",
            suggestion="Verify Ollama runtime availability at http://127.0.0.1:11434.",
            status_code=502,
        )

    except Exception as exc:
        logger.exception("Unhandled server error")

        return _error_payload(
            error_type="internal_server_error",
            message=str(exc),
            suggestion="Check backend logs for the stack trace.",
            status_code=500,
        )

@app.post("/api/prompt")
async def prompt(req: PromptRequest):
    """
    Transport compatibility layer.

    The frontend currently sends prompts to /api/prompt.
    Internally forward the request to the command kernel route
    implemented in /ask_rag so the UI does not need modification.
    """
    return await ask_rag(req)


def _stream_llm_response(prompt: str, route: str, handle_fn, history: list[dict] | None = None):
    """Shared generator for RAG and chat streaming routes.

    Calls handle_fn to get the system prompt string, then streams Ollama
    tokens as NDJSON events, finishing with a done event.

    When history is provided, uses /api/chat (multi-turn) with the system
    prompt prepended as a system message. Falls back to /api/generate otherwise.
    """
    try:
        system_prompt, context_results, domain = handle_fn(prompt)
    except Exception as exc:
        yield json.dumps({
            "type": "error",
            "error_type": "internal_server_error",
            "message": str(exc),
            "suggestion": "Check backend logs for the stack trace.",
        }) + "\n"
        return

    retrieved_chunks = len(context_results) if context_results else 0

    try:
        if history:
            # Hard cap at 4 messages (2 exchanges) — each extra turn adds
            # ~13-17s of first-token latency on 4-core CPU-only Mistral 7B.
            trimmed = history[-_HISTORY_CAP:] if len(history) > _HISTORY_CAP else history
            messages = [{"role": "system", "content": system_prompt}] + trimmed
            for token in _ollama_stream_chat(messages):
                yield json.dumps({"type": "token", "text": token}) + "\n"
        else:
            for token in _ollama_stream(system_prompt):
                yield json.dumps({"type": "token", "text": token}) + "\n"
    except requests.RequestException as exc:
        yield json.dumps({
            "type": "error",
            "error_type": "llm_backend_unavailable",
            "message": f"LLM request failed: {exc}",
            "suggestion": "Verify Ollama runtime availability at http://127.0.0.1:11434.",
        }) + "\n"
        return

    yield json.dumps({
        "type": "done",
        "route": route,
        "model": "mistral",
        "retrieved_chunks": retrieved_chunks,
    }) + "\n"


def _build_rag_system_prompt(prompt: str, page_context: str = "unknown", precomputed_topics: list[str] | None = None) -> tuple[str, list[dict], str]:
    domain = classify_rag_domain(prompt)
    live_block = _build_live_state_block(prompt, precomputed_topics=precomputed_topics, page_context=page_context)
    context_results = retrieve(prompt, domain=domain)
    context_text = build_context_block(context_results)

    # Stripped-down RAG prompt for CPU-only inference.
    # Removed: CAPABILITY_BLOCK, full rules list, _command_hint_block().
    # Mistral only needs the question + live state + retrieved context to answer.
    # Full scaffolding can be restored when GPU inference is available.
    system_prompt = f"""You are Lady Linux, a Linux system assistant. Answer concisely using the context below.

LIVE SYSTEM STATE
{live_block or "No live data available."}

RELEVANT CONTEXT
{context_text or "No relevant context found."}

USER QUESTION
{prompt}

Rules: Use context above. Do not invent state or commands. Keep answers brief."""

    return system_prompt, context_results, domain


def _build_chat_system_prompt(prompt: str, page_context: str = "unknown", precomputed_topics: list[str] | None = None) -> tuple[str, list[dict], str]:
    live_block = _build_live_state_block(prompt, precomputed_topics=precomputed_topics, page_context=page_context)

    # Minimal chat prompt — live state + question only.
    # No RAG context injected here; chat route handles conversational queries.
    chat_prompt = f"""You are Lady Linux, a Linux assistant. Be concise.

LIVE SYSTEM STATE
{live_block or "No live data available."}

User: {prompt}"""

    return chat_prompt, [], "chat"


@app.post("/api/prompt/stream")
async def prompt_stream(req: PromptRequest):
    """
    Unified streaming endpoint.

    All route types are handled here:
    - Command kernel / tool routes: emit one JSON event immediately and close.
    - RAG / chat routes: stream Ollama tokens as NDJSON then emit a done event.

    Wire format: newline-delimited JSON (NDJSON).
    Each line is a complete JSON object. Event types: token, done, tool,
    command, ui, error.
    """

    prompt = req.prompt
    page_context = req.context  # real page name e.g. "system-monitor", sent by chat.js
    history = [m.model_dump() for m in req.messages] if req.messages else None

    def generate():
        # ── Command kernel fast path ──────────────────────────────────────────
        kernel_response = run_command_kernel(prompt)
        if kernel_response is not None:
            content = kernel_response["content"]
            route = content.get("route", "command")
            log_action("assistant", prompt[:120], route)
            yield json.dumps({
                "type": route,
                **content,
            }) + "\n"
            return

        # ── Single semantic pre-pass ──────────────────────────────────────────
        # Runs once per request. Results flow to both routing and live state
        # so Mistral is only called once for classification overhead.
        classification = classify_semantic(prompt)
        route = classify_prompt(prompt, precomputed_route=classification["route"])
        topics = classification["topics"]

        logger.info(f"[STREAM ROUTER] semantic route={route} page={page_context} topics={topics}")

        # ── Tool route ────────────────────────────────────────────────────────
        if route == "system":
            try:
                tool_result = handle_tool_prompt(prompt)
                log_action("assistant:tool", prompt[:120], tool_result.get("tool", "unknown"))
                yield json.dumps({
                    "type": "tool",
                    "route": "tool",
                    "message": tool_result.get("message", "Tool executed"),
                    "tool": tool_result.get("tool"),
                    "data": tool_result,
                }) + "\n"
            except ToolRouterError as exc:
                yield json.dumps({
                    "type": "error",
                    "error_type": "tool_execution_failed",
                    "message": str(exc),
                    "suggestion": "Add missing endpoint to API and tools.json or adjust tool parameters.",
                }) + "\n"
            return

        # ── RAG streaming ─────────────────────────────────────────────────────
        if route == "rag":
            log_action("assistant:rag", prompt[:120], "streaming")
            yield from _stream_llm_response(
                prompt, "rag",
                lambda p: _build_rag_system_prompt(p, page_context=page_context, precomputed_topics=topics),
                history,
            )
            return

        # ── Chat streaming ────────────────────────────────────────────────────
        if route == "chat":
            log_action("assistant:chat", prompt[:120], "streaming")
            yield from _stream_llm_response(
                prompt, "chat",
                lambda p: _build_chat_system_prompt(p, page_context=page_context, precomputed_topics=topics),
                history,
            )
            return

        # ── Unknown route ─────────────────────────────────────────────────────
        yield json.dumps({
            "type": "error",
            "error_type": "route_resolution_failed",
            "message": "Prompt route could not be resolved.",
            "suggestion": "Use a clearer request or verify classify_prompt routing.",
        }) + "\n"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@app.post("/ask")
async def ask(req: PromptRequest):
    """
    Unified chat endpoint that shares the deterministic command kernel with
    /ask_rag before falling back to RAG/LLM.
    """
    kernel_response = run_command_kernel(req.prompt)
    if kernel_response is not None:
        return kernel_response["content"]

    route = classify_prompt(req.prompt)
    # System prompts execute deterministic tools instead of entering RAG.
    if route == "system":
        result = handle_tool_prompt(req.prompt)
        return {"type": "tool", "message": result.get("message", "Tool executed"), "data": result}
    if route == "rag":
        output, context_results, domain = handle_rag_prompt(req.prompt)
        return {
            "type": "rag",
            "response": output,
            "model": "mistral",
            "rag_domain": domain,
            "retrieved_chunks": len(context_results),
        }
    output = handle_chat_prompt(req.prompt)
    return {"type": "llm", "response": output, "model": "mistral"}


@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    ensure_model()
    user_messages = [message.content for message in req.messages if message.role == "user" and message.content.strip()]
    latest_user_message = user_messages[-1] if user_messages else ""
    live_block = _build_live_state_block(latest_user_message)
    outbound_messages = [message.model_dump() for message in req.messages]

    if live_block:
        outbound_messages = [
            {
                "role": "system",
                "content": (
                    "You are Lady Linux, a Linux system assistant. "
                    "Use the live system data below before any older conversational context. "
                    "Do not make up process names, PIDs, or service state.\n\n"
                    f"{live_block}"
                ),
            },
            *outbound_messages,
        ]

    response = requests.post(
        "http://127.0.0.1:11434/api/chat",
        json={
            "model": "mistral",
            "messages": outbound_messages,
            "stream": False,
        },
        timeout=None,  # uncapped — matches rest of pipeline
    )
    response.raise_for_status()
    return response.json()


@app.post("/ask_firewall")
async def ask_firewall(request: Request):
    body = await request.json()
    prompt = body.get("prompt", "")
    fw_json = get_firewall_status_json()

    full_prompt = f"""
User question: {prompt}

Firewall status (JSON structure below for reference):
{json.dumps(fw_json, indent=2)}

Explain this firewall configuration clearly for a Linux user.
"""

    try:
        output = _ollama_generate(full_prompt, model="mistral")
        return PlainTextResponse(content=f"Lady Linux: {output.strip()}")
    except Exception as exc:  # noqa: BLE001
        return PlainTextResponse(content=f"Lady Linux: Error - {str(exc)}")


def log_action(action: str, target: str, status: str) -> None:
    # Logging failures should not break request handling.
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "time": datetime.now().isoformat(),
                        "action": action,
                        "target": target,
                        "status": status,
                    }
                )
                + "\n"
            )
    except OSError as exc:
        logger.warning("Action log write failed: %s", exc)


@app.post("/disable_service")
def disable_service(target: str):
    """Compatibility endpoint for existing UI controls."""
    try:
        service_name = validate_service_name(target)
        unit = f"{service_name}.service" if not service_name.endswith(".service") else service_name

        disable_result = run_command(["systemctl", "disable", unit])
        stop_result = run_command(["systemctl", "stop", unit])
        if not disable_result.ok or not stop_result.ok:
            raise HTTPException(
                status_code=500,
                detail={
                    "disable": disable_result.model_dump(),
                    "stop": stop_result.model_dump(),
                },
            )

        log_action("disable_service", service_name, "success")
        return {"status": "ok", "message": f"{service_name} disabled on boot."}
    except ValueError as exc:
        log_action("disable_service", target, "failed")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# Backward-compatible aliases used by legacy frontend paths.
@app.get("/api/system")
def api_system() -> dict:
    return {"ok": True, **get_status()}


@app.get("/api/firewall")
def api_firewall():
    return os_core.handle_intent(
        {
            "intent": "firewall.status",
            "args": {},
            "meta": {"dry_run": False},
        }
    )


@app.get("/api/users")
def api_users():
    return os_core.handle_intent(
        {
            "intent": "users.list",
            "args": {},
            "meta": {"dry_run": False},
        }
    )


@app.post("/api/service/{service}/{action}")
def api_service(service: str, action: str):
    return os_core.handle_intent(
        {
            "intent": "service.action",
            "args": {"name": service, "action": action},
            "meta": {"dry_run": False},
        }
    )


@app.post("/api/intent")
async def api_intent(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")
    return os_core.handle_intent(payload)
