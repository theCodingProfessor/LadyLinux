from datetime import datetime

import json
import requests
import subprocess
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from api_layer import os_core
from api_layer.firewall_core import get_firewall_status_json

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

LOG_FILE = "/var/log/ladylinux/actions.log"

OLLAMA_URL = "http://localhost:11434/api/generate"


def _load_theme_keys():
    try:
        with open("static/themes.json", "r", encoding="utf-8") as handle:
            theme_data = json.load(handle)
        themes = theme_data.get("themes", {})
        if isinstance(themes, dict):
            return list(themes.keys())
    except Exception:
        pass
    return ["soft", "crimson", "glass", "terminal", "custom-1", "custom-2", "custom-3", "custom-4"]


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/firewall")
def firewall_page(request: Request):
    return templates.TemplateResponse("firewall.html", {"request": request})


@app.post("/users")
@app.get("/users")
def users_page(request: Request):
    return templates.TemplateResponse("users.html", {"request": request})


@app.post("/os")
@app.get("/os")
def os_page(request: Request):
    return templates.TemplateResponse("os.html", {"request": request})


class PromptRequest(BaseModel):
    prompt: str


@app.post("/ask_phi3")
async def ask_phi3_post(req: PromptRequest):
    theme_keys = _load_theme_keys()
    ui_prompt_prefix = (
        "You are the Lady Linux assistant. Reply normally to the user's request.\n"
        f"Allowed theme keys: {', '.join(theme_keys)}.\n"
        "Only when the user explicitly asks to change, switch, or set the theme, append exactly one final line in this exact format:\n"
        'LL_UI: {"action":"set_theme","theme":"<theme_key>"}\n'
        "The theme_key must be one of the allowed theme keys.\n"
        "If the user is not explicitly requesting a theme change, do not output any line containing LL_UI.\n\n"
        f"User request:\n{req.prompt}"
    )

    def stream():
        resp = requests.post(
            OLLAMA_URL,
            json={"model": "mistral:latest", "prompt": ui_prompt_prefix},
            stream=True
        )
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                yield chunk.get("response", "")

    return StreamingResponse(stream(), media_type="text/plain")


@app.get("/ask_phi3")
def ask_phi3_get(prompt: str):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "mistral:latest", "prompt": prompt}
    )
    return {"output": response.text}


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
        resp = requests.post(
            OLLAMA_URL,
            json={"model": "mistral:latest", "prompt": full_prompt}
        )

        lines = resp.text.strip().splitlines()
        output = ""
        for line in lines:
            try:
                chunk = json.loads(line)
                output += chunk.get("response", "")
            except json.JSONDecodeError:
                output += line

        return PlainTextResponse(content=f"Lady Linux: {output.strip()}")

    except Exception as e:
        return PlainTextResponse(content=f"Lady Linux: Error - {str(e)}")


def log_action(action, target, status):
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps({
            "time": datetime.now().isoformat(),
            "action": action,
            "target": target,
            "status": status
        }) + "\n")


@app.post("/disable_service")
def disable_service(target: str):
    try:
        subprocess.run(["systemctl", "disable", target], check=True)
        subprocess.run(["systemctl", "stop", target], check=True)
        log_action("disable_service", target, "success")
        return {"status": "ok", "message": f"{target} disabled on boot."}
    except Exception as e:
        log_action("disable_service", target, "failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system")
def api_system():
    return os_core.handle_intent({
        "intent": "system.snapshot",
        "args": {},
        "meta": {"dry_run": False},
    })

@app.get("/api/firewall")
def api_firewall():
    return os_core.handle_intent({
        "intent": "firewall.status",
        "args": {},
        "meta": {"dry_run": False},
    })

@app.get("/api/users")
def api_users():
    return os_core.handle_intent({
        "intent": "users.list",
        "args": {},
        "meta": {"dry_run": False},
    })

@app.post("/api/service/{service}/{action}")
def api_service(service: str, action: str):
    return os_core.handle_intent({
        "intent": "service.action",
        "args": {"name": service, "action": action},
        "meta": {"dry_run": False},
    })


@app.post("/api/intent")
async def api_intent(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")
    return os_core.handle_intent(payload)
