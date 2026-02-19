from fastapi import FastAPI, HTTPException, Request, Form
import requests, json, subprocess, os, re
from datetime import datetime
from fastapi.staticfiles import StaticFiles  
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

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
            json={"model": "phi3:mini", "prompt": req.prompt},
            stream=True
        )
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                yield chunk.get("response", "")
    return StreamingResponse(stream(), media_type="text/plain")


@app.get("/ask_phi3")
def ask_phi3(prompt: str):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "phi3:mini", "prompt": prompt}
    )
    # return raw text
    return {"output": response.text}


@app.post("/ask_firewall")
async def ask_firewall(request: Request):
    body = await request.json()
    prompt = body.get("prompt", "")

    fw_json = get_firewall_status_json()
    full_prompt = f"""
User question: {prompt}

Firewall status JSON:
{fw_json}

Explain this firewall configuration in plain English for a Linux user.
"""
    resp = requests.post(
        OLLAMA_URL,
        json={"model": "phi3:mini", "prompt": full_prompt}
    )

    try:
        lines = resp.text.strip().splitlines()
        output = ""
        for line in lines:
            if line:
                chunk = json.loads(line)
                output += chunk.get("response", "")
        return JSONResponse(content={"output": output, "firewall_json": fw_json})
    except Exception as e:
        return JSONResponse(content={"output": f"Error parsing model response: {str(e)}", "firewall_json": fw_json})


def get_firewall_status_json():
    """Return UFW firewall status as structured JSON."""
    result = subprocess.run(["sudo", "/sbin/ufw", "status", "verbose"], capture_output=True, text=True)
    output = result.stdout.strip()

    # Header info
    status_match = re.search(r"Status:\s+(\w+)", output)
    logging_match = re.search(r"Logging:\s+(.+)", output)
    default_match = re.search(r"Default:\s+(.+)", output)
    new_profiles_match = re.search(r"New profiles:\s+(.+)", output)

    # Parse default policies
    defaults = {}
    if default_match:
        parts = default_match.group(1).split(",")
        for part in parts:
            k, v = part.strip().split()
            defaults[k] = v

    # Parse rules table
    rules = []
    lines = output.splitlines()
    parsing_rules = False
    for line in lines:
        if re.match(r"^To\s+Action\s+From", line):
            parsing_rules = True
            continue
        if parsing_rules:
            if line.strip() == "":
                parsing_rules = False
                continue
            # Extract rule fields
            rule_parts = line.split()
            if len(rule_parts) >= 3:
                rules.append({
                    "port": rule_parts[0],
                    "action": rule_parts[1],
                    "from": " ".join(rule_parts[2:]),
                    "protocol": "tcp/udp"  # placeholder, ufw doesn't show exact protocol here
                })

    return {
        "status": status_match.group(1) if status_match else "unknown",
        "logging": logging_match.group(1) if logging_match else "unknown",
        "defaults": defaults,
        "new_profiles": new_profiles_match.group(1) if new_profiles_match else "none",
        "rules": rules,
        "raw_output": output
    }


def get_firewall_status():
    # Try UFW first
    try:
        result = subprocess.run(
            ["sudo", "/usr/sbin/ufw", "status", "verbose"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and "Status:" in result.stdout:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    # Fallback to iptables
    try:
        result = subprocess.run(
            ["sudo", "/usr/sbin/iptables", "-L"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    # Fallback to nftables
    try:
        result = subprocess.run(
            ["sudo", "/usr/sbin/nft", "list", "ruleset"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass

    return "No firewall configuration could be retrieved."


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





