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
#   "memory" - in-process, wiped on restart (dev/test only, NOT reload-safe)
#   "local"  - embedded on-disk persistence via qdrant-client (default, reload-safe)
#   "server" - remote Qdrant server (Docker / dedicated instance)
QDRANT_MODE = os.getenv("QDRANT_MODE", "local")  # "memory" | "local" | "server"
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_PATH = os.getenv("QDRANT_PATH", "/var/lib/ladylinux/qdrant")
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "ladylinux")

# Embedding model (Ollama)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
# Note: Using /api/embeddings endpoint (compatible with nomic-embed-text)
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
# Increased from 1 MB to 10 MB to support larger log files like kern.log
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(10 * 1024 * 1024)))  # 10 MB

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
            for token in ("/api_layer/", "/core/rag/", "/app/", "/static/js/", ".py", ".js")
        ):
            return "code"
        return "system-help"
    return detect_domain_from_path(path)


# Domain tagging map for system-aware files (used by payload filtering in Qdrant)
# Maps path prefixes to human-readable domain labels for retrieval filtering
DOMAIN_MAP: dict[str, str] = {
    # Firewall domain
    "/etc/ufw/":            "firewall",
    "/etc/iptables/":       "firewall",
    "/etc/nftables/":       "firewall",
    "/var/log/ufw.log":     "firewall",
    "/proc/net/iptables":   "firewall",
    "/proc/net/nf_conntrack": "firewall",

    # Network domain
    "/etc/network/":        "network",
    "/etc/netplan/":        "network",
    "/etc/hostname":        "network",
    "/etc/hosts":           "network",
    "/etc/resolv.conf":     "network",

    # SSH domain
    "/etc/ssh/sshd_config": "ssh",

    # OS domain
    "/etc/systemd/":        "os",
    "/etc/modprobe.d/":     "os",
    "/etc/sysctl":          "os",
    "/var/log/syslog":      "os",
    "/var/log/kern.log":    "os",
    "/var/log/messages":    "os",
    "/var/log/dmesg":       "os",
    "/var/log/secure":      "os",

    # Users domain
    "/var/log/auth.log":    "users",
    "/var/log/fail2ban":    "users",
    "/etc/passwd":          "users",
    "/etc/group":           "users",

    # Package management domain
    "/var/log/apt/":        "packages",
    "/var/log/yum.log":     "packages",
    "/var/log/pacman.log":  "packages",

    # Application domain
    "/var/log/nginx/":      "applications",
    "/var/log/apache2/":    "applications",
    "/var/log/supervisor/": "applications",
}


def get_domain_for_path(path: str) -> str:
    """Return the domain tag for a given system file path."""
    for prefix, domain in DOMAIN_MAP.items():
        if path.startswith(prefix):
            return domain
    return "general"


# ── User-Provided Document Embedding ──────────────────────────────────
# Allows users to upload and embed their own documents/config files
USER_RAG_ENABLED = os.getenv("USER_RAG_ENABLED", "true").lower() == "true"
USER_RAG_PATH = os.getenv("USER_RAG_PATH", "/var/lib/ladylinux/user_uploads")
USER_RAG_MAX_FILE_SIZE = int(os.getenv("USER_RAG_MAX_FILE_SIZE", str(10 * 1024 * 1024)))  # 10 MB per file
USER_RAG_MAX_TOTAL = int(os.getenv("USER_RAG_MAX_TOTAL", str(50 * 1024 * 1024)))  # 50 MB total
USER_RAG_VALID_EXTENSIONS = {
    ".py", ".md", ".txt", ".conf", ".json", ".yaml", ".yml",
    ".service", ".sh", ".ini", ".pdf", ".log", ".csv", ".xml"
}

def user_file_allowed(path: str) -> bool:
    """
    Check if a user-provided file is allowed for embedding.

    Rules:
    1) File must be in USER_RAG_PATH directory (security)
    2) File size must not exceed USER_RAG_MAX_FILE_SIZE
    3) File extension must be in USER_RAG_VALID_EXTENSIONS
    4) Must be a regular file (not directory/symlink)
    """
    if not USER_RAG_ENABLED:
        return False

    # Security: path must be under user uploads directory
    try:
        user_path_norm = os.path.abspath(USER_RAG_PATH)
        file_norm = os.path.abspath(path)

        # Prevent directory traversal attacks
        if not file_norm.startswith(user_path_norm):
            return False
    except (OSError, ValueError):
        return False

    # Check file exists and is regular file
    if not os.path.isfile(path):
        return False

    # Check file size
    try:
        if os.path.getsize(path) > USER_RAG_MAX_FILE_SIZE:
            return False
    except OSError:
        return False

    # Check valid extension
    ext = os.path.splitext(path)[1].lower()
    if ext not in USER_RAG_VALID_EXTENSIONS:
        return False

    return True


# Backward-compatible alias used by existing seed.py.
ALLOWED_PATHS = ALLOWED_RAG_PATHS
