from fastapi import FastAPI, HTTPException, Request, Form
import requests, json, subprocess, os, re
from datetime import datetime
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel
from api_layer.firewall_core import get_firewall_status_json, get_firewall_status

app = FastAPI()

# Mount /static so Jinja url_for("static", filename="...") works
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

LOG_FILE = "/var/log/ladylinux/actions.log"

# LLM API endpoint
OLLAMA_URL = "http://localhost:11434/api/generate"


# Endpoint for HTML page
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
async def ask_phi3(req: PromptRequest):
    def stream():
        resp = requests.post(
            OLLAMA_URL,
            json={"model": "mistral:latest", "prompt": req.prompt},
            stream=True
        )
        # this is a comment
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                yield chunk.get("response", "")

    return StreamingResponse(stream(), media_type="text/plain")


@app.get("/ask_phi3")
def ask_phi3(prompt: str):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "mistral:latest", "prompt": prompt}
    )
    # return raw text
    return {"output": response.text}


@app.post("/ask_firewall")
async def ask_firewall(request: Request):
    """Ask the Lady Linux assistant about the system firewall (plain text response)."""
    body = await request.json()
    prompt = body.get("prompt", "")

    # Get the firewall status as JSON (for context)
    fw_json = get_firewall_status_json()

    # Combine into a human-readable prompt for the model
    full_prompt = f"""
User question: {prompt}

Firewall status (JSON structure below for reference):
{json.dumps(fw_json, indent=2)}

Explain this firewall configuration clearly for a Linux user.
"""

    try:
        # Query the model (phi3:mini or other)
        resp = requests.post(
            OLLAMA_URL,
            json={"model": "mistral:latest", "prompt": full_prompt}
        )

        # Parse model's streaming response lines safely
        lines = resp.text.strip().splitlines()
        output = ""
        for line in lines:
            try:
                chunk = json.loads(line)
                output += chunk.get("response", "")
            except json.JSONDecodeError:
                output += line  # handle non-JSON chunks gracefully

        # ✅ Return just plain text (no JSON at all)
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
    # Ask Gatekeeper (could be another microservice)
    # For now, auto-approve
    try:
        subprocess.run(["systemctl", "disable", target], check=True)
        subprocess.run(["systemctl", "stop", target], check=True)
        log_action("disable_service", target, "success")
        return {"status": "ok", "message": f"{target} disabled on boot."}
    except Exception as e:
        log_action("disable_service", target, "failed")
        raise HTTPException(status_code=500, detail=str(e))
