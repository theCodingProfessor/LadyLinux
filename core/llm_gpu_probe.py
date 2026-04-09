from __future__ import annotations

import logging
import shutil
import subprocess

import requests

logger = logging.getLogger("ladylinux.gpu_probe")

_gpu_available: bool | None = None
_OLLAMA_BASE = "http://127.0.0.1:11434"


def _probe_cli(cmd: list[str]) -> bool:
    """Return True when a GPU CLI exits successfully with non-empty output."""
    if shutil.which(cmd[0]) is None:
        return False
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            start_new_session=True,
        )
        return result.returncode == 0 and bool(result.stdout.strip())
    except Exception:
        return False


def _probe_ollama_ps() -> bool:
    """Return True when Ollama reports any loaded model using GPU layers."""
    try:
        response = requests.get(f"{_OLLAMA_BASE}/api/ps", timeout=3)
        if not response.ok:
            return False
        models = response.json().get("models", [])
        return any(model.get("details", {}).get("num_gpu_layers", 0) > 0 for model in models)
    except Exception:
        return False


def gpu_available() -> bool:
    """Detect usable GPU support once and cache the result."""
    global _gpu_available

    if _gpu_available is not None:
        return _gpu_available

    if _probe_cli(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]):
        logger.info("GPU probe: NVIDIA GPU detected via nvidia-smi - GPU mode enabled")
        _gpu_available = True
        return True

    if _probe_cli(["rocm-smi", "--showproductname"]):
        logger.info("GPU probe: AMD GPU detected via rocm-smi - GPU mode enabled")
        _gpu_available = True
        return True

    if _probe_ollama_ps():
        logger.info("GPU probe: GPU layers detected via Ollama /api/ps - GPU mode enabled")
        _gpu_available = True
        return True

    logger.info("GPU probe: no GPU detected (checked nvidia-smi, rocm-smi, Ollama /api/ps) - CPU mode")
    _gpu_available = False
    return False
