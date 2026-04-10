"""
Lady Linux Capstone Project - RAG Layer
File: config.py
Description: Central configuration for chunking, retrieval, and vector store
             settings used by the RAG pipeline.
"""

import os
from pathlib import Path

from core.llm_gpu_probe import gpu_available
from core.rag.domain_router import detect_domain_from_path

# Qdrant
# QDRANT_MODE controls the client backend:
#   "memory" - in-process, wiped on restart (dev/test only)
#   "local"  - embedded on-disk persistence via qdrant-client (default for prod)
#   "server" - remote Qdrant server (Docker / dedicated instance)
QDRANT_MODE = os.getenv("QDRANT_MODE", "local")  # "memory" | "local" | "server"
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_PATH = os.getenv("QDRANT_PATH", "/var/lib/ladylinux/qdrant")
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ladylinux")

# Embedding model (Ollama)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBED_URL = f"{OLLAMA_BASE_URL}/api/embeddings"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
VECTOR_DIM = int(os.getenv("VECTOR_DIM", "768"))  # nomic-embed-text -> 768

# Chunking and retrieval tuning - auto-scaled based on available hardware.
# IMPORTANT: changing CHUNK_SIZE requires a full Qdrant re-seed.
if gpu_available():
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "64"))
    TOP_K = int(os.getenv("TOP_K", "5"))
else:
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "256"))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "32"))
    TOP_K = int(os.getenv("TOP_K", "3"))

# File safety limits
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(1 * 1024 * 1024)))  # 1 MB

# Project-focused RAG scope:
# We intentionally exclude core OS directories from indexing because they
# produce noisy, generic Linux context that degrades Lady Linux answers.
ALLOWED_RAG_PATHS: list[str] = [
    "/opt/ladylinux",
    "templates",
    "static",
    "config",
    "scripts",
]

EXCLUDED_RAG_PATHS: list[str] = [
    "/etc",
    "/usr",
    "/lib",
    "/bin",
    "/var",
    "/boot",
    "/dev",
    "/sys",
    "/proc",
]

RAG_DOMAIN = "lady_linux"
RAG_DOMAINS = ("docs", "code", "system-help")


def _normalize(path: str) -> str:
    try:
        return str(Path(path).resolve())
    except Exception:
        return os.path.abspath(path)


def allowed_for_rag(path: str) -> bool:
    """
    Return True when a file belongs to the Lady Linux project scope.

    Rules:
    1) Reject explicit OS/system directories.
    2) Accept files under configured Lady Linux project paths.
    """
    normalized = _normalize(path)
    lower = normalized.lower()

    for blocked in EXCLUDED_RAG_PATHS:
        blocked_norm = _normalize(blocked).lower()
        if lower == blocked_norm or lower.startswith(f"{blocked_norm}{os.sep}") or lower.startswith(f"{blocked_norm}/"):
            return False

    for allowed in ALLOWED_RAG_PATHS:
        allowed_norm = _normalize(allowed).lower()
        if lower == allowed_norm or lower.startswith(f"{allowed_norm}{os.sep}") or lower.startswith(f"{allowed_norm}/"):
            return True

    return False


def is_path_allowed(path: str) -> bool:
    """
    Backward-compatible alias used by older ingest code.
    """
    return allowed_for_rag(path)


def domain_for_path(path: str) -> str:
    """Return the payload domain tag for a given file path.

    Resolution order:
    1) fixed Lady Linux domain for project-scoped chunks
    2) fallback keyword router when callers explicitly request it
    """
    normalized = _normalize(path).lower()
    if allowed_for_rag(path):
        if "/docs/" in normalized or normalized.endswith(".md"):
            return "docs"
        if any(
            token in normalized
            for token in ("/api_layer/", "/rag_layer/", "/app/", "/static/js/", ".py", ".js")
        ):
            return "code"
        return "system-help"
    return detect_domain_from_path(path)


# Backward-compatible alias used by existing seed.py.
ALLOWED_PATHS = ALLOWED_RAG_PATHS
