import threading
import requests

MODEL_NAME = "mistral"
OLLAMA_BASE_URL = "http://127.0.0.1:11434"

model_verified = False
lock = threading.Lock()

def ensure_model() -> None:
    """Verify the model is available in Ollama. No-op after first successful check."""
    global model_verified
    if model_verified:
        return
    with lock:
        if model_verified:
            return
        try:
            response = requests.get(
                f"{OLLAMA_BASE_URL}/api/tags",
                timeout=5,
            )
            if response.ok:
                models = [m.get("name", "") for m in response.json().get("models", [])]
                if any(MODEL_NAME in m for m in models):
                    model_verified = True
        except Exception:
            # Ollama not reachable — let the caller's request fail naturally
            pass